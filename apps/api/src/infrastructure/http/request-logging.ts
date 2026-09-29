import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestLogging(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  const startedAt = performance.now();
  response.setHeader('X-Request-ID', requestId);
  response.setHeader('Cache-Control', 'no-store');
  response.once('finish', () => {
    process.stdout.write(
      `${JSON.stringify({
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      })}\n`,
    );
  });
  next();
}
