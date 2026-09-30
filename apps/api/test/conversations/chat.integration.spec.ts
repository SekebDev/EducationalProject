import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { OperationRepository } from '../../src/infrastructure/jobs/operations.js';
import { ConversationsService } from '../../src/modules/conversations/conversations.service.js';
import { createChatJobHandler } from '../../src/modules/conversations/chat.job.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('conversation and chat behavior', () => {
  it('keeps ownership, personality snapshots, history, and one logical retry', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const environment = [
      'DATABASE_URL',
      'APP_ORIGIN',
      'SESSION_SECRET',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_FROM',
      'AI_PROVIDER',
    ].map((key) => [key, process.env[key]] as const);
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-123456789012345678901234',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'study@example.invalid',
      AI_PROVIDER: 'fake',
    });

    const service = new ConversationsService();
    const operations = new OperationRepository(databaseUrl);
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const ownerId = randomUUID();
    const otherId = randomUUID();
    let conversationId: string | undefined;
    let operationId: string | undefined;
    try {
      for (const id of [ownerId, otherId]) {
        await client.query(
          'INSERT INTO student(id,email,password_hash) VALUES ($1,$2,$3)',
          [id, `${id}@example.invalid`, 'hash'],
        );
      }
      const conversation = await service.create(ownerId, randomUUID(), {
        personality: 'acolhedora',
      });
      conversationId = conversation.id;
      const questionKey = randomUUID();
      const first = await service.sendMessage(
        ownerId,
        conversation.id,
        questionKey,
        {
          content: 'Como funciona a fotossíntese?',
          conversationVersion: conversation.version,
        },
      );
      const replay = await service.sendMessage(
        ownerId,
        conversation.id,
        questionKey,
        {
          content: 'Como funciona a fotossíntese?',
          conversationVersion: conversation.version,
        },
      );
      expect(replay.assistantMessageId).toBe(first.assistantMessageId);
      operationId = first.operationId;
      const snapshot = await client.query<{
        personality_version_snapshot: number;
      }>('SELECT personality_version_snapshot FROM message WHERE id=$1', [
        first.assistantMessageId,
      ]);
      expect(snapshot.rows[0]?.personality_version_snapshot).toBe(1);

      const updated = await service.update(ownerId, conversation.id, {
        personality: 'socratica',
        version: conversation.version + 1,
      });
      expect(updated.personality).toBe('socratica');
      await expect(service.get(otherId, conversation.id)).rejects.toMatchObject(
        {
          status: 404,
        },
      );

      const lease = await operations.acquire(operationId, ownerId, 1);
      expect(lease).not.toBeNull();
      if (!lease) {
        throw new Error('Lease ausente');
      }
      const handler = createChatJobHandler(databaseUrl);
      const result = await handler(lease);
      expect(await operations.complete(lease, result.apply)).toBe(true);

      const messages = await service.messages(ownerId, conversation.id);
      expect(messages.items).toHaveLength(2);
      expect(messages.items[0]?.personality).toBe('acolhedora');
      expect(messages.items[1]?.personality).toBe('acolhedora');
      expect(messages.items[1]?.state).toBe('completed');
      expect(messages.items[1]?.content).toContain('Modo de demonstração');
      await service.delete(ownerId, conversation.id);
      await expect(service.get(ownerId, conversation.id)).rejects.toMatchObject(
        {
          status: 404,
        },
      );
    } finally {
      if (conversationId) {
        await client.query(
          'DELETE FROM message WHERE owner_id=$1 AND conversation_id=$2',
          [ownerId, conversationId],
        );
        await client.query('DELETE FROM conversation WHERE id=$1', [
          conversationId,
        ]);
      }
      await client.query('DELETE FROM idempotency_record WHERE owner_id=$1', [
        ownerId,
      ]);
      await client.query('DELETE FROM operation_event WHERE owner_id=$1', [
        ownerId,
      ]);
      await client.query('DELETE FROM operation WHERE owner_id=$1', [ownerId]);
      await client.query('DELETE FROM student WHERE id=ANY($1::uuid[])', [
        [ownerId, otherId],
      ]);
      await client.end();
      const internals = service as unknown as {
        pool: pg.Pool;
        operations: { pool: pg.Pool };
      };
      await internals.pool.end();
      await internals.operations.pool.end();
      await operations.pool.end();
      for (const [key, value] of environment) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
