import { createHash } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import { transaction } from '../db/pool.js';
import { PublicError } from './public-error.js';

type IdempotentResult = { resourceId: string; status: number };

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Corpo fora do formato JSON');
  }
  return serialized;
}

export function requestHash(body: unknown): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

export async function withIdempotency(
  pool: pg.Pool,
  input: { ownerId: string; route: string; key: string; body: unknown },
  create: (client: pg.PoolClient) => Promise<IdempotentResult>,
  authorizeReplay: (
    client: pg.PoolClient,
    resourceId: string,
  ) => Promise<boolean>,
): Promise<IdempotentResult & { replay: boolean }> {
  if (!z.uuid().safeParse(input.key).success) {
    throw new PublicError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Envie uma chave de operação UUID.',
    );
  }
  const hash = requestHash(input.body);
  return transaction(pool, async (client) => {
    const inserted = await client.query(
      `INSERT INTO idempotency_record(owner_id,route,key,request_hash)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key`,
      [input.ownerId, input.route, input.key, hash],
    );
    if (inserted.rowCount === 0) {
      const record = await client.query<{
        request_hash: string;
        resource_id: string | null;
        response_status: number | null;
      }>(
        'SELECT request_hash,resource_id,response_status FROM idempotency_record WHERE owner_id=$1 AND route=$2 AND key=$3 FOR UPDATE',
        [input.ownerId, input.route, input.key],
      );
      const previous = record.rows[0];
      if (!previous) {
        throw new PublicError(
          409,
          'OPERATION_IN_PROGRESS',
          'Operação em andamento.',
          true,
        );
      }
      if (previous.request_hash !== hash) {
        throw new PublicError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'A chave foi usada com outros dados.',
        );
      }
      if (!previous.resource_id || !previous.response_status) {
        throw new PublicError(
          409,
          'OPERATION_IN_PROGRESS',
          'Operação em andamento.',
          true,
        );
      }
      if (!(await authorizeReplay(client, previous.resource_id))) {
        throw new PublicError(404, 'NOT_FOUND', 'Recurso não encontrado.');
      }
      return {
        resourceId: previous.resource_id,
        status: previous.response_status,
        replay: true,
      };
    }
    const created = await create(client);
    await client.query(
      'UPDATE idempotency_record SET resource_id=$4,response_status=$5 WHERE owner_id=$1 AND route=$2 AND key=$3',
      [
        input.ownerId,
        input.route,
        input.key,
        created.resourceId,
        created.status,
      ],
    );
    return { ...created, replay: false };
  });
}
