import pg from 'pg';
import { createPool, transaction } from '../db/pool.js';
import { readConfig } from '../config.js';
import { MaterialStorage } from '../storage/material-storage.js';
import type { DeletableType } from './deletion-record.js';

type RecordRow = {
  resource_type: DeletableType;
  resource_id: string;
  owner_id: string | null;
};

export class DeletionPurger {
  private readonly pool: pg.Pool;
  private readonly storage: MaterialStorage;

  constructor(databaseUrl: string) {
    this.pool = createPool(databaseUrl);
    this.storage = new MaterialStorage(this.pool, readConfig(process.env));
  }

  async purgeDue(hours = 23): Promise<number> {
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      throw new RangeError('Janela inválida');
    }
    let purged = 0;
    for (let index = 0; index < 25; index++) {
      const processed = await transaction(this.pool, async (client) => {
        const due = await client.query<RecordRow>(
          `SELECT resource_type,resource_id,owner_id FROM deletion_record
           WHERE purge_state='pending' AND deleted_at <= now()-($1::double precision * interval '1 hour')
           ORDER BY CASE resource_type WHEN 'material' THEN 0 WHEN 'attempt' THEN 1 WHEN 'exam' THEN 2 ELSE 3 END,
             deleted_at,resource_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [hours],
        );
        const row = due.rows[0];
        if (!row) {
          return false;
        }
        await this.purgeRecord(client, row);
        await client.query(
          "UPDATE deletion_record SET purge_state='purged',purged_at=now() WHERE resource_type=$1 AND resource_id=$2",
          [row.resource_type, row.resource_id],
        );
        return true;
      });
      if (!processed) {
        break;
      }
      purged++;
    }
    return purged;
  }

  async pruneRecords(days = 37): Promise<number> {
    if (!Number.isInteger(days) || days < 7) {
      throw new RangeError('Retenção inválida');
    }
    const result = await this.pool.query(
      "DELETE FROM deletion_record WHERE purge_state='purged' AND purged_at < now()-($1::integer * interval '1 day')",
      [days],
    );
    return result.rowCount ?? 0;
  }

  async close() {
    await this.pool.end();
  }

  private async purgeRecord(
    client: pg.PoolClient,
    row: RecordRow,
  ): Promise<void> {
    const { owner_id: ownerId, resource_id: id } = row;
    if (!ownerId) {
      throw new Error('DeletionRecord sem proprietário');
    }
    if (row.resource_type === 'material') {
      const material = await client.query<{ object_key: string }>(
        'SELECT object_key FROM material WHERE owner_id=$1 AND id=$2 AND deleted_at IS NOT NULL FOR UPDATE',
        [ownerId, id],
      );
      const source = material.rows[0];
      if (!source) {
        return;
      }
      await this.storage.purge(source.object_key);
      await client.query(
        'UPDATE exam_source SET available=false,material_id=NULL WHERE owner_id=$1 AND material_id=$2',
        [ownerId, id],
      );
      await client.query(
        'DELETE FROM conversation_source WHERE owner_id=$1 AND material_id=$2',
        [ownerId, id],
      );
      await client.query(
        'DELETE FROM material_chunk WHERE owner_id=$1 AND material_id=$2',
        [ownerId, id],
      );
      await client.query('DELETE FROM material WHERE owner_id=$1 AND id=$2', [
        ownerId,
        id,
      ]);
    } else if (row.resource_type === 'attempt') {
      const active = await client.query(
        'SELECT 1 FROM attempt WHERE owner_id=$1 AND id=$2 AND deleted_at IS NOT NULL',
        [ownerId, id],
      );
      if (active.rowCount) {
        await this.purgeAttempt(client, ownerId, id);
      }
    } else if (row.resource_type === 'exam') {
      const active = await client.query(
        'SELECT 1 FROM exam WHERE owner_id=$1 AND id=$2 AND deleted_at IS NOT NULL',
        [ownerId, id],
      );
      if (!active.rowCount) {
        return;
      }
      const attempt = await client.query<{ id: string }>(
        'SELECT id FROM attempt WHERE owner_id=$1 AND exam_id=$2',
        [ownerId, id],
      );
      for (const item of attempt.rows) {
        await this.purgeAttempt(client, ownerId, item.id);
        await client.query(
          "UPDATE deletion_record SET purge_state='purged',purged_at=now() WHERE resource_type='attempt' AND resource_id=$1",
          [item.id],
        );
      }
      await client.query(
        'DELETE FROM question_secret WHERE owner_id=$1 AND question_id IN (SELECT id FROM question WHERE owner_id=$1 AND exam_id=$2)',
        [ownerId, id],
      );
      await client.query(
        'DELETE FROM question WHERE owner_id=$1 AND exam_id=$2',
        [ownerId, id],
      );
      await client.query(
        'DELETE FROM exam_source WHERE owner_id=$1 AND exam_id=$2',
        [ownerId, id],
      );
      await client.query(
        'DELETE FROM exam_topic WHERE owner_id=$1 AND exam_id=$2',
        [ownerId, id],
      );
      await client.query(
        'DELETE FROM exam WHERE owner_id=$1 AND id=$2 AND deleted_at IS NOT NULL',
        [ownerId, id],
      );
    } else if (row.resource_type === 'conversation') {
      const active = await client.query(
        'SELECT 1 FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NOT NULL',
        [ownerId, id],
      );
      if (!active.rowCount) {
        return;
      }
      const remaining = await client.query(
        'SELECT 1 FROM material WHERE owner_id=$1 AND conversation_id=$2 LIMIT 1',
        [ownerId, id],
      );
      if (remaining.rowCount) {
        throw new Error('MATERIAL_PURGE_PENDING');
      }
      await client.query(
        'UPDATE exam SET conversation_id=NULL,context_snapshot=NULL WHERE owner_id=$1 AND conversation_id=$2',
        [ownerId, id],
      );
      await client.query(
        'DELETE FROM conversation_source WHERE owner_id=$1 AND conversation_id=$2',
        [ownerId, id],
      );
      await client.query(
        'DELETE FROM message WHERE owner_id=$1 AND conversation_id=$2',
        [ownerId, id],
      );
      await client.query(
        'DELETE FROM conversation WHERE owner_id=$1 AND id=$2 AND deleted_at IS NOT NULL',
        [ownerId, id],
      );
    }
  }

  private async purgeAttempt(
    client: pg.PoolClient,
    ownerId: string,
    id: string,
  ) {
    const answers = await client.query<{ id: string }>(
      'SELECT id FROM answer WHERE owner_id=$1 AND attempt_id=$2',
      [ownerId, id],
    );
    const answerIds = answers.rows.map((row) => row.id);
    if (answerIds.length) {
      await client.query(
        "UPDATE recommendation SET state='stale' WHERE owner_id=$1 AND evidence_answer_ids && $2::uuid[]",
        [ownerId, answerIds],
      );
      await client.query(
        'DELETE FROM dispute WHERE owner_id=$1 AND answer_id=ANY($2::uuid[])',
        [ownerId, answerIds],
      );
      await client.query(
        'DELETE FROM grade_current WHERE owner_id=$1 AND answer_id=ANY($2::uuid[])',
        [ownerId, answerIds],
      );
      await client.query(
        'DELETE FROM grade_revision WHERE owner_id=$1 AND answer_id=ANY($2::uuid[])',
        [ownerId, answerIds],
      );
      await client.query(
        'DELETE FROM answer WHERE owner_id=$1 AND attempt_id=$2',
        [ownerId, id],
      );
    }
    await client.query('DELETE FROM attempt WHERE owner_id=$1 AND id=$2', [
      ownerId,
      id,
    ]);
  }
}
