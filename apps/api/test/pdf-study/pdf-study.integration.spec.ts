import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import type {
  PdfStudy,
  StudyAnnotation,
  StudyEditorState,
} from '@study/contracts';
import { createPool } from '../../src/infrastructure/db/pool.js';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { readConfig } from '../../src/infrastructure/config.js';
import {
  MaterialStorage,
  objectKey,
} from '../../src/infrastructure/storage/material-storage.js';
import { PdfStudyService } from '../../src/modules/pdf-study/pdf-study.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
type Fixture = {
  owner: string;
  other: string;
  chat: string;
  material: string;
  pool: pg.Pool;
  service: PdfStudyService;
};

async function withFixture(run: (fixture: Fixture) => Promise<void>) {
  const pool = createPool(databaseUrl!);
  const owner = randomUUID();
  const other = randomUUID();
  const chat = randomUUID();
  const material = randomUUID();
  const service = new PdfStudyService();
  const storage = new MaterialStorage(pool, readConfig(process.env));
  try {
    for (const id of [owner, other]) {
      await pool.query(
        'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
        [id, `${id}@example.invalid`, 'hash'],
      );
    }
    await pool.query(
      "INSERT INTO conversation(id,owner_id,title,personality_key) VALUES ($1,$2,'PDF integration fixture','objetiva')",
      [chat, owner],
    );
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let index = 1; index <= 2; index++) {
      pdf
        .addPage([595, 842])
        .drawText(`Material do professor, pagina ${index}`, {
          x: 60,
          y: 700,
          font,
        });
    }
    const bytes = await pdf.save();
    await pool.query(
      "INSERT INTO material(id,owner_id,conversation_id,original_name,detected_mime,byte_size,checksum,object_key,state) VALUES ($1,$2,$3,'professor.pdf','application/pdf',$4,$5,$6,'ready')",
      [
        material,
        owner,
        chat,
        bytes.byteLength,
        createHash('sha256').update(bytes).digest('hex'),
        objectKey(owner, material),
      ],
    );
    await storage.put(owner, material, bytes);
    await run({ owner, other, chat, material, pool, service });
  } finally {
    await service.onModuleDestroy();
    await storage.purge(objectKey(owner, material));
    await pool.query('DELETE FROM material WHERE id=$1', [material]);
    await pool.query(
      'DELETE FROM message WHERE owner_id=$1 AND conversation_id=$2',
      [owner, chat],
    );
    await pool.query('DELETE FROM pdf_tutor_attempt WHERE owner_id=$1', [
      owner,
    ]);
    await pool.query('DELETE FROM conversation WHERE id=$1', [chat]);
    await pool.query('DELETE FROM student WHERE id=ANY($1::uuid[])', [
      [owner, other],
    ]);
    await pool.end();
  }
}

function drawing(
  study: PdfStudy,
  text = 'Anotação persistida',
): StudyAnnotation {
  return {
    id: randomUUID(),
    pageId: study.state.pages[0]!.id,
    kind: 'note',
    x: 80,
    y: 180,
    width: 420,
    height: 100,
    points: [],
    text,
    color: '#326a53',
    strokeWidth: 2,
    fontSize: 14,
    author: 'student',
    explanationId: null,
  };
}

describe.skipIf(!databaseUrl)('PDF study persistence and ownership', () => {
  let storageRoot = '';
  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const parent = resolve('test-results');
    await mkdir(parent, { recursive: true });
    storageRoot = await mkdtemp(join(parent, 'pdf-study-integration-'));
    for (const [key, value] of Object.entries({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-pdf-study-12345678901234567890',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'study@example.invalid',
      AI_PROVIDER: 'fake',
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_PATH: storageRoot,
    })) {
      vi.stubEnv(key, value);
    }
  });
  afterAll(async () => {
    if (storageRoot) {
      const subpath = relative(resolve('test-results'), resolve(storageRoot));
      if (
        !subpath ||
        subpath.startsWith('..') ||
        resolve(storageRoot) === resolve('test-results')
      ) {
        throw new Error('Refusing unsafe integration storage cleanup');
      }
      await rm(storageRoot, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  it('reopens the same stable pages and durable annotations after recreating the service', async () => {
    await withFixture(async ({ owner, material, service }) => {
      const first = await service.open(owner, material);
      const second = await service.open(owner, material);
      expect(second.state).toEqual(first.state);
      const annotation = drawing(first);
      const changed = await service.change(owner, material, {
        operationId: randomUUID(),
        baseRevision: first.revision,
        state: { ...first.state, annotations: [annotation] },
      });
      const reopenedService = new PdfStudyService();
      try {
        const reopened = await reopenedService.open(owner, material);
        expect(reopened.revision).toBe(changed.revision);
        expect(reopened.state).toEqual(changed.state);
        expect(reopened.state.annotations[0]).toEqual(annotation);
      } finally {
        await reopenedService.onModuleDestroy();
      }
    });
  });

  it('checks ownership for every action and hides deleted materials and conversations', async () => {
    await withFixture(
      async ({ owner, other, material, chat, service, pool }) => {
        const study = await service.open(owner, material);
        expect((await service.list(other)).items).toEqual([]);
        for (const request of [
          () => service.open(other, material),
          () => service.get(other, material),
          () =>
            service.change(other, material, {
              operationId: randomUUID(),
              baseRevision: 0,
              state: study.state,
            }),
          () =>
            service.history(other, material, {
              operationId: randomUUID(),
              baseRevision: 0,
              direction: 'undo',
            }),
          () => service.export(other, material, 0),
          () =>
            service.tutor(
              other,
              material,
              {
                operationId: randomUUID(),
                baseRevision: 0,
                pageId: study.state.pages[0]!.id,
                question: 'Explique',
                image: null,
                selection: null,
              },
              () => {},
              new AbortController().signal,
            ),
        ]) {
          await expect(request()).rejects.toMatchObject({
            status: 404,
            code: 'NOT_FOUND',
          });
        }
        await pool.query('UPDATE material SET deleted_at=now() WHERE id=$1', [
          material,
        ]);
        await expect(service.get(owner, material)).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
        await pool.query('UPDATE material SET deleted_at=NULL WHERE id=$1', [
          material,
        ]);
        await pool.query(
          'UPDATE conversation SET deleted_at=now() WHERE id=$1',
          [chat],
        );
        await expect(service.open(owner, material)).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
        expect((await service.list(owner)).items).toEqual([]);
      },
    );
  });

  it('rejects stale edits, mutations to immutable originals, and forged source IDs', async () => {
    await withFixture(async ({ owner, material, service }) => {
      const study = await service.open(owner, material);
      const request = {
        operationId: randomUUID(),
        baseRevision: 0,
        state: { ...study.state, annotations: [drawing(study)] },
      };
      const saved = await service.change(owner, material, request);
      await expect(
        service.change(owner, material, {
          ...request,
          operationId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'STUDY_REVISION_CONFLICT' });
      const invalidStates: StudyEditorState[] = [
        {
          ...saved.state,
          pages: saved.state.pages.map((page, index) =>
            index === 0 ? { ...page, width: page.width + 1 } : page,
          ),
        },
        {
          ...saved.state,
          pages: saved.state.pages.map((page, index) =>
            index === 0 ? { ...page, id: randomUUID() } : page,
          ),
        },
        {
          ...saved.state,
          pages: [
            ...saved.state.pages,
            {
              ...saved.state.pages[0]!,
              id: randomUUID(),
              kind: 'tutor',
              sourcePageIndex: null,
              sourcePageId: randomUUID(),
            },
          ],
        },
        {
          ...saved.state,
          annotations: [{ ...saved.state.annotations[0]!, x: 590 }],
        },
      ];
      for (const state of invalidStates) {
        await expect(
          service.change(owner, material, {
            operationId: randomUUID(),
            baseRevision: saved.revision,
            state,
          }),
        ).rejects.toMatchObject({ code: 'STUDY_STATE_INVALID' });
      }
      expect((await service.get(owner, material)).revision).toBe(
        saved.revision,
      );
    });
  });

  it('replays identical requests once and rejects changed content with the same operation', async () => {
    await withFixture(async ({ owner, material, service, pool }) => {
      const study = await service.open(owner, material);
      const request = {
        operationId: randomUUID(),
        baseRevision: 0,
        state: { ...study.state, annotations: [drawing(study)] },
      };
      const first = await service.change(owner, material, request);
      const replay = await service.change(owner, material, request);
      expect(replay.state).toEqual(first.state);
      expect(replay.revision).toBe(first.revision);
      await expect(
        service.change(owner, material, {
          ...request,
          state: { ...request.state, annotations: [] },
        }),
      ).rejects.toMatchObject({ code: 'OPERATION_REUSED' });
      const records = await pool.query(
        'SELECT count(*)::int AS total FROM pdf_study_operation WHERE material_id=$1',
        [material],
      );
      expect(records.rows[0].total).toBe(1);
      await expect(service.export(owner, material, 0)).rejects.toMatchObject({
        code: 'STUDY_REVISION_CONFLICT',
      });
      const exported = await service.export(owner, material, first.revision);
      expect(exported.bytes.byteLength).toBeGreaterThan(100);
      expect(exported.title).toBe('professor-estudo.pdf');
    });
  });

  it('undoes and redoes whole edits and invalidates redo when a new edit branches', async () => {
    await withFixture(async ({ owner, material, service }) => {
      let study = await service.open(owner, material);
      const firstNote = drawing(study, 'Primeira');
      study = await service.change(owner, material, {
        operationId: randomUUID(),
        baseRevision: study.revision,
        state: { ...study.state, annotations: [firstNote] },
      });
      const secondNote = drawing(study, 'Segunda');
      study = await service.change(owner, material, {
        operationId: randomUUID(),
        baseRevision: study.revision,
        state: { ...study.state, annotations: [firstNote, secondNote] },
      });
      const undoRequest = {
        operationId: randomUUID(),
        baseRevision: study.revision,
        direction: 'undo' as const,
      };
      study = await service.history(owner, material, undoRequest);
      expect(study.state.annotations).toEqual([firstNote]);
      expect(study.canRedo).toBe(true);
      expect(
        (await service.history(owner, material, undoRequest)).revision,
      ).toBe(study.revision);
      study = await service.history(owner, material, {
        operationId: randomUUID(),
        baseRevision: study.revision,
        direction: 'redo',
      });
      expect(study.state.annotations).toEqual([firstNote, secondNote]);
      study = await service.history(owner, material, {
        operationId: randomUUID(),
        baseRevision: study.revision,
        direction: 'undo',
      });
      study = await service.change(owner, material, {
        operationId: randomUUID(),
        baseRevision: study.revision,
        state: {
          ...study.state,
          annotations: [firstNote, drawing(study, 'Novo caminho')],
        },
      });
      expect(study.canRedo).toBe(false);
      await expect(
        service.history(owner, material, {
          operationId: randomUUID(),
          baseRevision: study.revision,
          direction: 'redo',
        }),
      ).rejects.toMatchObject({ code: 'STUDY_HISTORY_EMPTY' });
    });
  });

  it('persists complete tutor turns once, restores notes by undo-redo and bounds full history snapshots', async () => {
    await withFixture(async ({ owner, material, service, pool }) => {
      let study = await service.open(owner, material);
      const question = {
        operationId: randomUUID(),
        baseRevision: 0,
        pageId: study.state.pages[0]!.id,
        question: 'Explique esta página',
        image: null,
        selection: null,
      };
      const events: Array<{ type: string }> = [];
      await service.tutor(
        owner,
        material,
        question,
        (event) => events.push(event),
        new AbortController().signal,
      );
      study = await service.get(owner, material);
      expect(study.turns).toHaveLength(2);
      expect(study.turns.map((turn) => turn.role)).toEqual([
        'user',
        'assistant',
      ]);
      expect(study.state.pages).toHaveLength(3);
      expect(study.turns[1]!.basis).toBe('unsupported');
      expect(events.map((event) => event.type)).toEqual(['delta', 'complete']);
      await service.tutor(
        owner,
        material,
        question,
        () => {},
        new AbortController().signal,
      );
      await expect(
        service.tutor(
          owner,
          material,
          { ...question, question: 'Pergunta alterada' },
          () => {},
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'OPERATION_REUSED' });
      const replay = await service.get(owner, material);
      expect(replay.revision).toBe(study.revision);
      expect(replay.turns).toHaveLength(2);
      const explainedState = study.state;
      study = await service.history(owner, material, {
        operationId: randomUUID(),
        baseRevision: study.revision,
        direction: 'undo',
      });
      expect(study.state.annotations).toEqual([]);
      expect(study.state.pages).toHaveLength(2);
      study = await service.history(owner, material, {
        operationId: randomUUID(),
        baseRevision: study.revision,
        direction: 'redo',
      });
      expect(study.state).toEqual(explainedState);
      for (let index = 0; index < 32; index++) {
        study = await service.change(owner, material, {
          operationId: randomUUID(),
          baseRevision: study.revision,
          state: {
            ...study.state,
            annotations: [
              ...study.state.annotations.filter(
                (annotation) => annotation.author === 'tutor',
              ),
              drawing(study, `Revisão ${index}`),
            ],
          },
        });
      }
      const result = await pool.query(
        'SELECT count(*)::int AS records, count(before_state)::int AS snapshots FROM pdf_study_operation WHERE material_id=$1',
        [material],
      );
      expect(result.rows[0]).toMatchObject({ snapshots: 30, records: 35 });
    });
  });
  it('rejects invalid selections and cancelled explanations without saving partial work', async () => {
    await withFixture(async ({ owner, material, service, pool }) => {
      const study = await service.open(owner, material);
      const request = {
        operationId: randomUUID(),
        baseRevision: 0,
        pageId: study.state.pages[0]!.id,
        question: 'Explique',
        image: null,
        selection: null,
      };
      await expect(
        service.tutor(
          owner,
          material,
          { ...request, pageId: randomUUID() },
          () => {},
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'STUDY_PAGE_INVALID' });
      await expect(
        service.tutor(
          owner,
          material,
          {
            ...request,
            selection: {
              text: 'Seleção',
              rects: [{ x: 590, y: 10, width: 20, height: 20 }],
            },
          },
          () => {},
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'STUDY_SELECTION_INVALID' });
      const controller = new AbortController();
      controller.abort();
      await expect(
        service.tutor(owner, material, request, () => {}, controller.signal),
      ).rejects.toThrow();
      const reopened = await service.get(owner, material);
      expect(reopened.revision).toBe(0);
      expect(reopened.state).toEqual(study.state);
      expect(reopened.turns).toEqual([]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS total FROM pdf_tutor_attempt WHERE owner_id=$1',
            [owner],
          )
        ).rows[0].total,
      ).toBe(1);
    });
  });
  it('enforces 100 attempts per rolling day and does not charge successful replay twice', async () => {
    await withFixture(async ({ owner, material, service, pool }) => {
      const study = await service.open(owner, material);
      await pool.query(
        'INSERT INTO pdf_tutor_attempt(owner_id,material_id,operation_id) SELECT $1,$2,gen_random_uuid() FROM generate_series(1,100)',
        [owner, material],
      );
      const request = {
        operationId: randomUUID(),
        baseRevision: 0,
        pageId: study.state.pages[0]!.id,
        question: 'Explique',
        image: null,
        selection: null,
      };
      const events: string[] = [];
      await expect(
        service.tutor(
          owner,
          material,
          request,
          (event) => events.push(event.type),
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'TUTOR_DAILY_LIMIT', status: 429 });
      expect(events).toEqual([]);
      expect((await service.get(owner, material)).revision).toBe(0);
      await pool.query(
        "UPDATE pdf_tutor_attempt SET created_at=now()-interval '25 hours' WHERE owner_id=$1",
        [owner],
      );
      await service.tutor(
        owner,
        material,
        request,
        () => {},
        new AbortController().signal,
      );
      await service.tutor(
        owner,
        material,
        request,
        () => {},
        new AbortController().signal,
      );
      const attempts = await pool.query(
        "SELECT count(*) FILTER (WHERE created_at>now()-interval '24 hours')::int AS current FROM pdf_tutor_attempt WHERE owner_id=$1",
        [owner],
      );
      expect(attempts.rows[0].current).toBe(1);
      expect((await service.get(owner, material)).turns).toHaveLength(2);
    });
  });
  it('serves ten independent student tutors concurrently without exhausting the shared pool', async () => {
    await withFixture(async ({ service }) => {
      await Promise.all(
        Array.from({ length: 10 }, () =>
          withFixture(async ({ owner, material }) => {
            const study = await service.open(owner, material);
            await service.tutor(
              owner,
              material,
              {
                operationId: randomUUID(),
                baseRevision: 0,
                pageId: study.state.pages[0]!.id,
                question: 'Explique',
                image: null,
                selection: null,
              },
              () => {},
              new AbortController().signal,
            );
            const saved = await service.get(owner, material);
            expect(saved.revision).toBe(1);
            expect(saved.ownerId).toBe(owner);
            expect(saved.turns).toHaveLength(2);
          }),
        ),
      );
    });
  }, 20_000);
  it('rejects an already busy tutor without double releasing its lease and recovers after unlock', async () => {
    await withFixture(async ({ owner, material, service, pool }) => {
      const study = await service.open(owner, material);
      const request = {
        operationId: randomUUID(),
        baseRevision: 0,
        pageId: study.state.pages[0]!.id,
        question: 'Explique',
        image: null,
        selection: null,
      };
      const lease = await pool.connect();
      try {
        await lease.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [
          `pdf-tutor:${owner}`,
        ]);
        for (let index = 0; index < 2; index++) {
          await expect(
            service.tutor(
              owner,
              material,
              request,
              () => {},
              new AbortController().signal,
            ),
          ).rejects.toMatchObject({ code: 'TUTOR_BUSY', status: 429 });
        }
        expect(
          (
            await pool.query(
              'SELECT count(*)::int AS total FROM pdf_tutor_attempt WHERE owner_id=$1',
              [owner],
            )
          ).rows[0].total,
        ).toBe(0);
      } finally {
        await lease.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [
          `pdf-tutor:${owner}`,
        ]);
        lease.release();
      }
      await service.tutor(
        owner,
        material,
        request,
        () => {},
        new AbortController().signal,
      );
      expect((await service.get(owner, material)).revision).toBe(1);
    });
  });
});
