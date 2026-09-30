import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { csrfProtection } from '../../src/infrastructure/http/csrf.js';
import { PublicErrorFilter } from '../../src/infrastructure/http/public-error.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:3000';

describe.skipIf(!databaseUrl)('conversation HTTP contract', () => {
  it('denies cross-account IDs and preserves one turn across duplicate sends', async () => {
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
    ].map((key) => [key, process.env[key]] as const);
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: origin,
      SESSION_SECRET: 'test-only-123456789012345678901234',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'study@example.invalid',
    });
    const app = await NestFactory.create(AppModule, { logger: false });
    app.use(csrfProtection(origin));
    app.useGlobalFilters(new PublicErrorFilter());
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    const students: string[] = [];
    const conversations: string[] = [];

    async function register() {
      const csrfResponse = await fetch(`${base}/auth/csrf`);
      const token = ((await csrfResponse.json()) as { token: string }).token;
      const csrfCookie = csrfResponse.headers.getSetCookie()[0]?.split(';')[0];
      if (!csrfCookie) {
        throw new Error('CSRF cookie ausente');
      }
      const response = await fetch(`${base}/auth/register`, {
        method: 'POST',
        headers: {
          origin,
          cookie: csrfCookie,
          'x-csrf-token': token,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: `student-${randomUUID()}@example.invalid`,
          password: 'valid-password-1234',
        }),
      });
      expect(response.status).toBe(201);
      const student = (await response.json()) as { id: string };
      students.push(student.id);
      const sessionCookie = response.headers.getSetCookie()[0]?.split(';')[0];
      if (!sessionCookie) {
        throw new Error('Session cookie ausente');
      }
      return { cookie: `${csrfCookie}; ${sessionCookie}`, csrf: token };
    }

    function headers(
      session: Awaited<ReturnType<typeof register>>,
      key?: string,
    ) {
      return {
        origin,
        cookie: session.cookie,
        'x-csrf-token': session.csrf,
        'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
      };
    }

    try {
      const owner = await register();
      const stranger = await register();
      const createdResponse = await fetch(`${base}/conversations`, {
        method: 'POST',
        headers: headers(owner, randomUUID()),
        body: JSON.stringify({ personality: 'acolhedora' }),
      });
      expect(createdResponse.status).toBe(201);
      const conversation = (await createdResponse.json()) as {
        id: string;
        version: number;
      };
      conversations.push(conversation.id);
      expect(
        (
          await fetch(`${base}/conversations/${conversation.id}`, {
            headers: { cookie: stranger.cookie },
          })
        ).status,
      ).toBe(404);
      const key = randomUUID();
      const body = JSON.stringify({
        content: 'Explique fotossíntese.',
        conversationVersion: conversation.version,
      });
      const firstResponse = await fetch(
        `${base}/conversations/${conversation.id}/messages`,
        {
          method: 'POST',
          headers: headers(owner, key),
          body,
        },
      );
      expect(firstResponse.status).toBe(202);
      const first = (await firstResponse.json()) as {
        assistantMessageId: string;
      };
      const replayResponse = await fetch(
        `${base}/conversations/${conversation.id}/messages`,
        {
          method: 'POST',
          headers: headers(owner, key),
          body,
        },
      );
      expect(replayResponse.status).toBe(202);
      expect(
        (await replayResponse.json()) as { assistantMessageId: string },
      ).toMatchObject(first);
      const messagesResponse = await fetch(
        `${base}/conversations/${conversation.id}/messages`,
        {
          headers: { cookie: owner.cookie },
        },
      );
      expect(messagesResponse.status).toBe(200);
      const messages = (await messagesResponse.json()) as { items: unknown[] };
      expect(messages.items).toHaveLength(2);
    } finally {
      await app.close();
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await client.query(
          'DELETE FROM idempotency_record WHERE owner_id=ANY($1::uuid[])',
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
          'DELETE FROM message WHERE conversation_id=ANY($1::uuid[])',
          [conversations],
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
      }
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
