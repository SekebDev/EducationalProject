import { describe, expect, it } from 'vitest';
import { parseExamConfig } from '../../src/modules/exams/exam-config.js';

const valid = {
  conversationId: crypto.randomUUID(),
  topicNames: [' Fotossíntese  e respiração ', ' Ecologia '],
  studyLevel: ' Ensino   Médio ',
  total: 10,
  objectiveCount: 5,
  essayCount: 5,
  materialIds: [],
};

describe('parseExamConfig', () => {
  it('normalizes whitespace without changing topic order', () => {
    expect(parseExamConfig(valid)).toMatchObject({
      topicNames: ['Fotossíntese e respiração', 'Ecologia'],
      studyLevel: 'Ensino Médio',
    });
  });

  it.each([
    { conversationId: 'invalid' },
    { total: 9 },
    { total: 31 },
    { total: 10.5 },
    { objectiveCount: 6 },
    { essayCount: -1 },
    { topicNames: [] },
    { topicNames: Array.from({ length: 11 }, (_, index) => `Tema ${index}`) },
    { topicNames: ['Ecologia', ' ecologia '] },
    { studyLevel: ' ' },
    { studyLevel: 'a'.repeat(201) },
    { topicNames: ['a'.repeat(201)] },
    { materialIds: Array.from({ length: 11 }, () => crypto.randomUUID()) },
  ])('rejects invalid configuration %j', (change) => {
    expect(() => parseExamConfig({ ...valid, ...change })).toThrow();
  });

  it('rejects unknown fields and duplicate sources', () => {
    expect(() =>
      parseExamConfig({ ...valid, ownerId: crypto.randomUUID() }),
    ).toThrow();
    const id = crypto.randomUUID();
    expect(() =>
      parseExamConfig({ ...valid, materialIds: [id, id] }),
    ).toThrow();
  });

  it('accepts both supported exam sizes', () => {
    expect(
      parseExamConfig({
        ...valid,
        total: 10,
        objectiveCount: 0,
        essayCount: 10,
      }).total,
    ).toBe(10);
    expect(
      parseExamConfig({
        ...valid,
        total: 30,
        objectiveCount: 30,
        essayCount: 0,
      }).total,
    ).toBe(30);
  });
});
