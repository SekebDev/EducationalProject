import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { PublicError } from './public-error.js';
import { getCookie } from './cookies.js';

function equalToken(first: string, second: string): boolean {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function csrfProtection(
  origin: string,
  additionalOrigins: readonly string[] = [],
) {
  const allowedOrigins = new Set([origin, ...additionalOrigins]);
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (
      ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ||
      !request.path.startsWith('/api/v1/')
    ) {
      next();
      return;
    }
    const header = request.header('x-csrf-token');
    const cookie = getCookie(request, 'study_csrf');
    if (
      !allowedOrigins.has(request.header('origin') ?? '') ||
      !header ||
      !cookie ||
      !equalToken(header, cookie)
    ) {
      next(
        new PublicError(
          403,
          'CSRF_INVALID',
          'Atualize a página e tente novamente.',
        ),
      );
      return;
    }
    next();
  };
}
