import { Injectable } from '@nestjs/common';
import { readConfig } from '../../infrastructure/config.js';
import { createPool, transaction } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { withIdempotency } from '../../infrastructure/http/idempotency.js';
import { OperationRepository } from '../../infrastructure/jobs/operations.js';

@Injectable()
export class DisputesService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);
  private readonly operations = new OperationRepository(
    readConfig(process.env).databaseUrl,
  );

  async open(ownerId: string, answerId: string, reason: string) {
    const clean = reason.trim();
    if (!clean || clean.length > 2_000) {
      throw new PublicError(
        422,
        'DISPUTE_INVALID',
        'Explique o motivo em até 2.000 caracteres.',
      );
    }
    return transaction(this.pool, async (client) => {
      const found = await client.query<{ revision_id: string }>(
        `SELECT gc.current_revision_id AS revision_id FROM answer a
         JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
         JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
         JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
         WHERE a.owner_id=$1 AND a.id=$2 AND att.submitted_at IS NOT NULL AND att.deleted_at IS NULL
           AND e.deleted_at IS NULL AND gc.state='graded' FOR UPDATE OF gc`,
        [ownerId, answerId],
      );
      const current = found.rows[0];
      if (!current) {
        throw new PublicError(
          409,
          'DISPUTE_UNAVAILABLE',
          'Esta correção não está disponível para contestação.',
        );
      }
      const created = await client.query<{ id: string }>(
        `INSERT INTO dispute(owner_id,answer_id,grade_revision_id,reason,status)
         VALUES ($1,$2,$3,$4,'open') RETURNING id`,
        [ownerId, answerId, current.revision_id, clean],
      );
      await client.query(
        "UPDATE grade_current SET state='contested' WHERE owner_id=$1 AND answer_id=$2",
        [ownerId, answerId],
      );
      return {
        id: created.rows[0]?.id,
        answerId,
        status: 'open',
        reason: clean,
      };
    });
  }

  async reevaluate(ownerId: string, disputeId: string, key: string) {
    const result = await withIdempotency(
      this.pool,
      {
        ownerId,
        route: `POST /disputes/${disputeId}/reevaluate`,
        key,
        body: {},
      },
      async (client) => {
        const found = await client.query<{ answer_id: string }>(
          `SELECT d.answer_id FROM dispute d JOIN answer a ON a.id=d.answer_id AND a.owner_id=d.owner_id
           JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
           JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
           WHERE d.owner_id=$1 AND d.id=$2 AND d.status='open' AND att.deleted_at IS NULL AND e.deleted_at IS NULL
           FOR UPDATE OF d`,
          [ownerId, disputeId],
        );
        if (!found.rowCount) {
          throw new PublicError(
            409,
            'DISPUTE_UNAVAILABLE',
            'Atualize a contestação antes de pedir reavaliação.',
          );
        }
        const operationId = await this.operations.create(client, {
          ownerId,
          resourceId: disputeId,
          kind: 'reevaluate-answer',
          dedupeKey: key,
          inputVersion: 1,
        });
        await client.query(
          "UPDATE dispute SET status='reviewing' WHERE owner_id=$1 AND id=$2",
          [ownerId, disputeId],
        );
        return { resourceId: operationId, status: 202 };
      },
      async (client, operationId) =>
        (
          await client.query(
            "SELECT 1 FROM operation WHERE owner_id=$1 AND id=$2 AND kind='reevaluate-answer'",
            [ownerId, operationId],
          )
        ).rowCount !== 0,
    );
    return { disputeId, operationId: result.resourceId };
  }

  async revisions(ownerId: string, answerId: string) {
    const allowed = await this.pool.query(
      `SELECT 1 FROM answer a JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
       JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
       WHERE a.owner_id=$1 AND a.id=$2 AND a.confirmed_at IS NOT NULL AND att.deleted_at IS NULL AND e.deleted_at IS NULL`,
      [ownerId, answerId],
    );
    if (!allowed.rowCount) {
      throw new PublicError(404, 'NOT_FOUND', 'Resposta não encontrada.');
    }
    const rows = await this.pool.query(
      `SELECT id,revision_number,kind,points_units,criterion_scores,explanation,gaps,reference_answer,created_at
       FROM grade_revision WHERE owner_id=$1 AND answer_id=$2 ORDER BY revision_number`,
      [ownerId, answerId],
    );
    return { items: rows.rows };
  }
}
