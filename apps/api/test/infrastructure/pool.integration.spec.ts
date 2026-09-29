import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createPool, transaction } from '../../src/infrastructure/db/pool.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('database transaction', () => {
  it('commits a successful transaction and releases its connection', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    const pool = createPool(databaseUrl);
    try {
      const count = await transaction(pool, async (client: pg.PoolClient) => {
        const result = await client.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM pg_tables',
        );
        return result.rows[0]?.count;
      });
      expect(Number(count)).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });
});
