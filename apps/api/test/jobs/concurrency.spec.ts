import { describe, expect, it } from 'vitest';
import { queueConcurrency } from '../../src/infrastructure/jobs/dispatcher.js';

describe('worker concurrency for twenty students', () => {
  it('keeps chat responsive without allocating twenty exam calls', () => {
    expect(queueConcurrency('answer-chat', {})).toBe(8);
    expect(queueConcurrency('generate-exam', {})).toBe(4);
    expect(queueConcurrency('grade-answer', {})).toBe(4);
    expect(queueConcurrency('extract-material', {})).toBe(2);
  });
  it.each(['0', '-1', '1.5', '21', 'invalid'])(
    'rejects invalid concurrency %s at startup',
    (value) => {
      expect(() =>
        queueConcurrency('answer-chat', { JOB_CHAT_CONCURRENCY: value }),
      ).toThrow('JOB_CONCURRENCY_INVALID');
    },
  );
  it('accepts an explicit operational limit', () => {
    expect(queueConcurrency('answer-chat', { JOB_CHAT_CONCURRENCY: '3' })).toBe(
      3,
    );
  });
});
