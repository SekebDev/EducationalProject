import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { AttemptsService } from '../../src/modules/attempts/attempts.service.js';
import {
  SubmissionService,
  displayPoints,
} from '../../src/modules/attempts/submission.service.js';
import { DisputesService } from '../../src/modules/grading/disputes.service.js';
import { createReevaluateJobHandler } from '../../src/modules/grading/reevaluate.job.js';
import { OperationRepository } from '../../src/infrastructure/jobs/operations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('rascunho e confirmação', () => {
  it('trava versões concorrentes, revela gabarito só após confirmar e não altera resposta confirmada', async () => {
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
      ].map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-123456789012345678901234',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'study@example.invalid',
    });
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const owner = randomUUID();
    const other = randomUUID();
    try {
      for (const id of [owner, other]) {
        await client.query(
          'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
          [id, `${id}@example.invalid`, 'hash'],
        );
      }
      const exam = await client.query<{ id: string }>(
        "INSERT INTO exam(owner_id,title,study_level,total,objective_count,essay_count,state) VALUES ($1,'Teste','Médio',10,5,5,'ready') RETURNING id",
        [owner],
      );
      const examId = exam.rows[0]!.id;
      const topic = await client.query<{ id: string }>(
        "INSERT INTO topic(owner_id,display_name,normalized_name) VALUES ($1,'Biologia','biologia') RETURNING id",
        [owner],
      );
      const topicId = topic.rows[0]!.id;
      const question = await client.query<{ id: string }>(
        `INSERT INTO question(owner_id,exam_id,ordinal,topic_id,study_level_snapshot,type,statement,statement_hash,alternatives)
         VALUES ($1,$2,1,$3,'Médio','objective','Qual alternativa?', 'hash', $4::jsonb) RETURNING id`,
        [
          owner,
          examId,
          topicId,
          JSON.stringify([
            { id: 'A', text: 'Certa' },
            { id: 'B', text: 'Errada' },
            { id: 'C', text: 'Outra' },
            { id: 'D', text: 'Mais uma' },
          ]),
        ],
      );
      const questionId = question.rows[0]!.id;
      await client.query(
        'INSERT INTO question_secret(question_id,owner_id,correct_option_id,option_explanations) VALUES ($1,$2,$3,$4::jsonb)',
        [
          questionId,
          owner,
          'A',
          JSON.stringify([
            { optionId: 'A', explanation: 'Correta' },
            { optionId: 'B', explanation: 'Incorreta' },
            { optionId: 'C', explanation: 'Incorreta' },
            { optionId: 'D', explanation: 'Incorreta' },
          ]),
        ],
      );
      const unanswered = await client.query<{ id: string }>(
        `INSERT INTO question(owner_id,exam_id,ordinal,topic_id,study_level_snapshot,type,statement,statement_hash)
         VALUES ($1,$2,2,$3,'Médio','essay','Explique o processo','hash-2') RETURNING id`,
        [owner, examId, topicId],
      );
      await client.query(
        'INSERT INTO question_secret(question_id,owner_id,rubric,reference_answer) VALUES ($1,$2,$3::jsonb,$4)',
        [
          unanswered.rows[0]!.id,
          owner,
          JSON.stringify([
            {
              id: 'conteudo',
              label: 'Conteúdo',
              maxUnits: 10_000,
              description: 'Explicação',
            },
          ]),
          'Referência',
        ],
      );
      const attempt = await client.query<{ id: string }>(
        "INSERT INTO attempt(owner_id,exam_id,state) VALUES ($1,$2,'in_progress') RETURNING id",
        [owner, examId],
      );
      const attemptId = attempt.rows[0]!.id;
      const service = new AttemptsService();
      const before = await service.get(owner, attemptId);
      expect(JSON.stringify(before)).not.toMatch(
        /correctOptionId|optionExplanations/u,
      );
      await expect(service.get(other, attemptId)).rejects.toMatchObject({
        status: 404,
      });
      const saved = await service.draft(owner, attemptId, questionId, 'B', 0);
      expect(saved.draftVersion).toBe(1);
      const twoSaves = await Promise.allSettled([
        service.draft(owner, attemptId, questionId, 'B', 1),
        service.draft(owner, attemptId, questionId, 'C', 1),
      ]);
      expect(
        twoSaves.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        twoSaves.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const [feedback, simultaneous] = await Promise.all([
        service.confirm(owner, attemptId, questionId, 'B', 2, randomUUID()),
        service.confirm(owner, attemptId, questionId, 'B', 2, randomUUID()),
      ]);
      expect(simultaneous).toMatchObject(feedback);
      expect(feedback).toMatchObject({
        status: 'graded',
        points: 0,
        correctOptionId: 'A',
      });
      await expect(
        service.draft(owner, attemptId, questionId, 'A', 2),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await service.confirm(
          owner,
          attemptId,
          questionId,
          'B',
          2,
          randomUUID(),
        ),
      ).toMatchObject(feedback);
      await expect(
        service.confirm(owner, attemptId, questionId, 'A', 2, randomUUID()),
      ).rejects.toMatchObject({ status: 409 });
      const submission = new SubmissionService();
      const version = (await service.get(owner, attemptId)).version;
      await expect(
        submission.submit(owner, attemptId, version, false),
      ).rejects.toMatchObject({
        code: 'UNANSWERED_CONFIRMATION_REQUIRED',
      });
      const result = await submission.submit(owner, attemptId, version, true);
      expect(result).toMatchObject({
        state: 'completed',
        points: 0,
        counts: { wrong: 1, blank: 1 },
      });
      expect(displayPoints(5_049)).toBe(0.5);
      expect(displayPoints(5_050)).toBe(0.51);
      const disputes = new DisputesService();
      const contest = await disputes.open(
        owner,
        feedback.answerId,
        'A alternativa também parece correta.',
      );
      expect((await submission.result(owner, attemptId)).counts.contested).toBe(
        1,
      );
      const reevaluation = await disputes.reevaluate(
        owner,
        contest.id ?? '',
        randomUUID(),
      );
      const operations = new OperationRepository(databaseUrl);
      const lease = await operations.acquire(
        reevaluation.operationId,
        owner,
        1,
      );
      if (!lease) {
        throw new Error('Lease de reavaliação ausente');
      }
      const revised = await createReevaluateJobHandler(databaseUrl)(lease);
      expect(await operations.complete(lease, revised.apply)).toBe(true);
      expect(
        (await disputes.revisions(owner, feedback.answerId)).items,
      ).toHaveLength(2);
      expect((await submission.result(owner, attemptId)).counts.contested).toBe(
        0,
      );
    } finally {
      await client.query('DELETE FROM dispute WHERE owner_id=$1', [owner]);
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
      await client.query('DELETE FROM student WHERE id=ANY($1::uuid[])', [
        [owner, other],
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
