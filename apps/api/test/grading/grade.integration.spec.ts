import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { OperationRepository } from '../../src/infrastructure/jobs/operations.js';
import {
  createGradeJobHandler,
  validateGrade,
} from '../../src/modules/grading/grade.job.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const rubric = [
  {
    id: 'conceito',
    label: 'Conceito',
    maxUnits: 6_000,
    description: 'Precisão',
  },
  {
    id: 'exemplo',
    label: 'Exemplo',
    maxUnits: 4_000,
    description: 'Aplicação',
  },
];

describe('correção discursiva', () => {
  it('soma só os critérios fixos e rejeita saída inválida', () => {
    expect(
      validateGrade(
        {
          criteria: [
            { criterionId: 'conceito', awardedUnits: 3_000, reason: 'Parcial' },
            { criterionId: 'exemplo', awardedUnits: 2_000, reason: 'Parcial' },
          ],
          strengths: [],
          gaps: [],
          referenceAnswer: 'Referência',
          explanation: 'Parcial',
        },
        rubric,
      ).pointsUnits,
    ).toBe(5_000);
    expect(() =>
      validateGrade(
        {
          criteria: [
            {
              criterionId: 'conceito',
              awardedUnits: 7_000,
              reason: 'Incorreto',
            },
            { criterionId: 'exemplo', awardedUnits: 2_000, reason: 'Parcial' },
          ],
          strengths: [],
          gaps: [],
          referenceAnswer: 'Referência',
          explanation: 'Inválido',
        },
        rubric,
      ),
    ).toThrow('AI_GRADE_INVALID');
  });
});

describe.skipIf(!databaseUrl)('job de correção discursiva', () => {
  it('preserva pendência na falha, permite retry e publica uma revisão imutável', async () => {
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
    const owner = randomUUID();
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(
        'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
        [owner, `${owner}@example.invalid`, 'hash'],
      );
      const exam = await client.query<{ id: string }>(
        "INSERT INTO exam(owner_id,title,study_level,total,objective_count,essay_count,state) VALUES ($1,'Teste','Médio',10,0,10,'ready') RETURNING id",
        [owner],
      );
      const examId = exam.rows[0]!.id;
      const topic = await client.query<{ id: string }>(
        "INSERT INTO topic(owner_id,display_name,normalized_name) VALUES ($1,'Biologia','biologia') RETURNING id",
        [owner],
      );
      const question = await client.query<{ id: string }>(
        `INSERT INTO question(owner_id,exam_id,ordinal,topic_id,study_level_snapshot,type,statement,statement_hash)
         VALUES ($1,$2,1,$3,'Médio','essay','Explique o conceito','hash') RETURNING id`,
        [owner, examId, topic.rows[0]!.id],
      );
      const questionId = question.rows[0]!.id;
      await client.query(
        'INSERT INTO question_secret(question_id,owner_id,rubric,reference_answer) VALUES ($1,$2,$3::jsonb,$4)',
        [questionId, owner, JSON.stringify(rubric), 'Resposta exata'],
      );
      const attempt = await client.query<{ id: string }>(
        "INSERT INTO attempt(owner_id,exam_id,state) VALUES ($1,$2,'submitted_pending') RETURNING id",
        [owner, examId],
      );
      const answer = await client.query<{ id: string }>(
        `INSERT INTO answer(owner_id,attempt_id,question_id,confirmed_value,confirmed_at,state)
         VALUES ($1,$2,$3,'Resposta parcial',now(),'confirmed_pending') RETURNING id`,
        [owner, attempt.rows[0]!.id, questionId],
      );
      const answerId = answer.rows[0]!.id;
      await client.query(
        "INSERT INTO grade_current(owner_id,answer_id,state) VALUES ($1,$2,'pending')",
        [owner, answerId],
      );
      const operation = await client.query<{ id: string }>(
        "INSERT INTO operation(owner_id,kind,resource_id,dedupe_key,state,input_version) VALUES ($1,'grade-answer',$2,$3,'pending',1) RETURNING id",
        [owner, answerId, randomUUID()],
      );
      const operationId = operation.rows[0]!.id;
      const operations = new OperationRepository(databaseUrl);
      const first = await operations.acquire(operationId, owner, 1);
      if (!first) {
        throw new Error('Lease ausente');
      }
      expect(await operations.fail(first, 'AI_SCHEMA_INVALID', false)).toBe(
        true,
      );
      const failed = await client.query<{
        state: string;
        revision: string | null;
      }>(
        'SELECT state,current_revision_id AS revision FROM grade_current WHERE answer_id=$1',
        [answerId],
      );
      expect(failed.rows[0]).toMatchObject({ state: 'failed', revision: null });
      await operations.retry(owner, operationId, randomUUID());
      const second = await operations.acquire(operationId, owner, 1);
      if (!second) {
        throw new Error('Lease de retry ausente');
      }
      const result = await createGradeJobHandler(databaseUrl)(second);
      expect(await operations.complete(second, result.apply)).toBe(true);
      const revisions = await client.query<{
        points_units: number;
        revision_number: number;
      }>(
        'SELECT points_units,revision_number FROM grade_revision WHERE answer_id=$1',
        [answerId],
      );
      expect(revisions.rows).toEqual([
        { points_units: 5_000, revision_number: 1 },
      ]);
      const done = await client.query<{ state: string }>(
        'SELECT state FROM attempt WHERE id=$1',
        [attempt.rows[0]!.id],
      );
      expect(done.rows[0]?.state).toBe('completed');
    } finally {
      await client.query('DELETE FROM grade_current WHERE owner_id=$1', [
        owner,
      ]);
      await client.query('DELETE FROM grade_revision WHERE owner_id=$1', [
        owner,
      ]);
      await client.query('DELETE FROM answer WHERE owner_id=$1', [owner]);
      await client.query('DELETE FROM attempt WHERE owner_id=$1', [owner]);
      await client.query('DELETE FROM question_secret WHERE owner_id=$1', [
        owner,
      ]);
      await client.query('DELETE FROM question WHERE owner_id=$1', [owner]);
      await client.query('DELETE FROM exam WHERE owner_id=$1', [owner]);
      await client.query('DELETE FROM topic WHERE owner_id=$1', [owner]);
      await client.query('DELETE FROM operation_event WHERE owner_id=$1', [
        owner,
      ]);
      await client.query('DELETE FROM operation WHERE owner_id=$1', [owner]);
      await client.query('DELETE FROM idempotency_record WHERE owner_id=$1', [
        owner,
      ]);
      await client.query('DELETE FROM student WHERE id=$1', [owner]);
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
