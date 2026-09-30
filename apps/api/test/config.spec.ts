import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/infrastructure/config.js';

const valid = {
  DATABASE_URL: 'postgres://study:study@localhost:5432/study',
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: '12345678901234567890123456789012',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'estudos@example.invalid',
};

describe('readConfig', () => {
  it('keeps local development private and permits the Docker bind host', () => {
    expect(readConfig(valid).apiHost).toBe('127.0.0.1');
    expect(readConfig({ ...valid, API_HOST: '0.0.0.0' }).apiHost).toBe(
      '0.0.0.0',
    );
    expect(() => readConfig({ ...valid, API_HOST: 'example.com' })).toThrow(
      'API_HOST',
    );
  });

  it('rejects fake AI in production without exposing secrets', () => {
    expect(() =>
      readConfig({ ...valid, NODE_ENV: 'production', AI_PROVIDER: 'fake' }),
    ).toThrow('AI_PROVIDER');
  });

  it('requires the OpenAI key only for the real provider', () => {
    expect(() => readConfig({ ...valid, AI_PROVIDER: 'openai' })).toThrow(
      'OPENAI_API_KEY',
    );
    expect(readConfig({ ...valid, AI_PROVIDER: 'fake' }).aiProvider).toBe(
      'fake',
    );
  });
});
