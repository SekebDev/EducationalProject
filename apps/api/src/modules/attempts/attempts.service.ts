import type {
  AttemptEntity,
  AnswerEntity,
  QuestionEntity,
} from './entities/attempts.entity.js';
import { Injectable } from '@nestjs/common';
import type pg from 'pg';
import { questionPublicSchema } from '@study/contracts';
import { readConfig } from '../../infrastructure/config.js';
import { createPool, transaction } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { OperationRepository } from '../../infrastructure/jobs/operations.js';

@Injectable()
export class AttemptsService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);
  private readonly operations = new OperationRepository(
    readConfig(process.env).databaseUrl,
  );

  async get(ownerId: string, attemptId: string) {
    const attempt = await this.pool.query<AttemptEntity>(
      `SELECT a.id,a.exam_id,a.state,a.version,a.submitted_at FROM attempt a
       JOIN exam e ON e.id=a.exam_id AND e.owner_id=a.owner_id
       WHERE a.owner_id=$1 AND a.id=$2 AND a.deleted_at IS NULL AND e.deleted_at IS NULL`,
      [ownerId, attemptId],
    );
    const row = attempt.rows[0];
    if (!row) {
      throw new PublicError(404, 'NOT_FOUND', 'Tentativa não encontrada.');
    }
    const questions = await this.pool.query<QuestionEntity>(
      `SELECT q.id,q.ordinal,q.type,q.statement,q.alternatives,t.display_name AS topic,q.study_level_snapshot
       FROM question q JOIN topic t ON t.id=q.topic_id AND t.owner_id=q.owner_id
       WHERE q.owner_id=$1 AND q.exam_id=$2 ORDER BY q.ordinal`,
      [ownerId, row.exam_id],
    );
    const answers = await this.pool.query<
      AnswerEntity & {
        points_units: number | null;
        current_state: string | null;
        criterion_scores: unknown;
        explanation: string | null;
        gaps: unknown;
        reference_answer: string | null;
        correct_option_id: string | null;
        option_explanations: unknown;
      }
    >(
      `SELECT a.id,a.question_id,a.draft_value,a.draft_version,a.confirmed_value,a.confirmed_at,a.state,
        gr.points_units,gr.criterion_scores,gr.explanation,gr.gaps,gr.reference_answer,
        qs.correct_option_id,qs.option_explanations,gc.state AS current_state FROM answer a
       LEFT JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
       LEFT JOIN grade_revision gr ON gr.id=gc.current_revision_id AND gr.owner_id=a.owner_id
       LEFT JOIN question_secret qs ON qs.question_id=a.question_id AND qs.owner_id=a.owner_id AND a.confirmed_value IS NOT NULL
       WHERE a.owner_id=$1 AND a.attempt_id=$2`,
      [ownerId, attemptId],
    );
    const byQuestion = new Map(
      answers.rows.map((answer) => [answer.question_id, answer]),
    );
    return {
      id: row.id,
      examId: row.exam_id,
      state: row.state,
      version: row.version,
      submittedAt: row.submitted_at,
      questions: questions.rows.map((question) => ({
        ...questionPublicSchema.parse({
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
        answer: (() => {
          const answer = byQuestion.get(question.id);
          return answer
            ? {
                id: answer.id,
                draftValue: answer.draft_value,
                draftVersion: answer.draft_version,
                confirmedValue: answer.confirmed_value,
                confirmedAt: answer.confirmed_at,
                state: answer.state,
                points:
                  answer.points_units === null
                    ? null
                    : answer.points_units / 10_000,
                gradeState: answer.current_state,
                feedback:
                  answer.current_state === 'graded' ||
                  answer.current_state === 'contested'
                    ? {
                        points:
                          answer.points_units === null
                            ? null
                            : answer.points_units / 10_000,
                        maxPoints: 1,
                        correctOptionId: answer.correct_option_id,
                        optionExplanations: answer.option_explanations,
                        criteria: answer.criterion_scores,
                        explanation: answer.explanation,
                        gaps: answer.gaps,
                        referenceAnswer: answer.reference_answer,
                        aiGenerated: question.type === 'essay',
                      }
                    : null,
              }
            : null;
        })(),
      })),
    };
  }

  async list(ownerId: string) {
    const result = await this.pool.query<AttemptEntity & { title: string }>(
      `SELECT a.id,a.exam_id,a.state,a.version,a.submitted_at,e.title FROM attempt a
       JOIN exam e ON e.id=a.exam_id AND e.owner_id=a.owner_id
       WHERE a.owner_id=$1 AND a.deleted_at IS NULL AND e.deleted_at IS NULL
       ORDER BY a.started_at DESC,a.id DESC LIMIT 20`,
      [ownerId],
    );
    return {
      items: result.rows.map((row) => ({
        id: row.id,
        examId: row.exam_id,
        title: row.title,
        state: row.state,
        version: row.version,
        submittedAt: row.submitted_at,
      })),
      nextCursor: null,
    };
  }

  async draft(
    ownerId: string,
    attemptId: string,
    questionId: string,
    value: string,
    expectedVersion: number,
  ) {
    return transaction(this.pool, async (client) => {
      const attempt = await this.lockAttempt(client, ownerId, attemptId);
      this.requireInProgress(attempt);
      const question = await this.question(
        client,
        ownerId,
        attempt.exam_id,
        questionId,
      );
      const current = await this.answer(
        client,
        ownerId,
        attemptId,
        question.id,
      );
      if (current && current.state !== 'draft') {
        throw new PublicError(
          409,
          'ANSWER_CONFIRMED',
          'Esta resposta já foi confirmada.',
        );
      }
      if ((current?.draft_version ?? 0) !== expectedVersion) {
        throw new PublicError(
          409,
          'VERSION_CONFLICT',
          'O rascunho mudou. Atualize antes de salvar.',
        );
      }
      const saved = current
        ? await client.query<AnswerEntity>(
            'UPDATE answer SET draft_value=$3,draft_version=draft_version+1 WHERE owner_id=$1 AND id=$2 RETURNING *',
            [ownerId, current.id, value],
          )
        : await client.query<AnswerEntity>(
            "INSERT INTO answer(owner_id,attempt_id,question_id,draft_value,draft_version,state) VALUES ($1,$2,$3,$4,1,'draft') RETURNING *",
            [ownerId, attemptId, questionId, value],
          );
      await client.query(
        'UPDATE attempt SET version=version+1 WHERE owner_id=$1 AND id=$2',
        [ownerId, attemptId],
      );
      return {
        answerId: saved.rows[0]?.id,
        draftVersion: saved.rows[0]?.draft_version,
        value,
      };
    });
  }

  async confirm(
    ownerId: string,
    attemptId: string,
    questionId: string,
    value: string,
    expectedVersion: number,
    key: string,
  ) {
    return transaction(this.pool, async (client) => {
      const attempt = await this.lockAttempt(client, ownerId, attemptId);
      this.requireInProgress(attempt);
      const question = await this.question(
        client,
        ownerId,
        attempt.exam_id,
        questionId,
      );
      const current = await this.answer(
        client,
        ownerId,
        attemptId,
        question.id,
      );
      if (current && current.state !== 'draft') {
        if (current.confirmed_value !== value) {
          throw new PublicError(
            409,
            'ANSWER_CONFIRMED',
            'Esta resposta já foi confirmada.',
          );
        }
        return this.confirmedFeedback(
          client,
          ownerId,
          current.id,
          question.type,
        );
      }
      if ((current?.draft_version ?? 0) !== expectedVersion) {
        throw new PublicError(
          409,
          'VERSION_CONFLICT',
          'O rascunho mudou. Atualize antes de confirmar.',
        );
      }
      const trimmed = value.trim();
      if (
        !trimmed ||
        (question.type === 'objective' &&
          !question.alternatives?.some((option) => option.id === trimmed))
      ) {
        throw new PublicError(
          422,
          'ANSWER_INVALID',
          'Informe uma resposta válida.',
        );
      }
      const answer = current
        ? await client.query<AnswerEntity>(
            "UPDATE answer SET confirmed_value=$3,confirmed_at=now(),state='confirmed_pending' WHERE owner_id=$1 AND id=$2 RETURNING *",
            [ownerId, current.id, trimmed],
          )
        : await client.query<AnswerEntity>(
            "INSERT INTO answer(owner_id,attempt_id,question_id,confirmed_value,confirmed_at,state) VALUES ($1,$2,$3,$4,now(),'confirmed_pending') RETURNING *",
            [ownerId, attemptId, questionId, trimmed],
          );
      const answerId = answer.rows[0]?.id;
      if (!answerId) {
        throw new Error('Resposta não criada');
      }
      let operationId: string | undefined;
      if (question.type === 'objective') {
        const secret = await client.query<{
          correct_option_id: string;
          option_explanations: Array<{ optionId: string; explanation: string }>;
        }>(
          'SELECT correct_option_id,option_explanations FROM question_secret WHERE owner_id=$1 AND question_id=$2',
          [ownerId, questionId],
        );
        const grading = secret.rows[0];
        if (!grading) {
          throw new Error('Gabarito ausente');
        }
        const points = trimmed === grading.correct_option_id ? 10_000 : 0;
        const revision = await client.query<{ id: string }>(
          `INSERT INTO grade_revision(owner_id,answer_id,revision_number,kind,points_units,explanation)
           VALUES ($1,$2,1,'objective',$3,$4) RETURNING id`,
          [
            ownerId,
            answerId,
            points,
            JSON.stringify(grading.option_explanations),
          ],
        );
        await client.query(
          "INSERT INTO grade_current(owner_id,answer_id,current_revision_id,state) VALUES ($1,$2,$3,'graded')",
          [ownerId, answerId, revision.rows[0]?.id],
        );
        await client.query(
          "UPDATE answer SET state='graded' WHERE owner_id=$1 AND id=$2",
          [ownerId, answerId],
        );
      } else {
        await client.query(
          "INSERT INTO grade_current(owner_id,answer_id,state) VALUES ($1,$2,'pending')",
          [ownerId, answerId],
        );
        operationId = await this.operations.create(client, {
          ownerId,
          resourceId: answerId,
          kind: 'grade-answer',
          dedupeKey: key,
          inputVersion: 1,
        });
      }
      await client.query(
        'UPDATE attempt SET version=version+1 WHERE owner_id=$1 AND id=$2',
        [ownerId, attemptId],
      );
      return this.confirmedFeedback(
        client,
        ownerId,
        answerId,
        question.type,
        operationId,
      );
    });
  }

  private async lockAttempt(
    client: pg.PoolClient,
    ownerId: string,
    attemptId: string,
  ) {
    const result = await client.query<AttemptEntity>(
      `SELECT a.id,a.exam_id,a.state,a.version,a.submitted_at FROM attempt a
       JOIN exam e ON e.id=a.exam_id AND e.owner_id=a.owner_id
       WHERE a.owner_id=$1 AND a.id=$2 AND a.deleted_at IS NULL AND e.deleted_at IS NULL FOR UPDATE OF a`,
      [ownerId, attemptId],
    );
    const attempt = result.rows[0];
    if (!attempt) {
      throw new PublicError(404, 'NOT_FOUND', 'Tentativa não encontrada.');
    }
    return attempt;
  }

  private requireInProgress(attempt: AttemptEntity) {
    if (attempt.state !== 'in_progress') {
      throw new PublicError(
        409,
        'ATTEMPT_SUBMITTED',
        'A tentativa já foi entregue.',
      );
    }
  }

  private async question(
    client: pg.PoolClient,
    ownerId: string,
    examId: string,
    questionId: string,
  ) {
    const result = await client.query<QuestionEntity>(
      `SELECT q.id,q.type,q.alternatives FROM question q WHERE q.owner_id=$1 AND q.exam_id=$2 AND q.id=$3`,
      [ownerId, examId, questionId],
    );
    const question = result.rows[0];
    if (!question) {
      throw new PublicError(404, 'NOT_FOUND', 'Questão não encontrada.');
    }
    return question;
  }

  private async answer(
    client: pg.PoolClient,
    ownerId: string,
    attemptId: string,
    questionId: string,
  ) {
    const result = await client.query<AnswerEntity>(
      'SELECT * FROM answer WHERE owner_id=$1 AND attempt_id=$2 AND question_id=$3 FOR UPDATE',
      [ownerId, attemptId, questionId],
    );
    return result.rows[0];
  }

  private async confirmedFeedback(
    client: pg.PoolClient,
    ownerId: string,
    answerId: string,
    type: 'objective' | 'essay',
    operationId?: string,
  ) {
    if (type === 'essay') {
      const operation = operationId
        ? { rows: [{ id: operationId }] }
        : await client.query<{ id: string }>(
            "SELECT id FROM operation WHERE owner_id=$1 AND resource_id=$2 AND kind='grade-answer' ORDER BY created_at DESC LIMIT 1",
            [ownerId, answerId],
          );
      return {
        answerId,
        status: 'pending',
        points: null,
        maxPoints: 1,
        operationId: operation.rows[0]?.id ?? null,
      };
    }
    const result = await client.query<{
      points_units: number;
      explanation: string;
      correct_option_id: string;
    }>(
      `SELECT gr.points_units,gr.explanation,qs.correct_option_id FROM answer a
       JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
       JOIN grade_revision gr ON gr.id=gc.current_revision_id AND gr.owner_id=a.owner_id
       JOIN question_secret qs ON qs.question_id=a.question_id AND qs.owner_id=a.owner_id
       WHERE a.owner_id=$1 AND a.id=$2`,
      [ownerId, answerId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Correção objetiva ausente');
    }
    return {
      answerId,
      status: 'graded',
      points: row.points_units / 10_000,
      maxPoints: 1,
      correctOptionId: row.correct_option_id,
      optionExplanations: JSON.parse(row.explanation) as unknown,
      aiGenerated: false,
    };
  }
}
