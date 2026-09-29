import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { PublicErrorFilter } from '../../src/infrastructure/http/public-error.js';
import { OperationRepository } from '../../src/infrastructure/jobs/operations.js';
import { createExamJobHandler } from '../../src/modules/exams/exam.job.js';
import { ExamsService } from '../../src/modules/exams/exams.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('segredo da prova na API', () => {
  it('publica somente QuestionPublic e isola duas contas', async () => {
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
        'AI_PROVIDER',
      ].map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-123456789012345678901234',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'study@example.invalid',
      AI_PROVIDER: 'fake',
    });
    const app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new PublicErrorFilter());
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    const students: string[] = [];
    let conversationId: string | undefined;
    let examId: string | undefined;
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();

    async function register() {
      const csrf = await fetch(`${base}/auth/csrf`);
      const token = ((await csrf.json()) as { token: string }).token;
      const csrfCookie = csrf.headers.getSetCookie()[0]?.split(';')[0] ?? '';
      const response = await fetch(`${base}/auth/register`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          cookie: csrfCookie,
          'x-csrf-token': token,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: `secret-${randomUUID()}@example.invalid`,
          password: 'valid-password-1234',
        }),
      });
      expect(response.status).toBe(201);
      students.push(((await response.json()) as { id: string }).id);
      return `${csrfCookie}; ${response.headers.getSetCookie()[0]?.split(';')[0]}`;
    }

    try {
      const ownerCookie = await register();
      const otherCookie = await register();
      const created = await client.query<{ id: string }>(
        "INSERT INTO conversation(owner_id,title,personality_key) VALUES ($1,'Biologia','acolhedora') RETURNING id",
        [students[0]],
      );
      conversationId = created.rows[0]?.id;
      if (!conversationId) {
        throw new Error('Conversa ausente');
      }
      await client.query(
        `INSERT INTO message(owner_id,conversation_id,sequence,role,content,state,turn_id,personality_snapshot)
         VALUES ($1,$2,1,'user','Como vivem as plantas?','completed',$3,'acolhedora')`,
        [students[0], conversationId, randomUUID()],
      );
      const service = new ExamsService();
      const createdExam = await service.create(
        students[0] ?? '',
        randomUUID(),
        {
          conversationId,
          topicNames: ['Plantas'],
          studyLevel: 'Ensino Médio',
          total: 10,
          objectiveCount: 5,
          essayCount: 5,
          materialIds: [],
        },
      );
      examId = createdExam.examId;
      const operations = new OperationRepository(databaseUrl);
      const lease = await operations.acquire(
        createdExam.operationId,
        students[0] ?? '',
        1,
      );
      if (!lease) {
        throw new Error('Lease ausente');
      }
      const result = await createExamJobHandler(databaseUrl)(lease);
      expect(await operations.complete(lease, result.apply)).toBe(true);
      const response = await fetch(`${base}/exams/${examId}`, {
        headers: { cookie: ownerCookie },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        questions: Array<Record<string, unknown>>;
      };
      expect(body.questions).toHaveLength(10);
      expect(Object.keys(body.questions[0] ?? {}).sort()).toEqual(
        [
          'alternatives',
          'id',
          'ordinal',
          'statement',
          'studyLevel',
          'topic',
          'type',
        ].sort(),
      );
      expect(JSON.stringify(body)).not.toMatch(
        /correctOptionId|rubric|referenceAnswer|optionExplanations|criterionScores/u,
      );
      expect(
        (
          await fetch(`${base}/exams/${examId}`, {
            headers: { cookie: otherCookie },
          })
        ).status,
      ).toBe(404);
    } finally {
      await app.close();
      await client.query('DELETE FROM attempt WHERE owner_id=ANY($1::uuid[])', [
        students,
      ]);
      await client.query(
        'DELETE FROM question_secret WHERE owner_id=ANY($1::uuid[])',
        [students],
      );
      await client.query(
        'DELETE FROM question WHERE owner_id=ANY($1::uuid[])',
        [students],
      );
      await client.query(
        'DELETE FROM exam_source WHERE owner_id=ANY($1::uuid[])',
        [students],
      );
      await client.query(
        'DELETE FROM exam_topic WHERE owner_id=ANY($1::uuid[])',
        [students],
      );
      await client.query('DELETE FROM exam WHERE owner_id=ANY($1::uuid[])', [
        students,
      ]);
      await client.query('DELETE FROM topic WHERE owner_id=ANY($1::uuid[])', [
        students,
      ]);
      await client.query(
        'DELETE FROM operation_event WHERE owner_id=ANY($1::uuid[])',
        [students],
      );
      await client.query(
        'DELETE FROM operation WHERE owner_id=ANY($1::uuid[])',
        [students],
      );
      await client.query(
        'DELETE FROM idempotency_record WHERE owner_id=ANY($1::uuid[])',
        [students],
      );
      await client.query('DELETE FROM message WHERE owner_id=ANY($1::uuid[])', [
        students,
      ]);
      await client.query('DELETE FROM conversation WHERE id=$1', [
        conversationId,
      ]);
      await client.query(
        'DELETE FROM session WHERE student_id=ANY($1::uuid[])',
        [students],
      );
      await client.query('DELETE FROM student WHERE id=ANY($1::uuid[])', [
        students,
      ]);
      await client.end();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
