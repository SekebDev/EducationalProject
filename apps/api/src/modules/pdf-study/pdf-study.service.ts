import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type pg from 'pg';
import { studyEditorStateSchema, validateStudyState } from '@study/contracts';
import type {
  PdfStudy,
  StudyEditorState,
  StudyChange,
  StudyQuestion,
  StudyPage,
  StudyTurn,
} from '@study/contracts';
import { readConfig } from '../../infrastructure/config.js';
import { createPool, transaction } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { MaterialStorage } from '../../infrastructure/storage/material-storage.js';
import { originalStudyPages, studyPageBlocks } from './pdf-context.js';
import { exportStudyPdf } from './export.js';
import { explainPdf } from './tutor.js';
import { applyTutorPlan } from './tutor-layout.js';
import { retrieveChunks } from '../materials/retrieval.js';
import { studyRequestRedirect } from '../../infrastructure/ai/study-chat-policy.js';
import {
  assertPdfContextUnchanged,
  pdfConversationTeaching,
  pdfPageReferenceChunks,
  readPdfConversationContext,
  savePdfConversationTurn,
} from './conversation-context.js';

type Row = {
  material_id: string;
  owner_id: string;
  revision: number;
  editor_state: StudyEditorState;
  original_name: string;
  conversation_id: string;
};
type HistoryRequest = {
  operationId: string;
  baseRevision: number;
  direction: 'undo' | 'redo';
};
type TutorEvent =
  | { type: 'delta'; text: string }
  | {
      type: 'complete';
      study: PdfStudy;
      annotationIds: string[];
      pageIds: string[];
    };
const hash = (body: unknown) =>
  createHash('sha256').update(JSON.stringify(body)).digest('hex');

@Injectable()
export class PdfStudyService implements OnModuleDestroy {
  private readonly config = readConfig(process.env);
  private readonly pool = createPool(this.config.databaseUrl);
  private readonly storage = new MaterialStorage(this.pool, this.config);
  async onModuleDestroy() {
    await this.pool.end();
  }

  async list(ownerId: string) {
    const rows = await this.pool.query(
      `SELECT m.id,m.original_name AS title,m.conversation_id AS "conversationId",m.state,m.created_at AS "createdAt",
        s.revision,s.updated_at AS "updatedAt" FROM material m
       JOIN conversation c ON c.owner_id=m.owner_id AND c.id=m.conversation_id
       LEFT JOIN pdf_study s ON s.owner_id=m.owner_id AND s.material_id=m.id
       WHERE m.owner_id=$1 AND m.detected_mime='application/pdf' AND m.deleted_at IS NULL AND c.deleted_at IS NULL
       ORDER BY COALESCE(s.updated_at,m.created_at) DESC LIMIT 100`,
      [ownerId],
    );
    return { items: rows.rows };
  }

  private async material(ownerId: string, materialId: string) {
    const found = await this.pool.query<{ original_name: string }>(
      `SELECT m.original_name FROM material m JOIN conversation c ON c.owner_id=m.owner_id AND c.id=m.conversation_id
       WHERE m.owner_id=$1 AND m.id=$2 AND m.detected_mime='application/pdf' AND m.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [ownerId, materialId],
    );
    if (!found.rowCount) {
      throw new PublicError(404, 'NOT_FOUND', 'PDF não encontrado.');
    }
  }

  async open(ownerId: string, materialId: string): Promise<PdfStudy> {
    await this.material(ownerId, materialId);
    const exists = await this.pool.query(
      'SELECT 1 FROM pdf_study WHERE owner_id=$1 AND material_id=$2',
      [ownerId, materialId],
    );
    if (!exists.rowCount) {
      const pages = await originalStudyPages(
        await this.storage.read(ownerId, materialId),
      );
      const state = studyEditorStateSchema.parse({ pages, annotations: [] });
      await this.pool.query(
        `INSERT INTO pdf_study(material_id,owner_id,editor_state)
         SELECT m.id,m.owner_id,$3::jsonb FROM material m JOIN conversation c ON c.owner_id=m.owner_id AND c.id=m.conversation_id
         WHERE m.owner_id=$1 AND m.id=$2 AND m.deleted_at IS NULL AND c.deleted_at IS NULL
         ON CONFLICT(material_id) DO NOTHING`,
        [ownerId, materialId, JSON.stringify(state)],
      );
    }
    return this.get(ownerId, materialId);
  }

  private async row(
    db: pg.Pool | pg.PoolClient,
    ownerId: string,
    materialId: string,
    lock = false,
  ): Promise<Row> {
    // All study mutations acquire the conversation first, matching chat/delete lock order.
    if (lock) {
      await db.query(
        `SELECT c.id FROM conversation c JOIN material m ON m.owner_id=c.owner_id AND m.conversation_id=c.id
         WHERE c.owner_id=$1 AND m.id=$2 AND c.deleted_at IS NULL AND m.deleted_at IS NULL FOR SHARE OF c`,
        [ownerId, materialId],
      );
    }
    const result = await db.query<Row>(
      `SELECT s.*,m.original_name,m.conversation_id FROM pdf_study s
       JOIN material m ON m.owner_id=s.owner_id AND m.id=s.material_id
       JOIN conversation c ON c.owner_id=m.owner_id AND c.id=m.conversation_id
       WHERE s.owner_id=$1 AND s.material_id=$2 AND m.deleted_at IS NULL AND c.deleted_at IS NULL
       ${lock ? 'FOR UPDATE OF s FOR SHARE OF m,c' : ''}`,
      [ownerId, materialId],
    );
    if (!result.rows[0]) {
      throw new PublicError(404, 'NOT_FOUND', 'Caderno não encontrado.');
    }
    return {
      ...result.rows[0],
      editor_state: studyEditorStateSchema.parse(result.rows[0].editor_state),
    };
  }

  async get(ownerId: string, materialId: string): Promise<PdfStudy> {
    return transaction(this.pool, async (client) =>
      this.view(client, await this.row(client, ownerId, materialId, true)),
    );
  }

  private async view(db: pg.PoolClient, row: Row): Promise<PdfStudy> {
    const history = await db.query<{ can_undo: boolean; can_redo: boolean }>(
      `SELECT coalesce(bool_or(NOT undone),false) AS can_undo,coalesce(bool_or(undone),false) AS can_redo
       FROM pdf_study_operation WHERE material_id=$1 AND before_state IS NOT NULL`,
      [row.material_id],
    );
    const turns = await db.query<StudyTurn>(
      `SELECT id,role,content,page_id AS "pageId",basis,cited_page_ids AS "citedPageIds",created_at AS "createdAt",explanation_id AS "explanationId"
       FROM (SELECT * FROM pdf_study_turn WHERE material_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100) t
       ORDER BY created_at,CASE role WHEN 'user' THEN 0 ELSE 1 END,id`,
      [row.material_id],
    );
    return {
      materialId: row.material_id,
      ownerId: row.owner_id,
      title: row.original_name,
      conversationId: row.conversation_id,
      revision: row.revision,
      state: row.editor_state,
      turns: turns.rows,
      canUndo: history.rows[0]!.can_undo,
      canRedo: history.rows[0]!.can_redo,
      demo: this.config.aiProvider === 'fake',
    };
  }

  private async replay<T>(
    client: pg.PoolClient,
    materialId: string,
    operationId: string,
    body: unknown,
  ): Promise<T | null> {
    const previous = await client.query<{ request_hash: string; response: T }>(
      'SELECT request_hash,response FROM pdf_study_operation WHERE material_id=$1 AND operation_id=$2',
      [materialId, operationId],
    );
    if (!previous.rows[0]) {
      return null;
    }
    if (previous.rows[0].request_hash !== hash(body)) {
      throw new PublicError(
        409,
        'OPERATION_REUSED',
        'Esta operação já foi usada com outro conteúdo.',
      );
    }
    if (previous.rows[0].response === null) {
      throw new PublicError(
        409,
        'OPERATION_EXPIRED',
        'Esta operação é antiga. Reabra a versão atual do caderno.',
      );
    }
    return previous.rows[0].response;
  }

  private revision(row: Row, expected: number) {
    if (row.revision !== expected) {
      throw new PublicError(
        409,
        'STUDY_REVISION_CONFLICT',
        'O caderno mudou em outra aba. Seu rascunho foi preservado; reabra a versão salva antes de continuar.',
      );
    }
  }

  private check(state: StudyEditorState, originals: StudyPage[]) {
    const parsed = studyEditorStateSchema.safeParse(state);
    const error = parsed.success
      ? validateStudyState(parsed.data, originals)
      : 'O caderno excede os limites de páginas, desenhos ou texto.';
    if (error) {
      throw new PublicError(422, 'STUDY_STATE_INVALID', error);
    }
  }

  private async commit(
    client: pg.PoolClient,
    row: Row,
    operationId: string,
    body: unknown,
    state: StudyEditorState,
    kind: 'edit' | 'tutor' | 'undo' | 'redo',
    extras?: { annotationIds: string[]; pageIds: string[] },
  ) {
    this.check(
      state,
      row.editor_state.pages.filter((page) => page.kind === 'original'),
    );
    const revision = row.revision + 1;
    if (kind === 'edit' || kind === 'tutor') {
      await client.query(
        'UPDATE pdf_study_operation SET before_state=NULL,after_state=NULL WHERE material_id=$1 AND undone=true',
        [row.material_id],
      );
    }
    await client.query(
      'UPDATE pdf_study SET editor_state=$3::jsonb,revision=$4,updated_at=now() WHERE owner_id=$1 AND material_id=$2',
      [row.owner_id, row.material_id, JSON.stringify(state), revision],
    );
    await client.query(
      `INSERT INTO pdf_study_operation(material_id,operation_id,request_hash,revision,before_state,after_state,kind,response)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,'{}')`,
      [
        row.material_id,
        operationId,
        hash(body),
        revision,
        kind === 'edit' || kind === 'tutor'
          ? JSON.stringify(row.editor_state)
          : null,
        kind === 'edit' || kind === 'tutor' ? JSON.stringify(state) : null,
        kind,
      ],
    );
    // Preserve idempotency records while bounding full undo/redo snapshots.
    await client.query(
      `UPDATE pdf_study_operation SET before_state=NULL,after_state=NULL WHERE material_id=$1 AND before_state IS NOT NULL AND revision NOT IN (SELECT revision FROM pdf_study_operation WHERE material_id=$1 AND before_state IS NOT NULL ORDER BY revision DESC LIMIT 30)`,
      [row.material_id],
    );
    const study = await this.view(client, {
      ...row,
      revision,
      editor_state: state,
    });
    const response = extras ? { study, ...extras } : study;
    await client.query(
      'UPDATE pdf_study_operation SET response=$3::jsonb WHERE material_id=$1 AND operation_id=$2',
      [row.material_id, operationId, JSON.stringify(response)],
    );
    await client.query(
      `UPDATE pdf_study_operation SET response='null'::jsonb
       WHERE material_id=$1 AND revision <= $2-30 AND response <> 'null'::jsonb`,
      [row.material_id, revision],
    );
    return response;
  }

  async change(
    ownerId: string,
    materialId: string,
    body: StudyChange,
  ): Promise<PdfStudy> {
    return transaction(this.pool, async (client) => {
      const row = await this.row(client, ownerId, materialId, true);
      const replay = await this.replay<PdfStudy>(
        client,
        materialId,
        body.operationId,
        body,
      );
      if (replay) {
        return replay;
      }
      this.revision(row, body.baseRevision);
      return (await this.commit(
        client,
        row,
        body.operationId,
        body,
        body.state,
        'edit',
      )) as PdfStudy;
    });
  }

  async history(
    ownerId: string,
    materialId: string,
    body: HistoryRequest,
  ): Promise<PdfStudy> {
    return transaction(this.pool, async (client) => {
      const row = await this.row(client, ownerId, materialId, true);
      const replay = await this.replay<PdfStudy>(
        client,
        materialId,
        body.operationId,
        body,
      );
      if (replay) {
        return replay;
      }
      this.revision(row, body.baseRevision);
      const undo = body.direction === 'undo';
      const found = await client.query<{
        operation_id: string;
        before_state: StudyEditorState;
        after_state: StudyEditorState;
      }>(
        `SELECT operation_id,before_state,after_state FROM pdf_study_operation WHERE material_id=$1 AND before_state IS NOT NULL AND undone=$2 ORDER BY revision ${undo ? 'DESC' : 'ASC'} LIMIT 1`,
        [materialId, !undo],
      );
      const operation = found.rows[0];
      if (!operation) {
        throw new PublicError(
          409,
          'STUDY_HISTORY_EMPTY',
          'Não há ação para desfazer ou refazer.',
        );
      }
      await client.query(
        'UPDATE pdf_study_operation SET undone=$3 WHERE material_id=$1 AND operation_id=$2',
        [materialId, operation.operation_id, undo],
      );
      const state = studyEditorStateSchema.parse(
        undo ? operation.before_state : operation.after_state,
      );
      return (await this.commit(
        client,
        row,
        body.operationId,
        body,
        state,
        undo ? 'undo' : 'redo',
      )) as PdfStudy;
    });
  }

  async tutor(
    ownerId: string,
    materialId: string,
    body: StudyQuestion,
    emit: (event: TutorEvent) => void,
    signal: AbortSignal,
  ) {
    const lease = await this.pool.connect();
    const lockKey = `pdf-tutor:${ownerId}`;
    let locked = false;
    let conversationLockKey: string | null = null;
    try {
      locked = (
        await lease.query<{ locked: boolean }>(
          'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
          [lockKey],
        )
      ).rows[0]!.locked;
      if (!locked) {
        throw new PublicError(
          429,
          'TUTOR_BUSY',
          'Aguarde a explicação atual terminar.',
        );
      }
      const previous = await studyTransaction(lease, async (client) => {
        const row = await this.row(client, ownerId, materialId, true);
        const replay = await this.replay<{
          study: PdfStudy;
          annotationIds: string[];
          pageIds: string[];
        }>(client, materialId, body.operationId, body);
        if (replay) {
          return { replay, row, context: null };
        }
        this.revision(row, body.baseRevision);
        const key = `conversation-turn:${ownerId}:${row.conversation_id}`;
        const acquired = await client.query<{ locked: boolean }>(
          'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
          [key],
        );
        if (!acquired.rows[0]!.locked) {
          throw new PublicError(
            409,
            'TURN_IN_PROGRESS',
            'A resposta desta conversa ainda está em andamento.',
          );
        }
        conversationLockKey = key;
        const context = await readPdfConversationContext(
          client,
          ownerId,
          row.conversation_id,
          materialId,
        );
        return { replay: null, row, context };
      });
      if (previous.replay) {
        emit({ type: 'complete', ...previous.replay });
        return;
      }
      const page = previous.row.editor_state.pages.find(
        (item) => item.id === body.pageId,
      );
      if (!page) {
        throw new PublicError(
          422,
          'STUDY_PAGE_INVALID',
          'Página não encontrada no caderno.',
        );
      }
      if (
        body.selection?.rects.some(
          (rect) =>
            rect.x + rect.width > page.width ||
            rect.y + rect.height > page.height,
        )
      ) {
        throw new PublicError(
          422,
          'STUDY_SELECTION_INVALID',
          'Seleção fora da página.',
        );
      }
      const blocks = await studyPageBlocks(
        await new MaterialStorage(lease, this.config).read(ownerId, materialId),
        page,
        previous.row.editor_state,
      );
      if (blocks.length === 0 && body.image) {
        blocks.push({
          id: `${page.id}:visual`,
          text: '[Página digitalizada: interpretação visual]',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        });
      }
      const count = await lease.query<{ total: string }>(
        `SELECT count(*) AS total FROM pdf_tutor_attempt WHERE owner_id=$1 AND created_at>now()-interval '24 hours'`,
        [ownerId],
      );
      if (Number(count.rows[0]!.total) >= 100) {
        throw new PublicError(
          429,
          'TUTOR_DAILY_LIMIT',
          'Você chegou ao limite de 100 solicitações ao tutor em 24 horas.',
        );
      }
      await lease.query(
        'INSERT INTO pdf_tutor_attempt(owner_id,material_id,operation_id) VALUES ($1,$2,$3)',
        [ownerId, materialId, body.operationId],
      );
      let plan;
      let sources: Awaited<ReturnType<typeof retrieveChunks>> = [];
      const sourcePage =
        page.kind === 'original'
          ? page
          : previous.row.editor_state.pages.find(
              (candidate) => candidate.id === page.sourcePageId,
            );
      const pageChunks = await pdfPageReferenceChunks(
        lease,
        ownerId,
        materialId,
        sourcePage?.sourcePageIndex ?? null,
      );
      try {
        signal.throwIfAborted();
        sources = studyRequestRedirect(body.question)
          ? []
          : await retrieveChunks(
              ownerId,
              previous.row.conversation_id,
              previous.context!.sources,
              body.question,
              8,
              signal,
            );
        signal.throwIfAborted();
        plan = await explainPdf(
          {
            question: body.question,
            page,
            blocks,
            selection: body.selection,
            image: body.image,
            history: previous.context!.history,
            sources,
            ...pdfConversationTeaching(previous.context!),
            config: this.config,
          },
          (text) => emit({ type: 'delta', text }),
          signal,
        );
      } catch (cause) {
        if (signal.aborted) {
          throw cause;
        }
        throw new PublicError(
          503,
          'TUTOR_UNAVAILABLE',
          'Não foi possível concluir a explicação. Nenhum desenho parcial foi salvo. Tente novamente.',
          true,
        );
      }
      signal.throwIfAborted();
      const explanationId = body.operationId;
      const applied = applyTutorPlan(
        previous.row.editor_state,
        page.id,
        body.selection,
        plan,
        explanationId,
      );
      const result = await studyTransaction(lease, async (client) => {
        signal.throwIfAborted();
        const context = await readPdfConversationContext(
          client,
          ownerId,
          previous.row.conversation_id,
          materialId,
          true,
        );
        assertPdfContextUnchanged(previous.context!, context);
        const row = await this.row(client, ownerId, materialId, true);
        signal.throwIfAborted();
        this.revision(row, body.baseRevision);
        await savePdfConversationTurn(client, {
          ownerId,
          conversationId: row.conversation_id,
          materialId,
          page,
          explanationId,
          question: body.question,
          context,
          plan,
          sources,
          pageChunks,
          model:
            this.config.aiProvider === 'fake'
              ? 'fake'
              : process.env.OPENAI_PDF_TUTOR_MODEL?.trim() ||
                process.env.OPENAI_CHAT_MODEL?.trim() ||
                'gpt-6-luna',
        });
        const committed = await this.commit(
          client,
          row,
          body.operationId,
          body,
          applied.state,
          'tutor',
          { annotationIds: applied.annotationIds, pageIds: applied.pageIds },
        );
        signal.throwIfAborted();
        return committed;
      });
      emit({
        type: 'complete',
        ...(result as {
          study: PdfStudy;
          annotationIds: string[];
          pageIds: string[];
        }),
      });
    } finally {
      let releaseError: Error | undefined;
      try {
        try {
          if (conversationLockKey) {
            await lease.query(
              'SELECT pg_advisory_unlock(hashtextextended($1,0))',
              [conversationLockKey],
            );
          }
        } finally {
          if (locked) {
            await lease.query(
              'SELECT pg_advisory_unlock(hashtextextended($1,0))',
              [lockKey],
            );
          }
        }
      } catch (error) {
        releaseError =
          error instanceof Error
            ? error
            : new Error('CONVERSATION_LOCK_RELEASE_FAILED');
      } finally {
        lease.release(releaseError);
      }
    }
  }

  async export(ownerId: string, materialId: string, revision: number) {
    const study = await this.get(ownerId, materialId);
    if (revision !== study.revision) {
      throw new PublicError(
        409,
        'STUDY_REVISION_CONFLICT',
        'Salve e atualize o caderno antes de exportar.',
      );
    }
    const bytes = await exportStudyPdf(
      await this.storage.read(ownerId, materialId),
      study.state,
    );
    await this.material(ownerId, materialId);
    return {
      bytes,
      title: study.title.replace(/\.pdf$/iu, '') + '-estudo.pdf',
    };
  }
}

// The generation lease also supplies the DB connection. Acquiring a second
// connection here can deadlock when all pool slots hold concurrent tutors.
async function studyTransaction<T>(
  client: pg.PoolClient,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
