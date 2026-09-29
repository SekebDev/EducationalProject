import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { createPool } from '../../src/infrastructure/db/pool.js';
import {
  requestHash,
  withIdempotency,
} from '../../src/infrastructure/http/idempotency.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe('requestHash', () => {
  it('ignores object key order', () => {
    expect(requestHash({ b: 2, a: 1 })).toBe(requestHash({ a: 1, b: 2 }));
  });
});

describe.skipIf(!databaseUrl)('idempotency record', () => {
  it('creates once, replays for the owner, and rejects changed input', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const pool = createPool(databaseUrl);
    const email = `idempotency-${randomUUID()}@example.invalid`;
    let ownerId: string | undefined;
    try {
      const owner = await pool.query<{ id: string }>(
        "INSERT INTO student(email,password_hash) VALUES ($1,'hash') RETURNING id",
        [email],
      );
      ownerId = owner.rows[0]?.id;
      if (!ownerId) {
        throw new Error('Fixture inválida');
      }
      const key = randomUUID();
      const input = {
        ownerId,
        route: 'POST /exams',
        key,
        body: { total: 10, topic: 'Álgebra' },
      };
      let calls = 0;
      const create = async () => {
        calls++;
        return { resourceId: randomUUID(), status: 202 };
      };
      const authorizeReplay = async () => true;
      const first = await withIdempotency(pool, input, create, authorizeReplay);
      const second = await withIdempotency(
        pool,
        input,
        create,
        authorizeReplay,
      );
      expect(first.replay).toBe(false);
      expect(second).toMatchObject({
        replay: true,
        resourceId: first.resourceId,
      });
      expect(calls).toBe(1);
      await expect(
        withIdempotency(
          pool,
          { ...input, body: { total: 30, topic: 'Álgebra' } },
          create,
          authorizeReplay,
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      await expect(
        withIdempotency(pool, input, create, async () => false),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    } finally {
      if (ownerId) {
        await pool.query('DELETE FROM idempotency_record WHERE owner_id=$1', [
          ownerId,
        ]);
        await pool.query('DELETE FROM student WHERE id=$1', [ownerId]);
      }
      await pool.end();
    }
  });
});
