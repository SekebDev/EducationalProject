import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { csrfProtection } from '../../src/infrastructure/http/csrf.js';

function check(
  origin: string | undefined,
  header = 'token',
  cookie = 'token',
  aliases: string[] = [],
) {
  const headers: Record<string, string | undefined> = {
    origin,
    'x-csrf-token': header,
  };
  const request = {
    method: 'POST',
    path: '/api/v1/auth/register',
    headers: { cookie: `study_csrf=${cookie}` },
    header: (name: string) => headers[name],
  } as unknown as Request;
  const next = vi.fn();
  csrfProtection('http://localhost:3200', aliases)(
    request,
    {} as Response,
    next,
  );
  return next;
}

describe('explicit CSRF origin allowlist', () => {
  it('accepts the canonical origin and only explicitly configured aliases', () => {
    expect(check('http://localhost:3200')).toHaveBeenCalledWith();
    expect(check('http://127.0.0.1:3200')).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
    );
    expect(
      check('http://127.0.0.1:3200', 'token', 'token', [
        'http://127.0.0.1:3200',
      ]),
    ).toHaveBeenCalledWith();
  });
  it.each([
    undefined,
    'null',
    'http://127.0.0.1:3201',
    'https://127.0.0.1:3200',
    'http://localhost:3200.evil.example',
    'https://evil.example',
  ])('rejects untrusted origin %s even with a matching token', (origin) => {
    expect(
      check(origin, 'token', 'token', ['http://127.0.0.1:3200']),
    ).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
  it.each([
    ['', 'token'],
    ['token', ''],
    ['wrong', 'token'],
  ])(
    'still requires matching tokens on the alias (%s / %s)',
    (header, cookie) => {
      expect(
        check('http://127.0.0.1:3200', header, cookie, [
          'http://127.0.0.1:3200',
        ]),
      ).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    },
  );
});
