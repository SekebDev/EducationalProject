import { describe, expect, it } from 'vitest';
import { parsePractice } from '../../src/modules/insights/practice.service.js';

const topic = crypto.randomUUID();
const valid = {
  topicIds: [topic],
  total: 10,
  objectiveCount: 5,
  essayCount: 5,
  studyLevel: 'Médio',
  materialIds: [],
};

describe('configuração de prática', () => {
  it('aceita somente temas da recomendação e distribuição válida', () => {
    expect(parsePractice(valid, [topic])).toMatchObject(valid);
    expect(() =>
      parsePractice({ ...valid, topicIds: [crypto.randomUUID()] }, [topic]),
    ).toThrow();
    expect(() =>
      parsePractice({ ...valid, objectiveCount: 6 }, [topic]),
    ).toThrow();
    expect(() =>
      parsePractice({ ...valid, topicIds: [topic, topic] }, [topic]),
    ).toThrow();
  });
});
