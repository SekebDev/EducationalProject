import { Injectable } from '@nestjs/common';
import { PublicError } from '../../infrastructure/http/public-error.js';

@Injectable()
export class AuthRateLimit {
  private readonly attempts = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  assertAllowed(kind: 'login' | 'reset', ip: string, account: string): void {
    const now = Date.now();
    for (const [key, attempt] of this.attempts) {
      if (attempt.expiresAt <= now) this.attempts.delete(key);
    }
    if (this.attempts.size >= 20_000) {
      throw new PublicError(
        429,
        'RATE_LIMITED',
        'Aguarde antes de tentar novamente.',
        true,
      );
    }
    for (const [key, limit] of [
      [`${kind}:ip:${ip}`, 100],
      [`${kind}:account:${account.toLowerCase()}`, 10],
    ] as const) {
      const existing = this.attempts.get(key);
      const count = existing && existing.expiresAt > now ? existing.count : 0;
      if (count >= limit) {
        throw new PublicError(
          429,
          'RATE_LIMITED',
          'Aguarde antes de tentar novamente.',
          true,
        );
      }
      this.attempts.set(key, {
        count: count + 1,
        expiresAt:
          existing && existing.expiresAt > now
            ? existing.expiresAt
            : now + 15 * 60_000,
      });
    }
  }
}
