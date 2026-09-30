import { describe, expect, it } from 'vitest';
import { AuthRateLimit } from '../../src/modules/auth/rate-limit.js';

describe('auth rate limit', () => {
  it('limits repeated attempts against one account', () => {
    const limiter = new AuthRateLimit();
    for (let attempt = 0; attempt < 10; attempt++) {
      limiter.assertAllowed(
        'login',
        `198.51.100.${attempt}`,
        'student@example.invalid',
      );
    }
    expect(() =>
      limiter.assertAllowed(
        'login',
        '198.51.100.99',
        'student@example.invalid',
      ),
    ).toThrow('Aguarde');
  });
});
