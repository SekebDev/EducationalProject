import type { ResultEntity } from './entities/submission.entity.js';
import { Injectable } from '@nestjs/common';
import { readConfig } from '../../infrastructure/config.js';
import { createPool, transaction } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { recordDeletion } from '../../infrastructure/deletion/deletion-record.js';

export function displayPoints(units: number): number {
  return Math.floor((units + 50) / 100) / 100;
}

@Injectable()
export class SubmissionService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);

  async delete(ownerId: string, attemptId: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const deleted = await client.query(
        'UPDATE attempt SET deleted_at=now(),version=version+1 WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id',
        [ownerId, attemptId],
      );
      if (!deleted.rowCount) {
        throw new PublicError(404, 'NOT_FOUND', 'Tentativa não encontrada.');
      }
      await recordDeletion(client, ownerId, 'attempt', attemptId);
      await client.query(
        `UPDATE operation SET state='cancelled',phase='cancelled',fence_version=fence_version+1,lease_until=NULL,updated_at=now()
         WHERE owner_id=$1 AND state IN ('pending','running') AND resource_id IN
         (SELECT id FROM answer WHERE owner_id=$1 AND attempt_id=$2)`,
        [ownerId, attemptId],
      );
    });
  }

  async submit(
    ownerId: string,
    attemptId: string,
    expectedVersion: number,
    acceptUnanswered: boolean,
  ) {
    await transaction(this.pool, async (client) => {
      const found = await client.query<{
        exam_id: string;
        state: string;
        version: number;
      }>(
        `SELECT a.exam_id,a.state,a.version FROM attempt a JOIN exam e ON e.id=a.exam_id AND e.owner_id=a.owner_id
         WHERE a.owner_id=$1 AND a.id=$2 AND a.deleted_at IS NULL AND e.deleted_at IS NULL FOR UPDATE OF a`,
        [ownerId, attemptId],
      );
      const attempt = found.rows[0];
      if (!attempt) {
        throw new PublicError(404, 'NOT_FOUND', 'Tentativa não encontrada.');
      }
      if (attempt.state !== 'in_progress') {
        throw new PublicError(
          409,
          'ATTEMPT_SUBMITTED',
          'A tentativa já foi entregue.',
        );
      }
      if (attempt.version !== expectedVersion) {
        throw new PublicError(
          409,
          'VERSION_CONFLICT',
          'A tentativa mudou. Atualize antes de entregar.',
        );
      }
      const blanks = await client.query<{
        id: string;
        answer_id: string | null;
      }>(
        `SELECT q.id,a.id AS answer_id FROM question q LEFT JOIN answer a ON a.question_id=q.id AND a.attempt_id=$2 AND a.owner_id=$1
         WHERE q.owner_id=$1 AND q.exam_id=$3 AND (a.id IS NULL OR a.state='draft') ORDER BY q.ordinal`,
        [ownerId, attemptId, attempt.exam_id],
      );
      if (blanks.rows.length > 0 && !acceptUnanswered) {
        throw new PublicError(
          409,
          'UNANSWERED_CONFIRMATION_REQUIRED',
          `Confirme a entrega com ${blanks.rows.length} questão(ões) sem resposta confirmada.`,
        );
      }
      for (const blank of blanks.rows) {
        const answer = blank.answer_id
          ? await client.query<{ id: string }>(
              "UPDATE answer SET state='blank',confirmed_at=now(),draft_value=NULL WHERE owner_id=$1 AND id=$2 RETURNING id",
              [ownerId, blank.answer_id],
            )
          : await client.query<{ id: string }>(
              "INSERT INTO answer(owner_id,attempt_id,question_id,state,confirmed_at) VALUES ($1,$2,$3,'blank',now()) RETURNING id",
              [ownerId, attemptId, blank.id],
            );
        const answerId = answer.rows[0]?.id;
        if (!answerId) {
          throw new Error('Resposta em branco não criada');
        }
        const revision = await client.query<{ id: string }>(
          "INSERT INTO grade_revision(owner_id,answer_id,revision_number,kind,points_units,explanation) VALUES ($1,$2,1,'blank',0,'Questão não respondida.') RETURNING id",
          [ownerId, answerId],
        );
        await client.query(
          "INSERT INTO grade_current(owner_id,answer_id,current_revision_id,state) VALUES ($1,$2,$3,'graded')",
          [ownerId, answerId, revision.rows[0]?.id],
        );
      }
      const pending = await client.query(
        `SELECT 1 FROM grade_current gc JOIN answer a ON a.id=gc.answer_id AND a.owner_id=gc.owner_id
         WHERE a.owner_id=$1 AND a.attempt_id=$2 AND gc.state IN ('pending','failed') LIMIT 1`,
        [ownerId, attemptId],
      );
      await client.query(
        'UPDATE attempt SET state=$3,submitted_at=now(),version=version+1 WHERE owner_id=$1 AND id=$2',
        [
          ownerId,
          attemptId,
          pending.rowCount ? 'submitted_pending' : 'completed',
        ],
      );
    });
    return this.result(ownerId, attemptId);
  }

  async result(ownerId: string, attemptId: string) {
    const attempt = await this.pool.query<{
      id: string;
      state: string;
      submitted_at: Date | null;
      total: number;
    }>(
      `SELECT a.id,a.state,a.submitted_at,e.total FROM attempt a JOIN exam e ON e.id=a.exam_id AND e.owner_id=a.owner_id
       WHERE a.owner_id=$1 AND a.id=$2 AND a.deleted_at IS NULL AND e.deleted_at IS NULL`,
      [ownerId, attemptId],
    );
    const current = attempt.rows[0];
    if (!current) {
      throw new PublicError(404, 'NOT_FOUND', 'Tentativa não encontrada.');
    }
    if (!current.submitted_at) {
      throw new PublicError(
        409,
        'ATTEMPT_IN_PROGRESS',
        'Entregue a tentativa para consultar o resultado.',
      );
    }
    const rows = await this.pool.query<ResultEntity>(
      `SELECT a.id AS answer_id,q.id AS question_id,q.ordinal,q.type,t.display_name AS topic,
         a.state AS answer_state,gc.state AS grade_state,gr.points_units,gc.current_revision_id,
         d.id AS dispute_id,d.status AS dispute_status
       FROM attempt att JOIN question q ON q.exam_id=att.exam_id AND q.owner_id=att.owner_id
       JOIN topic t ON t.id=q.topic_id AND t.owner_id=q.owner_id
       LEFT JOIN answer a ON a.attempt_id=att.id AND a.question_id=q.id AND a.owner_id=att.owner_id
       LEFT JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
       LEFT JOIN grade_revision gr ON gr.id=gc.current_revision_id AND gr.owner_id=a.owner_id
       LEFT JOIN LATERAL (SELECT id,status FROM dispute WHERE owner_id=att.owner_id AND answer_id=a.id ORDER BY created_at DESC LIMIT 1) d ON true
       WHERE att.owner_id=$1 AND att.id=$2 ORDER BY q.ordinal`,
      [ownerId, attemptId],
    );
    const counts = {
      full: 0,
      partial: 0,
      wrong: 0,
      blank: 0,
      pending: 0,
      contested: 0,
    };
    let units = 0;
    let validCount = 0;
    for (const row of rows.rows) {
      if (row.grade_state === 'contested') {
        counts.contested++;
      } else if (
        row.grade_state === 'pending' ||
        row.grade_state === 'failed' ||
        row.points_units === null
      ) {
        counts.pending++;
      } else if (row.answer_state === 'blank') {
        counts.blank++;
      } else if (row.points_units === 10_000) {
        counts.full++;
      } else if (row.points_units === 0) {
        counts.wrong++;
      } else {
        counts.partial++;
      }
      if (row.grade_state === 'graded') {
        units += row.points_units ?? 0;
        validCount++;
      }
    }
    return {
      attemptId,
      state: current.state,
      submittedAt: current.submitted_at,
      points:
        current.state === 'completed' && validCount > 0
          ? displayPoints(units)
          : null,
      provisionalPoints: displayPoints(units),
      maxPoints: validCount,
      counts,
      answers: rows.rows.map((row) => ({
        answerId: row.answer_id,
        questionId: row.question_id,
        ordinal: row.ordinal,
        type: row.type,
        topic: row.topic,
        state: row.grade_state ?? 'pending',
        points:
          row.grade_state === 'graded' && row.points_units !== null
            ? row.points_units / 10_000
            : null,
        revisionId: row.current_revision_id,
        disputeId: row.dispute_id,
        disputeStatus: row.dispute_status,
      })),
    };
  }
}
