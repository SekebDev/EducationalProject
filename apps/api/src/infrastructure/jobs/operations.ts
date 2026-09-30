import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPool, transaction } from '../db/pool.js';
import { PublicError } from '../http/public-error.js';
import { withIdempotency } from '../http/idempotency.js';

export const operationKinds = [
  'extract-material',
  'embed-material',
  'answer-chat',
  'generate-exam',
  'grade-answer',
  'reevaluate-answer',
  'explain-insights',
  'purge-resource',
] as const;
export type OperationKind = (typeof operationKinds)[number];

export type OperationLease = {
  id: string;
  ownerId: string;
  resourceId: string;
  kind: OperationKind;
  inputVersion: number;
  fenceVersion: number;
  attemptCount: number;
};

export type OperationView = {
  id: string;
  kind: OperationKind;
  state: string;
  phase: string;
  attemptCount: number;
  retryable: boolean;
  error: string | null;
  resourceId: string;
  updatedAt: Date;
};

type OperationRow = {
  id: string;
  owner_id: string;
  resource_id: string;
  kind: OperationKind;
  input_version: number;
  fence_version: number;
  state: string;
  phase: string;
  attempt_count: number;
  error_code: string | null;
  updated_at: Date;
};

export class OperationRepository {
  readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = createPool(databaseUrl);
  }

  async create(
    client: pg.PoolClient,
    input: {
      ownerId: string;
      resourceId: string;
      kind: OperationKind;
      dedupeKey: string;
      inputVersion: number;
    },
  ): Promise<string> {
    const id = randomUUID();
    const result = await client.query<{ id: string }>(
      `INSERT INTO operation(id,owner_id,kind,resource_id,dedupe_key,state,input_version)
       VALUES ($1,$2,$3,$4,$5,'pending',$6)
       ON CONFLICT (owner_id,kind,dedupe_key) DO UPDATE SET dedupe_key=EXCLUDED.dedupe_key
       RETURNING id`,
      [
        id,
        input.ownerId,
        input.kind,
        input.resourceId,
        input.dedupeKey,
        input.inputVersion,
      ],
    );
    const operationId = result.rows[0]?.id;
    if (!operationId) {
      throw new Error('Operação não criada');
    }
    return operationId;
  }

  async get(ownerId: string, operationId: string): Promise<OperationView> {
    const result = await this.pool.query<OperationRow>(
      'SELECT * FROM operation WHERE owner_id=$1 AND id=$2',
      [ownerId, operationId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new PublicError(404, 'NOT_FOUND', 'Operação não encontrada.');
    }
    if (row.kind === 'answer-chat') {
      const active = await this.pool.query(
        `SELECT 1 FROM message m JOIN conversation c ON c.id=m.conversation_id AND c.owner_id=m.owner_id
         WHERE m.owner_id=$1 AND m.id=$2 AND c.deleted_at IS NULL`,
        [ownerId, row.resource_id],
      );
      if (!active.rowCount) {
        throw new PublicError(404, 'NOT_FOUND', 'Operação não encontrada.');
      }
    }
    if (row.kind === 'generate-exam') {
      const active = await this.pool.query(
        'SELECT 1 FROM exam WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL',
        [ownerId, row.resource_id],
      );
      if (!active.rowCount) {
        throw new PublicError(404, 'NOT_FOUND', 'Operação não encontrada.');
      }
    }
    if (row.kind === 'extract-material' || row.kind === 'embed-material') {
      const active = await this.pool.query(
        `SELECT 1 FROM material m JOIN conversation c ON c.id=m.conversation_id AND c.owner_id=m.owner_id
         WHERE m.owner_id=$1 AND m.id=$2 AND m.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [ownerId, row.resource_id],
      );
      if (!active.rowCount) {
        throw new PublicError(404, 'NOT_FOUND', 'Operação não encontrada.');
      }
    }
    if (row.kind === 'grade-answer') {
      const active = await this.pool.query(
        `SELECT 1 FROM answer a JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
         JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
         WHERE a.owner_id=$1 AND a.id=$2 AND att.deleted_at IS NULL AND e.deleted_at IS NULL`,
        [ownerId, row.resource_id],
      );
      if (!active.rowCount) {
        throw new PublicError(404, 'NOT_FOUND', 'Operação não encontrada.');
      }
    }
    if (row.kind === 'reevaluate-answer') {
      const active = await this.pool.query(
        `SELECT 1 FROM dispute d JOIN answer a ON a.id=d.answer_id AND a.owner_id=d.owner_id
         JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
         JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
         WHERE d.owner_id=$1 AND d.id=$2 AND att.deleted_at IS NULL AND e.deleted_at IS NULL`,
        [ownerId, row.resource_id],
      );
      if (!active.rowCount) {
        throw new PublicError(404, 'NOT_FOUND', 'Operação não encontrada.');
      }
    }
    return {
      id: row.id,
      kind: row.kind,
      state: row.state,
      phase: row.phase,
      attemptCount: row.attempt_count,
      retryable: row.state === 'failed',
      error: row.error_code,
      resourceId: row.resource_id,
      updatedAt: row.updated_at,
    };
  }

  async pendingDispatch(limit = 50): Promise<OperationLease[]> {
    const result = await this.pool.query<OperationRow>(
      `SELECT id,owner_id,resource_id,kind,input_version,fence_version,attempt_count
       FROM operation WHERE
       state='pending' AND dispatch_state='pending'
       AND (lease_until IS NULL OR lease_until<=now())
       ORDER BY created_at LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => this.leaseFromRow(row));
  }

  async recoverExpired(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE operation SET state='pending',phase='queued',dispatch_state='pending',
       lease_until=NULL,fence_version=fence_version+1,updated_at=now()
       WHERE state='running' AND lease_until<now()`,
    );
    return result.rowCount ?? 0;
  }

  async markDispatched(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE operation SET dispatch_state='dispatched',updated_at=now() WHERE id=$1 AND state IN ('pending','running')",
      [id],
    );
  }

  async acquire(
    id: string,
    ownerId: string,
    inputVersion: number,
  ): Promise<OperationLease | null> {
    const result = await this.pool.query<OperationRow>(
      `UPDATE operation SET state='running',phase='working',attempt_count=attempt_count+1,
       fence_version=fence_version+1,lease_until=now()+interval '180 seconds',updated_at=now()
       WHERE id=$1 AND owner_id=$2 AND input_version=$3 AND attempt_count<3
       AND (state='pending' OR (state='running' AND lease_until<now()))
       AND (lease_until IS NULL OR lease_until<=now())
       RETURNING id,owner_id,resource_id,kind,input_version,fence_version,attempt_count`,
      [id, ownerId, inputVersion],
    );
    const row = result.rows[0];
    return row ? this.leaseFromRow(row) : null;
  }

  async complete(
    lease: OperationLease,
    apply: (client: pg.PoolClient) => Promise<void>,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const current = await client.query(
        `SELECT 1 FROM operation WHERE id=$1 AND owner_id=$2 AND fence_version=$3
         AND state='running' AND lease_until>now() FOR UPDATE`,
        [lease.id, lease.ownerId, lease.fenceVersion],
      );
      if (current.rowCount === 0) {
        return false;
      }
      await apply(client);
      await client.query(
        "UPDATE operation SET state='completed',phase='completed',lease_until=NULL,error_code=NULL,updated_at=now() WHERE id=$1",
        [lease.id],
      );
      await this.addEvent(client, lease.id, lease.ownerId, 'completed', {});
      return true;
    });
  }

  async fail(
    lease: OperationLease,
    code: string,
    retryable: boolean,
  ): Promise<boolean> {
    const safeCode = /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'JOB_FAILED';
    return transaction(this.pool, async (client) => {
      const current = await client.query<{
        attempt_count: number;
        kind: OperationKind;
        resource_id: string;
      }>(
        "SELECT attempt_count,kind,resource_id FROM operation WHERE id=$1 AND owner_id=$2 AND fence_version=$3 AND state='running' FOR UPDATE",
        [lease.id, lease.ownerId, lease.fenceVersion],
      );
      const row = current.rows[0];
      if (!row) {
        return false;
      }
      const willRetry = retryable && row.attempt_count < 3;
      const delaySeconds = Math.min(
        60,
        2 ** row.attempt_count + Math.floor(Math.random() * 3),
      );
      await client.query(
        `UPDATE operation SET state=$2,phase=$3,error_code=$4,dispatch_state='pending',
         lease_until=CASE WHEN $5 THEN now()+make_interval(secs=>$6) ELSE NULL END,updated_at=now()
         WHERE id=$1`,
        [
          lease.id,
          willRetry ? 'pending' : 'failed',
          willRetry ? 'retry_wait' : 'failed',
          safeCode,
          willRetry,
          delaySeconds,
        ],
      );
      if (!willRetry && row.kind === 'answer-chat') {
        await client.query(
          "UPDATE message SET state='failed' WHERE owner_id=$1 AND id=$2 AND state IN ('queued','generating')",
          [lease.ownerId, row.resource_id],
        );
      }
      if (!willRetry && row.kind === 'generate-exam') {
        await client.query(
          "UPDATE exam SET state='failed' WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL AND state IN ('queued','generating')",
          [lease.ownerId, row.resource_id],
        );
      }
      if (!willRetry && row.kind === 'extract-material') {
        await client.query(
          "UPDATE material SET state='failed',error_code=$3 WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL AND state IN ('received','processing')",
          [lease.ownerId, row.resource_id, safeCode],
        );
      }
      if (!willRetry && row.kind === 'grade-answer') {
        await client.query(
          "UPDATE grade_current SET state='failed' WHERE owner_id=$1 AND answer_id=$2 AND state='pending'",
          [lease.ownerId, row.resource_id],
        );
      }
      if (!willRetry && row.kind === 'reevaluate-answer') {
        await client.query(
          "UPDATE dispute SET status='open' WHERE owner_id=$1 AND id=$2 AND status='reviewing'",
          [lease.ownerId, row.resource_id],
        );
      }
      await this.addEvent(
        client,
        lease.id,
        lease.ownerId,
        willRetry ? 'state' : 'failed',
        {
          phase: willRetry ? 'retry_wait' : 'failed',
          code: safeCode,
        },
      );
      return true;
    });
  }

  async retry(ownerId: string, id: string, key: string): Promise<void> {
    await withIdempotency(
      this.pool,
      { ownerId, route: `POST /operations/${id}/retry`, key, body: {} },
      async (client) => {
        await this.retryLocked(client, ownerId, id);
        return { resourceId: id, status: 202 };
      },
      async (client, resourceId) => {
        const row = await client.query(
          'SELECT 1 FROM operation WHERE owner_id=$1 AND id=$2',
          [ownerId, resourceId],
        );
        return row.rowCount !== 0;
      },
    );
  }

  private async retryLocked(
    client: pg.PoolClient,
    ownerId: string,
    id: string,
  ) {
    const existing = await client.query<{
      state: string;
      kind: OperationKind;
      resource_id: string;
    }>(
      'SELECT state,kind,resource_id FROM operation WHERE owner_id=$1 AND id=$2 FOR UPDATE',
      [ownerId, id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new PublicError(404, 'NOT_FOUND', 'Operação não encontrada.');
    }
    if (row.state !== 'failed') {
      throw new PublicError(
        409,
        'RETRY_UNAVAILABLE',
        'Operação não pode ser repetida.',
      );
    }
    if (row.kind === 'answer-chat') {
      const active = await client.query(
        `SELECT 1 FROM message m JOIN conversation c ON c.id=m.conversation_id AND c.owner_id=m.owner_id
           WHERE m.owner_id=$1 AND m.id=$2 AND m.state='failed' AND c.deleted_at IS NULL`,
        [ownerId, row.resource_id],
      );
      if (!active.rowCount) {
        throw new PublicError(
          409,
          'RESOURCE_UNAVAILABLE',
          'A conversa não está mais disponível para repetir a resposta.',
        );
      }
    }
    if (row.kind === 'generate-exam') {
      const active = await client.query<{ id: string }>(
        `SELECT e.id FROM exam e WHERE e.owner_id=$1 AND e.id=$2 AND e.deleted_at IS NULL AND e.state='failed'
           AND e.context_snapshot IS NOT NULL
           AND EXISTS (SELECT 1 FROM conversation c WHERE c.owner_id=e.owner_id AND c.id=e.conversation_id AND c.deleted_at IS NULL)
           AND NOT EXISTS (
             SELECT 1 FROM exam_source es LEFT JOIN material m ON m.id=es.material_id AND m.owner_id=es.owner_id
             WHERE es.owner_id=e.owner_id AND es.exam_id=e.id AND
               (es.available=false OR m.id IS NULL OR m.deleted_at IS NOT NULL OR m.state<>'ready' OR m.version<>es.material_version)
           ) FOR UPDATE`,
        [ownerId, row.resource_id],
      );
      if (!active.rowCount) {
        throw new PublicError(
          409,
          'RESOURCE_UNAVAILABLE',
          'Atualize as fontes antes de gerar outra prova.',
        );
      }
      await client.query(
        "UPDATE exam SET state='queued' WHERE owner_id=$1 AND id=$2",
        [ownerId, row.resource_id],
      );
    }
    if (row.kind === 'grade-answer') {
      const active = await client.query(
        `SELECT 1 FROM answer a JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
         JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
         JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
         WHERE a.owner_id=$1 AND a.id=$2 AND a.state='confirmed_pending' AND gc.state='failed'
           AND att.deleted_at IS NULL AND e.deleted_at IS NULL FOR UPDATE OF a`,
        [ownerId, row.resource_id],
      );
      if (!active.rowCount) {
        throw new PublicError(
          409,
          'RESOURCE_UNAVAILABLE',
          'A resposta não está disponível para nova correção.',
        );
      }
      await client.query(
        "UPDATE grade_current SET state='pending' WHERE owner_id=$1 AND answer_id=$2",
        [ownerId, row.resource_id],
      );
    }
    if (row.kind === 'reevaluate-answer') {
      const active = await client.query(
        `SELECT 1 FROM dispute d JOIN answer a ON a.id=d.answer_id AND a.owner_id=d.owner_id
         JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
         WHERE d.owner_id=$1 AND d.id=$2 AND d.status='open' AND att.deleted_at IS NULL FOR UPDATE OF d`,
        [ownerId, row.resource_id],
      );
      if (!active.rowCount) {
        throw new PublicError(
          409,
          'RESOURCE_UNAVAILABLE',
          'Contestação indisponível.',
        );
      }
      await client.query(
        "UPDATE dispute SET status='reviewing' WHERE owner_id=$1 AND id=$2",
        [ownerId, row.resource_id],
      );
    }
    const result = await client.query(
      `UPDATE operation SET state='pending',phase='queued',attempt_count=0,
         dispatch_state='pending',lease_until=NULL,error_code=NULL,
         fence_version=fence_version+1,updated_at=now()
         WHERE owner_id=$1 AND id=$2 AND state='failed' RETURNING id`,
      [ownerId, id],
    );
    if (result.rowCount === 0) {
      throw new Error('Falha ao reabrir operação');
    }
    await this.addEvent(client, id, ownerId, 'state', { phase: 'queued' });
  }

  async cancel(ownerId: string, id: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE operation SET state='cancelled',phase='cancelled',fence_version=fence_version+1,
         lease_until=NULL,updated_at=now() WHERE owner_id=$1 AND id=$2 AND state IN ('pending','running') RETURNING id`,
        [ownerId, id],
      );
      if (result.rowCount) {
        await this.addEvent(client, id, ownerId, 'failed', {
          code: 'CANCELLED',
        });
      }
    });
  }

  async events(
    ownerId: string,
    id: string,
    after: number,
  ): Promise<Array<{ sequence: number; type: string; data: unknown }>> {
    await this.get(ownerId, id);
    const result = await this.pool.query<{
      sequence: number;
      type: string;
      data: unknown;
    }>(
      'SELECT sequence,type,data FROM operation_event WHERE owner_id=$1 AND operation_id=$2 AND sequence>$3 ORDER BY sequence LIMIT 100',
      [ownerId, id, after],
    );
    return result.rows;
  }

  private async addEvent(
    client: pg.PoolClient,
    id: string,
    ownerId: string,
    type: string,
    data: unknown,
  ): Promise<void> {
    await client.query(
      `INSERT INTO operation_event(operation_id,owner_id,sequence,type,data)
       SELECT $1,$2,COALESCE(MAX(sequence),0)+1,$3,$4::jsonb
       FROM operation_event WHERE operation_id=$1`,
      [id, ownerId, type, JSON.stringify(data)],
    );
  }

  private leaseFromRow(row: OperationRow): OperationLease {
    return {
      id: row.id,
      ownerId: row.owner_id,
      resourceId: row.resource_id,
      kind: row.kind,
      inputVersion: row.input_version,
      fenceVersion: row.fence_version,
      attemptCount: row.attempt_count,
    };
  }
}
