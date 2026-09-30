import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { csrfProtection } from '../../src/infrastructure/http/csrf.js';
import { PublicErrorFilter } from '../../src/infrastructure/http/public-error.js';
import { OperationRepository } from '../../src/infrastructure/jobs/operations.js';
import { createExtractJobHandler } from '../../src/modules/materials/extract.job.js';
import { retrieveChunks } from '../../src/modules/materials/retrieval.js';
import { createChatJobHandler } from '../../src/modules/conversations/chat.job.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:3000';

describe.skipIf(!databaseUrl)('material upload HTTP', () => {
  it('limits, isolates, extracts and revokes a material', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const storage = await mkdtemp(join(tmpdir(), 'study-material-test-'));
    const original = Object.fromEntries(
      [
        'DATABASE_URL',
        'APP_ORIGIN',
        'SESSION_SECRET',
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_FROM',
        'AI_PROVIDER',
        'STORAGE_LOCAL_PATH',
      ].map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: origin,
      SESSION_SECRET: 'test-only-123456789012345678901234',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'study@example.invalid',
      AI_PROVIDER: 'fake',
      STORAGE_LOCAL_PATH: storage,
    });
    const app = await NestFactory.create(AppModule, { logger: false });
    app.use(csrfProtection(origin));
    app.useGlobalFilters(new PublicErrorFilter());
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    const students: string[] = [];
    const conversations: string[] = [];
    let materialId: string | undefined;

    async function register() {
      const csrfResponse = await fetch(`${base}/auth/csrf`);
      const csrf = ((await csrfResponse.json()) as { token: string }).token;
      const csrfCookie = csrfResponse.headers.getSetCookie()[0]?.split(';')[0];
      if (!csrfCookie) {
        throw new Error('CSRF ausente');
      }
      const response = await fetch(`${base}/auth/register`, {
        method: 'POST',
        headers: {
          origin,
          cookie: csrfCookie,
          'x-csrf-token': csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: `material-${randomUUID()}@example.invalid`,
          password: 'valid-password-1234',
        }),
      });
      expect(response.status).toBe(201);
      const id = ((await response.json()) as { id: string }).id;
      students.push(id);
      const session = response.headers.getSetCookie()[0]?.split(';')[0];
      if (!session) {
        throw new Error('Sessão ausente');
      }
      return { cookie: `${csrfCookie}; ${session}`, csrf };
    }

    try {
      const owner = await register();
      const stranger = await register();
      const created = await fetch(`${base}/conversations`, {
        method: 'POST',
        headers: {
          origin,
          cookie: owner.cookie,
          'x-csrf-token': owner.csrf,
          'idempotency-key': randomUUID(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ personality: 'acolhedora' }),
      });
      expect(created.status).toBe(201);
      const conversation = (await created.json()) as {
        id: string;
        version: number;
      };
      conversations.push(conversation.id);
      const form = new FormData();
      form.append(
        'file',
        new Blob(['Linha primeira\nLinha segunda'], { type: 'text/plain' }),
        'aula.txt',
      );
      const key = randomUUID();
      const send = (
        cookie: string,
        csrf: string,
        uploadKey: string,
        body: FormData,
      ) =>
        fetch(`${base}/conversations/${conversation.id}/materials`, {
          method: 'POST',
          headers: {
            origin,
            cookie,
            'x-csrf-token': csrf,
            'idempotency-key': uploadKey,
          },
          body,
        });
      const uploaded = await send(owner.cookie, owner.csrf, key, form);
      expect(uploaded.status, await uploaded.clone().text()).toBe(202);
      const result = (await uploaded.json()) as {
        materialId: string;
        operationId: string;
      };
      materialId = result.materialId;
      const replay = await send(owner.cookie, owner.csrf, key, form);
      expect(replay.status).toBe(202);
      expect((await replay.json()) as { materialId: string }).toMatchObject({
        materialId,
      });
      expect(
        (
          await fetch(`${base}/materials/${materialId}`, {
            headers: { cookie: stranger.cookie },
          })
        ).status,
      ).toBe(404);

      const operations = new OperationRepository(databaseUrl);
      const lease = await operations.acquire(
        result.operationId,
        students[0] ?? '',
        1,
      );
      expect(lease).not.toBeNull();
      if (!lease) {
        throw new Error('Lease ausente');
      }
      const outcome = await createExtractJobHandler(databaseUrl)(lease);
      expect(await operations.complete(lease, outcome.apply)).toBe(true);
      const ready = await fetch(`${base}/materials/${materialId}`, {
        headers: { cookie: owner.cookie },
      });
      expect((await ready.json()) as { state: string }).toMatchObject({
        state: 'ready',
      });
      const chunks = await retrieveChunks(
        students[0] ?? '',
        conversation.id,
        [{ id: materialId, version: 2 }],
        'Linha primeira',
      );
      expect(chunks[0]).toMatchObject({
        materialId,
        locator: { kind: 'line', number: 1 },
      });
      expect(
        await retrieveChunks(
          students[1] ?? '',
          conversation.id,
          [{ id: materialId, version: 2 }],
          'Linha primeira',
        ),
      ).toEqual([]);
      expect(
        await retrieveChunks(
          students[0] ?? '',
          conversation.id,
          [{ id: materialId, version: 1 }],
          'Linha primeira',
        ),
      ).toEqual([]);
      expect(
        (
          await fetch(
            `${base}/materials/${materialId}/chunks/${chunks[0]?.id}`,
            { headers: { cookie: stranger.cookie } },
          )
        ).status,
      ).toBe(404);
      const listing = await fetch(
        `${base}/conversations/${conversation.id}/materials`,
        { headers: { cookie: owner.cookie } },
      );
      expect(
        ((await listing.json()) as { items: unknown[] }).items,
      ).toHaveLength(1);
      const content = await fetch(`${base}/materials/${materialId}/content`, {
        headers: { cookie: owner.cookie },
      });
      expect(await content.text()).toBe('Linha primeira\nLinha segunda');
      const selected = await fetch(
        `${base}/conversations/${conversation.id}/sources`,
        {
          method: 'PUT',
          headers: {
            origin,
            cookie: owner.cookie,
            'x-csrf-token': owner.csrf,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            materialIds: [materialId],
            version: conversation.version,
          }),
        },
      );
      expect(selected.status).toBe(200);
      const selection = (await selected.json()) as { version: number };
      const asked = await fetch(
        `${base}/conversations/${conversation.id}/messages`,
        {
          method: 'POST',
          headers: {
            origin,
            cookie: owner.cookie,
            'x-csrf-token': owner.csrf,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({
            content: 'O que diz a linha primeira?',
            conversationVersion: selection.version,
          }),
        },
      );
      expect(asked.status).toBe(202);
      const answer = (await asked.json()) as {
        assistantMessageId: string;
        operationId: string;
      };
      const snapshot = await (async () => {
        const client = new pg.Client({ connectionString: databaseUrl });
        await client.connect();
        try {
          return await client.query<{
            source_snapshot: Array<{ id: string; version: number }>;
          }>('SELECT source_snapshot FROM message WHERE id=$1', [
            answer.assistantMessageId,
          ]);
        } finally {
          await client.end();
        }
      })();
      expect(snapshot.rows[0]?.source_snapshot).toEqual([
        { id: materialId, version: 2 },
      ]);
      const chatLease = await operations.acquire(
        answer.operationId,
        students[0] ?? '',
        selection.version,
      );
      expect(chatLease).not.toBeNull();
      if (!chatLease) {
        throw new Error('Lease de chat ausente');
      }
      const chatResult = await createChatJobHandler(databaseUrl)(chatLease);
      expect(await operations.complete(chatLease, chatResult.apply)).toBe(true);
      const history = await fetch(
        `${base}/conversations/${conversation.id}/messages`,
        { headers: { cookie: owner.cookie } },
      );
      const historyBody = (await history.json()) as {
        items: Array<{ content: string; references: unknown[] }>;
      };
      expect(historyBody.items[1]?.content).toContain('não sustentam');
      expect(historyBody.items[1]?.references).toEqual([]);
      const invalid = new FormData();
      invalid.append(
        'file',
        new Blob(['não é PDF'], { type: 'application/pdf' }),
        'falso.pdf',
      );
      expect(
        (await send(owner.cookie, owner.csrf, randomUUID(), invalid)).status,
      ).toBe(415);
      for (let index = 0; index < 9; index++) {
        const extra = new FormData();
        extra.append(
          'file',
          new Blob([`Texto ${index}`], { type: 'text/plain' }),
          `extra-${index}.txt`,
        );
        expect(
          (await send(owner.cookie, owner.csrf, randomUUID(), extra)).status,
        ).toBe(202);
      }
      const eleventh = new FormData();
      eleventh.append(
        'file',
        new Blob(['Excede'], { type: 'text/plain' }),
        'excede.txt',
      );
      expect(
        (await send(owner.cookie, owner.csrf, randomUUID(), eleventh)).status,
      ).toBe(409);
      const removed = await fetch(`${base}/materials/${materialId}`, {
        method: 'DELETE',
        headers: { origin, cookie: owner.cookie, 'x-csrf-token': owner.csrf },
      });
      expect(removed.status).toBe(204);
      const staleSelection = await fetch(
        `${base}/conversations/${conversation.id}/sources`,
        {
          method: 'PUT',
          headers: {
            origin,
            cookie: owner.cookie,
            'x-csrf-token': owner.csrf,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            materialIds: [materialId],
            version: selection.version + 1,
          }),
        },
      );
      expect(staleSelection.status).toBe(422);
      expect(
        (
          await fetch(`${base}/materials/${materialId}/content`, {
            headers: { cookie: owner.cookie },
          })
        ).status,
      ).toBe(404);
    } finally {
      await app.close();
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await client.query(
          'DELETE FROM material_chunk WHERE owner_id=ANY($1::uuid[])',
          [students],
        );
        await client.query(
          'DELETE FROM conversation_source WHERE owner_id=ANY($1::uuid[])',
          [students],
        );
        await client.query(
          'DELETE FROM operation_event WHERE owner_id=ANY($1::uuid[])',
          [students],
        );
        await client.query(
          'DELETE FROM operation WHERE owner_id=ANY($1::uuid[])',
          [students],
        );
        await client.query(
          'DELETE FROM idempotency_record WHERE owner_id=ANY($1::uuid[])',
          [students],
        );
        await client.query(
          'DELETE FROM material WHERE owner_id=ANY($1::uuid[])',
          [students],
        );
        await client.query(
          'DELETE FROM message WHERE owner_id=ANY($1::uuid[])',
          [students],
        );
        await client.query(
          'DELETE FROM conversation WHERE id=ANY($1::uuid[])',
          [conversations],
        );
        await client.query(
          'DELETE FROM session WHERE student_id=ANY($1::uuid[])',
          [students],
        );
        await client.query('DELETE FROM student WHERE id=ANY($1::uuid[])', [
          students,
        ]);
      } finally {
        await client.end();
        await rm(storage, { recursive: true, force: true });
        for (const [key, value] of Object.entries(original)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      }
    }
  });
});
