import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { migrate } from '../../src/infrastructure/db/migrate.js';
import { csrfProtection } from '../../src/infrastructure/http/csrf.js';
import { PublicErrorFilter } from '../../src/infrastructure/http/public-error.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('auth HTTP contract', () => {
  it('isolates sessions, enforces CSRF and revokes logout', async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL obrigatório');
    }
    await migrate(databaseUrl);
    const previousDatabase = process.env.DATABASE_URL;
    const previousOrigin = process.env.APP_ORIGIN;
    const previousSecret = process.env.SESSION_SECRET;
    const previousSmtpHost = process.env.SMTP_HOST;
    const previousSmtpPort = process.env.SMTP_PORT;
    const previousSmtpFrom = process.env.SMTP_FROM;
    process.env.DATABASE_URL = databaseUrl;
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.SESSION_SECRET = 'test-only-123456789012345678901234';
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_FROM = 'estudos@example.invalid';
    const app = await NestFactory.create(AppModule, { logger: false });
    app.use(csrfProtection('http://localhost:3000', ['http://127.0.0.1:3000']));
    app.useGlobalFilters(new PublicErrorFilter());
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1/auth`;
    const ids: string[] = [];
    try {
      async function createStudent(origin = 'http://localhost:3000') {
        const csrfResponse = await fetch(`${base}/csrf`);
        const { token } = (await csrfResponse.json()) as { token: string };
        const csrfCookie = csrfResponse.headers
          .getSetCookie()[0]
          ?.split(';')[0];
        if (!csrfCookie) {
          throw new Error('CSRF cookie ausente');
        }
        const email = `student-${randomUUID()}@example.invalid`;
        const body = JSON.stringify({ email, password: 'valid-password-1234' });
        const denied = await fetch(`${base}/register`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin,
            cookie: csrfCookie,
          },
          body,
        });
        expect(denied.status).toBe(403);
        const response = await fetch(`${base}/register`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin,
            'x-csrf-token': token,
            cookie: csrfCookie,
          },
          body,
        });
        expect(response.status).toBe(201);
        const student = (await response.json()) as {
          id: string;
          email: string;
        };
        ids.push(student.id);
        const sessionCookie = response.headers.getSetCookie()[0]?.split(';')[0];
        if (!sessionCookie) {
          throw new Error('Session cookie ausente');
        }
        return {
          student,
          cookie: `${csrfCookie}; ${sessionCookie}`,
          csrf: token,
        };
      }

      const first = await createStudent();
      const second = await createStudent('http://127.0.0.1:3000');
      const firstMe = await fetch(`${base}/me`, {
        headers: { cookie: first.cookie },
      });
      const secondMe = await fetch(`${base}/me`, {
        headers: { cookie: second.cookie },
      });
      expect(((await firstMe.json()) as { id: string }).id).toBe(
        first.student.id,
      );
      expect(((await secondMe.json()) as { id: string }).id).toBe(
        second.student.id,
      );
      const logout = await fetch(`${base}/logout`, {
        method: 'POST',
        headers: {
          cookie: first.cookie,
          origin: 'http://localhost:3000',
          'x-csrf-token': first.csrf,
        },
      });
      expect(logout.status).toBe(204);
      expect(
        (await fetch(`${base}/me`, { headers: { cookie: first.cookie } }))
          .status,
      ).toBe(401);
      expect(
        (await fetch(`${base}/me`, { headers: { cookie: second.cookie } }))
          .status,
      ).toBe(200);
    } finally {
      await app.close();
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await client.query(
          'DELETE FROM session WHERE student_id = ANY($1::uuid[])',
          [ids],
        );
        await client.query('DELETE FROM student WHERE id = ANY($1::uuid[])', [
          ids,
        ]);
      } finally {
        await client.end();
      }
      const previousEnvironment: Array<[string, string | undefined]> = [
        ['DATABASE_URL', previousDatabase],
        ['APP_ORIGIN', previousOrigin],
        ['SESSION_SECRET', previousSecret],
        ['SMTP_HOST', previousSmtpHost],
        ['SMTP_PORT', previousSmtpPort],
        ['SMTP_FROM', previousSmtpFrom],
      ];
      for (const [name, value] of previousEnvironment) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });
});
