import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { transaction } from '../../src/infrastructure/db/pool.js';
import { OperationRepository } from '../../src/infrastructure/jobs/operations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('operation lease', () => {
  it('replays a retry with the same key without opening another operation', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const operations = new OperationRepository(databaseUrl);
    const ownerId = randomUUID();
    const key = randomUUID();
    let operationId: string | undefined;
    try {
      await operations.pool.query(
        'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
        [ownerId, `${ownerId}@example.invalid`, 'hash'],
      );
      operationId = await transaction(operations.pool, (client) =>
        operations.create(client, {
          ownerId,
          resourceId: randomUUID(),
          kind: 'explain-insights',
          dedupeKey: randomUUID(),
          inputVersion: 1,
        }),
      );
      const lease = await operations.acquire(operationId, ownerId, 1);
      if (!lease) {
        throw new Error('Lease ausente');
      }
      await operations.fail(lease, 'TEST_FAILURE', false);
      expect((await operations.get(ownerId, operationId)).state).toBe('failed');
      await operations.retry(ownerId, operationId, key);
      await operations.retry(ownerId, operationId, key);
      expect((await operations.get(ownerId, operationId)).state).toBe(
        'pending',
      );
      await expect(
        operations.retry(ownerId, operationId, randomUUID()),
      ).rejects.toMatchObject({ code: 'RETRY_UNAVAILABLE' });
    } finally {
      if (operationId) {
        await operations.pool.query(
          'DELETE FROM idempotency_record WHERE owner_id=$1',
          [ownerId],
        );
        await operations.pool.query(
          'DELETE FROM operation_event WHERE operation_id=$1',
          [operationId],
        );
        await operations.pool.query('DELETE FROM operation WHERE id=$1', [
          operationId,
        ]);
      }
      await operations.pool.query('DELETE FROM student WHERE id=$1', [ownerId]);
      await operations.pool.end();
    }
  });

  it('fences stale completions and retains one operation across retry', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const operations = new OperationRepository(databaseUrl);
    const ownerId = randomUUID();
    const resourceId = randomUUID();
    let operationId: string | undefined;
    try {
      await operations.pool.query(
        'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
        [ownerId, `${ownerId}@example.invalid`, 'hash'],
      );
      operationId = await transaction(operations.pool, (client) =>
        operations.create(client, {
          ownerId,
          resourceId,
          kind: 'explain-insights',
          dedupeKey: randomUUID(),
          inputVersion: 1,
        }),
      );
      const firstLease = await operations.acquire(operationId, ownerId, 1);
      expect(firstLease).not.toBeNull();
      if (!firstLease) {
        throw new Error('Lease ausente');
      }
      await operations.fail(firstLease, 'TEMPORARY', true);
      await operations.pool.query(
        "UPDATE operation SET lease_until=now()-interval '1 second' WHERE id=$1",
        [operationId],
      );
      const secondLease = await operations.acquire(operationId, ownerId, 1);
      expect(secondLease?.fenceVersion).toBeGreaterThan(
        firstLease.fenceVersion,
      );
      if (!secondLease) {
        throw new Error('Segundo lease ausente');
      }
      expect(await operations.complete(firstLease, async () => undefined)).toBe(
        false,
      );
      expect(
        await operations.complete(secondLease, async () => undefined),
      ).toBe(true);
      expect((await operations.get(ownerId, operationId)).state).toBe(
        'completed',
      );
    } finally {
      if (operationId) {
        await operations.pool.query(
          'DELETE FROM operation_event WHERE operation_id=$1',
          [operationId],
        );
        await operations.pool.query('DELETE FROM operation WHERE id=$1', [
          operationId,
        ]);
      }
      await operations.pool.query('DELETE FROM student WHERE id=$1', [ownerId]);
      await operations.pool.end();
    }
  });
});
