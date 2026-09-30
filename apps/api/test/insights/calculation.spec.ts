import { describe, expect, it } from 'vitest';
import {
  classify,
  percentage,
  summarizeEvidence,
} from '../../src/modules/insights/calculation.js';
import type { Evidence } from '../../src/modules/insights/calculation.js';

const base: Evidence = {
  answerId: crypto.randomUUID(),
  attemptId: crypto.randomUUID(),
  revisionId: crypto.randomUUID(),
  topicId: crypto.randomUUID(),
  level: 'Médio',
  submittedAt: new Date('2026-01-03T12:00:00Z'),
  localDate: '2026-01-03',
  pointsUnits: 10_000,
  gradeState: 'graded',
};

describe('cálculo determinístico de evolução', () => {
  it('usa unidades brutas nos limiares e só arredonda a exibição', () => {
    expect(classify(17_997, 30_000, 3)).toBe('attention');
    expect(percentage(17_997, 30_000)).toBe(60);
    expect(classify(18_000, 30_000, 3)).toBe('developing');
    expect(classify(23_997, 30_000, 3)).toBe('developing');
    expect(classify(24_000, 30_000, 3)).toBe('strength');
    expect(classify(20_000, 20_000, 2)).toBe('insufficient_data');
  });

  it('exclui contestadas e preserva ausência de nota', () => {
    const contested: Evidence = {
      ...base,
      answerId: crypto.randomUUID(),
      gradeState: 'contested',
    };
    const pending: Evidence = {
      ...base,
      answerId: crypto.randomUUID(),
      pointsUnits: null,
      gradeState: 'pending',
    };
    expect(summarizeEvidence([contested])).toMatchObject({
      status: 'no_valid_evidence',
      percentage: null,
      questionCount: 0,
      contestedCount: 1,
    });
    expect(summarizeEvidence([pending])).toMatchObject({
      status: 'pending',
      percentage: null,
      questionCount: 0,
      pendingCount: 1,
    });
    const result = summarizeEvidence([base, contested, pending]);
    expect(result).toMatchObject({
      questionCount: 1,
      points: 1,
      possiblePoints: 1,
    });
    expect(result.topics[0]?.classification).toBe('insufficient_data');
  });

  it('separa séries por nível e data', () => {
    const rows = [
      base,
      {
        ...base,
        answerId: crypto.randomUUID(),
        revisionId: crypto.randomUUID(),
        level: 'Superior',
      },
      {
        ...base,
        answerId: crypto.randomUUID(),
        revisionId: crypto.randomUUID(),
        localDate: '2026-01-04',
      },
    ];
    expect(summarizeEvidence(rows).seriesByLevel).toHaveLength(3);
  });
});
