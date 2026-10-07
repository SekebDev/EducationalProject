import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { OperationRepository } from '../../src/infrastructure/jobs/operations.js';
import type { OperationLease } from '../../src/infrastructure/jobs/operations.js';
import { ConversationsService } from '../../src/modules/conversations/conversations.service.js';
import { createChatJobHandler } from '../../src/modules/conversations/chat.job.js';
import { PERSONALITY_CATALOG_VERSION } from '../../src/modules/conversations/personalities.js';
import { EDUCATIONAL_SKILL_VERSION } from '../../src/modules/conversations/educational-skills.js';
import { FakeAiProvider } from '../../src/infrastructure/ai/provider.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

function requireLease(lease: OperationLease | null): OperationLease {
  expect(lease).not.toBeNull();
  if (!lease) {
    throw new Error('Lease ausente');
  }
  return lease;
}

describe.skipIf(!databaseUrl)('conversation and chat behavior', () => {
  it('backfills existing rows additively and preserves defaults for legacy writers', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    const client = new pg.Client({ connectionString: databaseUrl });
    const schema = `educational_skills_${randomUUID().replaceAll('-', '')}`;
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query('CREATE TABLE conversation (title text NOT NULL)');
      await client.query('CREATE TABLE message (content text NOT NULL)');
      await client.query(
        "INSERT INTO conversation(title) VALUES ('Conversa antiga')",
      );
      await client.query(
        "INSERT INTO message(content) VALUES ('Resposta antiga')",
      );
      await client.query(
        await readFile(
          new URL(
            '../../migrations/009_educational_skills.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      expect((await client.query('SELECT * FROM conversation')).rows).toEqual([
        {
          title: 'Conversa antiga',
          skill_key: 'explicar',
          response_depth: 'aprofundada',
        },
      ]);
      expect((await client.query('SELECT * FROM message')).rows).toEqual([
        {
          content: 'Resposta antiga',
          skill_snapshot: 'explicar',
          skill_version_snapshot: 1,
          response_depth_snapshot: 'aprofundada',
        },
      ]);
      expect(
        (
          await client.query(
            "INSERT INTO conversation(title) VALUES ('Cliente antigo') RETURNING skill_key,response_depth",
          )
        ).rows[0],
      ).toEqual({ skill_key: 'explicar', response_depth: 'aprofundada' });
      expect(
        (
          await client.query(
            "INSERT INTO message(content) VALUES ('Novo turno') RETURNING skill_snapshot,skill_version_snapshot,response_depth_snapshot",
          )
        ).rows[0],
      ).toEqual({
        skill_snapshot: 'explicar',
        skill_version_snapshot: 1,
        response_depth_snapshot: 'aprofundada',
      });
    } finally {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  });

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
    const chat = vi.spyOn(FakeAiProvider.prototype, 'chat');
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
      expect(conversation).toMatchObject({
        skill: 'explicar',
        responseDepth: 'aprofundada',
      });
      expect((await service.list(ownerId)).items[0]).toMatchObject({
        skill: 'explicar',
        responseDepth: 'aprofundada',
      });
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
      expect(first.userMessage).toMatchObject({
        skill: 'explicar',
        skillVersion: EDUCATIONAL_SKILL_VERSION,
        responseDepth: 'aprofundada',
      });
      operationId = first.operationId;
      const snapshot = await client.query<{
        personality_version_snapshot: number;
      }>('SELECT personality_version_snapshot FROM message WHERE id=$1', [
        first.assistantMessageId,
      ]);
      expect(snapshot.rows[0]?.personality_version_snapshot).toBe(
        PERSONALITY_CATALOG_VERSION,
      );

      const updated = await service.update(ownerId, conversation.id, {
        personality: 'socratica',
        skill: 'praticar',
        responseDepth: 'resumida',
        version: conversation.version + 1,
      });
      expect(updated.personality).toBe('socratica');
      expect(updated).toMatchObject({
        skill: 'praticar',
        responseDepth: 'resumida',
      });
      expect(await service.get(ownerId, conversation.id)).toMatchObject({
        skill: 'praticar',
        responseDepth: 'resumida',
      });
      const replayAfterChange = await service.sendMessage(
        ownerId,
        conversation.id,
        questionKey,
        {
          content: 'Como funciona a fotossíntese?',
          conversationVersion: conversation.version,
        },
      );
      expect(replayAfterChange.userMessage).toEqual(first.userMessage);
      expect(replayAfterChange.assistantMessageId).toBe(
        first.assistantMessageId,
      );
      await expect(
        service.update(ownerId, conversation.id, {
          version: conversation.version + 1,
          skill: 'flashcards',
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        service.update(otherId, conversation.id, {
          version: updated.version,
          skill: 'revisar',
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(service.get(otherId, conversation.id)).rejects.toMatchObject(
        {
          status: 404,
        },
      );

      const lease = requireLease(
        await operations.acquire(operationId, ownerId, 1),
      );
      const handler = createChatJobHandler(databaseUrl);
      const result = await handler(lease);
      expect(await operations.fail(lease, 'TEST_RETRY', false)).toBe(true);
      await operations.retry(ownerId, operationId, randomUUID());
      const retriedLease = requireLease(
        await operations.acquire(operationId, ownerId, 1),
      );
      const retriedResult = await handler(retriedLease);
      expect(chat).toHaveBeenCalledTimes(2);
      for (const [input] of chat.mock.calls) {
        expect(input).toMatchObject({
          skill: 'explicar',
          skillVersion: EDUCATIONAL_SKILL_VERSION,
          responseDepth: 'aprofundada',
        });
      }
      expect(await operations.complete(retriedLease, retriedResult.apply)).toBe(
        true,
      );
      expect(await operations.complete(lease, result.apply)).toBe(false);

      const messages = await service.messages(ownerId, conversation.id);
      expect(messages.items).toHaveLength(2);
      expect(messages.items[0]?.personality).toBe('acolhedora');
      expect(messages.items[1]?.personality).toBe('acolhedora');
      for (const message of messages.items) {
        expect(message).toMatchObject({
          skill: 'explicar',
          skillVersion: EDUCATIONAL_SKILL_VERSION,
          responseDepth: 'aprofundada',
        });
      }
      expect(messages.items[1]?.state).toBe('completed');
      expect(messages.items[1]?.content).toContain('Modo de demonstração');
      const provenance = await client.query<{
        model: string;
        prompt_version: string;
      }>('SELECT model,prompt_version FROM message WHERE id=$1', [
        first.assistantMessageId,
      ]);
      expect(provenance.rows[0]).toMatchObject({
        model: 'fake',
        prompt_version: `chat-v3-personality-${PERSONALITY_CATALOG_VERSION}-skill-${EDUCATIONAL_SKILL_VERSION}-explicar-depth-aprofundada`,
      });
      const blocked = await service.sendMessage(
        ownerId,
        conversation.id,
        randomUUID(),
        {
          content: 'Crie um aplicativo completo pronto para uso.',
          conversationVersion: updated.version,
        },
      );
      const blockedLease = requireLease(
        await operations.acquire(blocked.operationId, ownerId, updated.version),
      );
      const redirected = await handler(blockedLease);
      expect(await operations.complete(blockedLease, redirected.apply)).toBe(
        true,
      );
      const guardedHistory = await service.messages(ownerId, conversation.id);
      expect(guardedHistory.items[3]?.content).toContain(
        'Não entrego aplicativos',
      );
      expect(guardedHistory.items[3]?.references).toEqual([]);
      for (const message of guardedHistory.items.slice(2)) {
        expect(message).toMatchObject({
          skill: 'praticar',
          skillVersion: EDUCATIONAL_SKILL_VERSION,
          responseDepth: 'resumida',
        });
      }
      const competingEdits = await Promise.allSettled([
        service.update(ownerId, conversation.id, {
          version: updated.version + 1,
          skill: 'revisar',
        }),
        service.update(ownerId, conversation.id, {
          version: updated.version + 1,
          skill: 'flashcards',
        }),
      ]);
      expect(
        competingEdits.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        competingEdits.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const rejectedEdit = competingEdits.find(
        (result) => result.status === 'rejected',
      );
      expect(
        rejectedEdit?.status === 'rejected' && rejectedEdit.reason,
      ).toMatchObject({ status: 409 });
      const current = await service.get(ownerId, conversation.id);
      const nextTurn = await service.sendMessage(
        ownerId,
        conversation.id,
        randomUUID(),
        {
          content: 'Vamos estudar fotossíntese outra vez.',
          conversationVersion: current.version,
        },
      );
      const nextLease = requireLease(
        await operations.acquire(
          nextTurn.operationId,
          ownerId,
          current.version,
        ),
      );
      const nextResult = await handler(nextLease);
      expect(chat).toHaveBeenLastCalledWith(
        expect.objectContaining({
          skill: current.skill,
          skillVersion: EDUCATIONAL_SKILL_VERSION,
          responseDepth: 'resumida',
        }),
      );
      expect(await operations.complete(nextLease, nextResult.apply)).toBe(true);
      const nextMessages = await service.messages(ownerId, conversation.id);
      for (const message of nextMessages.items.slice(-2)) {
        expect(message).toMatchObject({
          skill: current.skill,
          responseDepth: 'resumida',
        });
      }
      await expect(
        service.messages(otherId, conversation.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        client.query(
          "UPDATE conversation SET skill_key='execute-script' WHERE id=$1",
          [conversation.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        client.query(
          "UPDATE message SET response_depth_snapshot='unlimited' WHERE id=$1",
          [first.assistantMessageId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        client.query(
          'UPDATE message SET skill_version_snapshot=0 WHERE id=$1',
          [first.assistantMessageId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await service.delete(ownerId, conversation.id);
      await expect(service.get(ownerId, conversation.id)).rejects.toMatchObject(
        {
          status: 404,
        },
      );
    } finally {
      chat.mockRestore();
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
