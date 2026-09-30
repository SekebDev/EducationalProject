import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { ExamsService } from '../../src/modules/exams/exams.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('exam conversation context', () => {
  it('requires an owned nonempty conversation and snapshots its completed history', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const previous = Object.fromEntries(
      [
        'DATABASE_URL',
        'APP_ORIGIN',
        'SESSION_SECRET',
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_FROM',
      ].map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-123456789012345678901234',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'estudos@example.invalid',
    });
    const service = new ExamsService();
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const owner = randomUUID();
    const other = randomUUID();
    const source = randomUUID();
    const empty = randomUUID();
    const foreign = randomUUID();
    let examId: string | undefined;
    const input = {
      conversationId: source,
      topicNames: ['Biologia'],
      studyLevel: 'Ensino Médio',
      total: 10,
      objectiveCount: 5,
      essayCount: 5,
      materialIds: [],
    };
    try {
      for (const id of [owner, other]) {
        await client.query(
          'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
          [id, `${id}@example.invalid`, 'hash'],
        );
      }
      await client.query(
        `INSERT INTO conversation(id,owner_id,title,personality_key) VALUES
         ($1,$2,'Biologia em foco','objetiva'),($3,$2,'Vazia','objetiva'),($4,$5,'Outra','objetiva')`,
        [source, owner, empty, foreign, other],
      );
      await client.query(
        `INSERT INTO message(owner_id,conversation_id,sequence,role,content,state,turn_id,personality_snapshot)
         VALUES ($1,$2,1,'user','Como as plantas produzem energia?','completed',$3,'objetiva'),
         ($1,$2,2,'assistant','Pela fotossíntese.','completed',$3,'objetiva'),
         ($1,$2,3,'assistant','Resposta falhou.','failed',$4,'objetiva')`,
        [owner, source, randomUUID(), randomUUID()],
      );
      await expect(
        service.create(owner, randomUUID(), {
          ...input,
          conversationId: empty,
        }),
      ).rejects.toMatchObject({ code: 'CONVERSATION_EMPTY' });
      await expect(
        service.create(owner, randomUUID(), {
          ...input,
          conversationId: foreign,
        }),
      ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
      const created = await service.create(owner, randomUUID(), input);
      examId = created.examId;
      const loaded = await service.get(owner, examId);
      expect(loaded.conversationId).toBe(source);
      expect(loaded.conversationTitle).toBe('Biologia em foco');
      const snapshot = await client.query<{
        context_snapshot: {
          messages: Array<{ role: string; content: string }>;
        };
      }>('SELECT context_snapshot FROM exam WHERE id=$1', [examId]);
      expect(snapshot.rows[0]?.context_snapshot.messages).toEqual([
        { role: 'user', content: 'Como as plantas produzem energia?' },
        { role: 'assistant', content: 'Pela fotossíntese.' },
      ]);
    } finally {
      await client.query('DELETE FROM idempotency_record WHERE owner_id=$1', [
        owner,
      ]);
      if (examId) {
        await client.query('DELETE FROM exam_topic WHERE exam_id=$1', [examId]);
        await client.query('DELETE FROM exam WHERE id=$1', [examId]);
        await client.query('DELETE FROM operation WHERE owner_id=$1', [owner]);
        await client.query('DELETE FROM topic WHERE owner_id=$1', [owner]);
      }
      await client.query('DELETE FROM message WHERE conversation_id=$1', [
        source,
      ]);
      await client.query('DELETE FROM conversation WHERE id=ANY($1::uuid[])', [
        [source, empty, foreign],
      ]);
      await client.query('DELETE FROM student WHERE id=ANY($1::uuid[])', [
        [owner, other],
      ]);
      await client.end();
      const internal = service as unknown as {
        pool: pg.Pool;
        operations: { pool: pg.Pool };
      };
      await internal.pool.end();
      await internal.operations.pool.end();
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });
});
