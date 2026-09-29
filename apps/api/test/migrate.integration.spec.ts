import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/infrastructure/db/migrate.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('initial migration', () => {
  it('is repeatable and prevents linking a material to another owner', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    await migrate(databaseUrl);
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query('BEGIN');
      const first = await client.query<{ id: string }>(
        "INSERT INTO student(email,password_hash) VALUES ($1,'hash') RETURNING id",
        [`a-${randomUUID()}@example.invalid`],
      );
      const second = await client.query<{ id: string }>(
        "INSERT INTO student(email,password_hash) VALUES ($1,'hash') RETURNING id",
        [`b-${randomUUID()}@example.invalid`],
      );
      const firstId = first.rows[0]?.id;
      const secondId = second.rows[0]?.id;
      if (!firstId || !secondId) {
        throw new Error('Fixture inválida');
      }
      const conversation = await client.query<{ id: string }>(
        "INSERT INTO conversation(owner_id,title,personality_key) VALUES ($1,'Teste','objetiva') RETURNING id",
        [firstId],
      );
      const conversationId = conversation.rows[0]?.id;
      if (!conversationId) {
        throw new Error('Fixture inválida');
      }
      await expect(
        client.query(
          "INSERT INTO material(owner_id,conversation_id,original_name,byte_size,checksum,object_key,state) VALUES ($1,$2,'a.txt',1,'hash',$3,'received')",
          [secondId, conversationId, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
