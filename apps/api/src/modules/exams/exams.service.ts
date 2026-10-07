import type { ExamEntity } from './entities/exams.entity.js';
import { Injectable } from '@nestjs/common';
import type pg from 'pg';
import { readConfig } from '../../infrastructure/config.js';
import { createPool, transaction } from '../../infrastructure/db/pool.js';
import { withIdempotency } from '../../infrastructure/http/idempotency.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { recordDeletion } from '../../infrastructure/deletion/deletion-record.js';
import { OperationRepository } from '../../infrastructure/jobs/operations.js';
import { parseExamConfig, validateExamSources } from './exam-config.js';
import type { ExamConfig } from './exam-config.js';
import { toQuestionPublic } from '@study/contracts/exams';

@Injectable()
export class ExamsService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);
  private readonly operations = new OperationRepository(
    readConfig(process.env).databaseUrl,
  );

  async create(ownerId: string, key: string, raw: unknown) {
    const input = parseExamConfig(raw);
    const result = await withIdempotency(
      this.pool,
      { ownerId, route: 'POST /exams', key, body: input },
      async (client) => this.insert(client, ownerId, key, input),
      async (client, id) =>
        (
          await client.query(
            'SELECT 1 FROM exam WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL',
            [ownerId, id],
          )
        ).rowCount !== 0,
    );
    const exam = await this.get(ownerId, result.resourceId);
    return { examId: exam.id, operationId: exam.operationId };
  }

  private async insert(
    client: pg.PoolClient,
    ownerId: string,
    key: string,
    input: ExamConfig,
  ) {
    const conversation = await client.query<{
      id: string;
      title: string;
      version: number;
    }>(
      'SELECT id,title,version FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE',
      [ownerId, input.conversationId],
    );
    const origin = conversation.rows[0];
    if (!origin) {
      throw new PublicError(
        404,
        'CONVERSATION_NOT_FOUND',
        'Conversa não encontrada.',
      );
    }
    const history = await client.query<{
      role: 'user' | 'assistant';
      content: string;
    }>(
      `SELECT role,left(content,900) AS content FROM message
       WHERE owner_id=$1 AND conversation_id=$2 AND state='completed'
       ORDER BY sequence DESC LIMIT 12`,
      [ownerId, input.conversationId],
    );
    if (!history.rows.some((message) => message.role === 'user')) {
      throw new PublicError(
        422,
        'CONVERSATION_EMPTY',
        'Faça uma pergunta nesta conversa antes de criar a prova.',
      );
    }
    const contextSnapshot = {
      title: origin.title,
      version: origin.version,
      messages: history.rows.reverse(),
    };
    const sources = await validateExamSources(
      client,
      ownerId,
      input.conversationId,
      input.materialIds,
    );
    const topics: Array<{ id: string; name: string }> = [];
    for (const name of input.topicNames) {
      const result = await client.query<{ id: string; display_name: string }>(
        `INSERT INTO topic(owner_id,display_name,normalized_name) VALUES ($1,$2,$3)
         ON CONFLICT(owner_id,normalized_name) DO UPDATE SET normalized_name=EXCLUDED.normalized_name RETURNING id,display_name`,
        [ownerId, name, name.toLocaleLowerCase('pt-BR')],
      );
      const topicRow = result.rows[0];
      if (!topicRow) {
        throw new Error('Tema não criado');
      }
      topics.push({ id: topicRow.id, name: topicRow.display_name });
    }
    let originSnapshot: {
      recommendationId: string;
      avoidStatements: string[];
      avoidedStatementHashes: string[];
    } | null = null;
    if (input.originRecommendationId) {
      const rec = await client.query<{
        topic_ids: string[];
        evidence_answer_ids: string[];
        evidence_revision_ids: string[];
        state: string;
      }>(
        'SELECT topic_ids,evidence_answer_ids,evidence_revision_ids,state FROM recommendation WHERE owner_id=$1 AND id=$2 FOR SHARE',
        [ownerId, input.originRecommendationId],
      );
      const recommendation = rec.rows[0];
      if (
        !recommendation ||
        recommendation.state !== 'active' ||
        topics.some((topic) => !recommendation.topic_ids.includes(topic.id))
      ) {
        throw new PublicError(
          409,
          'STALE_EVIDENCE',
          'A recomendação não está mais disponível.',
        );
      }
      const evidence = await client.query<{
        answer_id: string;
        revision_id: string;
        attempt_id: string;
      }>(
        `SELECT a.id AS answer_id,gc.current_revision_id AS revision_id,att.id AS attempt_id
         FROM answer a JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
         JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
         JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
         WHERE a.owner_id=$1 AND a.id=ANY($2::uuid[]) AND gc.state='graded'
           AND att.state='completed' AND att.deleted_at IS NULL AND e.deleted_at IS NULL`,
        [ownerId, recommendation.evidence_answer_ids],
      );
      const revisions = new Map(
        evidence.rows.map((row) => [row.answer_id, row.revision_id]),
      );
      if (
        recommendation.evidence_answer_ids.length !==
          recommendation.evidence_revision_ids.length ||
        recommendation.evidence_answer_ids.some(
          (id, index) =>
            revisions.get(id) !== recommendation.evidence_revision_ids[index],
        )
      ) {
        throw new PublicError(
          409,
          'STALE_EVIDENCE',
          'Os resultados mudaram. Atualize a evolução.',
        );
      }
      const previous = await client.query<{
        statement: string;
        statement_hash: string;
      }>(
        `SELECT DISTINCT q.statement,q.statement_hash FROM question q JOIN attempt att ON att.exam_id=q.exam_id AND att.owner_id=q.owner_id
         WHERE q.owner_id=$1 AND att.id=ANY($2::uuid[])`,
        [ownerId, [...new Set(evidence.rows.map((row) => row.attempt_id))]],
      );
      originSnapshot = {
        recommendationId: input.originRecommendationId,
        avoidStatements: previous.rows.map((row) => row.statement),
        avoidedStatementHashes: previous.rows.map((row) => row.statement_hash),
      };
      contextSnapshot.messages.push({
        role: 'user',
        content: `Nova prática ${input.originRecommendationId}. Crie novas questões para ${input.topicNames.join(', ')} sem repetir literalmente questões anteriores.`,
      });
    }
    const created = await client.query<{ id: string }>(
      `INSERT INTO exam(owner_id,title,study_level,total,objective_count,essay_count,state,source_recommendation_id,conversation_id,context_snapshot,origin_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,$8,$9::jsonb,$10::jsonb) RETURNING id`,
      [
        ownerId,
        input.topicNames.join(', ').slice(0, 120),
        input.studyLevel,
        input.total,
        input.objectiveCount,
        input.essayCount,
        input.originRecommendationId ?? null,
        input.conversationId,
        JSON.stringify(contextSnapshot),
        originSnapshot ? JSON.stringify(originSnapshot) : null,
      ],
    );
    const id = created.rows[0]?.id;
    if (!id) {
      throw new Error('Prova não criada');
    }
    const base = Math.floor(input.total / topics.length);
    const remainder = input.total % topics.length;
    for (const [index, topic] of topics.entries()) {
      await client.query(
        'INSERT INTO exam_topic(owner_id,exam_id,topic_id,requested_count,ordinal) VALUES ($1,$2,$3,$4,$5)',
        [ownerId, id, topic.id, base + (index < remainder ? 1 : 0), index + 1],
      );
    }
    for (const source of sources) {
      await client.query(
        'INSERT INTO exam_source(owner_id,exam_id,material_id,material_version,name_snapshot) VALUES ($1,$2,$3,$4,$5)',
        [ownerId, id, source.id, source.version, source.name],
      );
    }
    const operationId = await this.operations.create(client, {
      ownerId,
      resourceId: id,
      kind: 'generate-exam',
      dedupeKey: key,
      inputVersion: 1,
    });
    await client.query(
      'UPDATE exam SET generation_operation_id=$2 WHERE id=$1',
      [id, operationId],
    );
    return { resourceId: id, status: 202 };
  }

  async get(ownerId: string, id: string) {
    const result = await this.pool.query<ExamEntity>(
      `SELECT id,title,study_level,total,objective_count,essay_count,state,generation_operation_id,conversation_id,context_snapshot,created_at,
       (SELECT a.id FROM attempt a WHERE a.exam_id=exam.id AND a.owner_id=exam.owner_id AND a.deleted_at IS NULL) AS attempt_id
       FROM exam WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL`,
      [ownerId, id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new PublicError(404, 'NOT_FOUND', 'Prova não encontrada.');
    }
    const questions =
      row.state === 'ready'
        ? await this.pool.query<{
            id: string;
            ordinal: number;
            type: 'objective' | 'essay';
            topic: string;
            study_level_snapshot: string;
            statement: string;
            alternatives: unknown;
          }>(
            `SELECT q.id,q.ordinal,q.type,t.display_name AS topic,q.study_level_snapshot,q.statement,q.alternatives
       FROM question q JOIN topic t ON t.id=q.topic_id AND t.owner_id=q.owner_id
       WHERE q.owner_id=$1 AND q.exam_id=$2 ORDER BY q.ordinal`,
            [ownerId, id],
          )
        : null;
    return {
      id: row.id,
      title: row.title,
      studyLevel: row.study_level,
      total: row.total,
      objectiveCount: row.objective_count,
      essayCount: row.essay_count,
      state: row.state,
      operationId: row.generation_operation_id,
      conversationId: row.conversation_id,
      conversationTitle: row.context_snapshot?.title ?? null,
      createdAt: row.created_at,
      attemptId: row.attempt_id ?? null,
      questions:
        questions?.rows.map((question) =>
          toQuestionPublic({
            id: question.id,
            ordinal: question.ordinal,
            type: question.type,
            topic: question.topic,
            studyLevel: question.study_level_snapshot,
            statement: question.statement,
            ...(question.type === 'objective'
              ? { alternatives: question.alternatives }
              : {}),
          }),
        ) ?? [],
    };
  }

  async list(ownerId: string) {
    const result = await this.pool.query<ExamEntity>(
      'SELECT id,title,study_level,total,objective_count,essay_count,state,generation_operation_id,conversation_id,context_snapshot,created_at FROM exam WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 20',
      [ownerId],
    );
    return {
      items: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        studyLevel: row.study_level,
        total: row.total,
        state: row.state,
        operationId: row.generation_operation_id,
        conversationId: row.conversation_id,
        conversationTitle: row.context_snapshot?.title ?? null,
        createdAt: row.created_at,
      })),
      nextCursor: null,
    };
  }

  async delete(ownerId: string, id: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        'UPDATE exam SET deleted_at=now() WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id',
        [ownerId, id],
      );
      if (!result.rowCount) {
        throw new PublicError(404, 'NOT_FOUND', 'Prova não encontrada.');
      }
      await recordDeletion(client, ownerId, 'exam', id);
      await client.query(
        "UPDATE operation SET state='cancelled',fence_version=fence_version+1,lease_until=NULL WHERE owner_id=$1 AND resource_id=$2 AND kind='generate-exam' AND state IN ('pending','running')",
        [ownerId, id],
      );
    });
  }
}
