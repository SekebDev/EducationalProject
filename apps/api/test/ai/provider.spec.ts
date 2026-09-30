import { describe, expect, it } from 'vitest';
import {
  examOutputSchema,
  parseAiOutput,
} from '../../src/infrastructure/ai/contracts.js';
import { FakeAiProvider } from '../../src/infrastructure/ai/provider.js';

describe('AI boundary', () => {
  it('rejects unrecognized fields', () => {
    expect(() =>
      parseAiOutput(examOutputSchema, {
        support: 'sufficient',
        reason: null,
        questions: [],
        leakedAnswer: true,
      }),
    ).toThrow('AI_SCHEMA_INVALID');
  });

  it('provides deterministic fake output with exact question count', async () => {
    const fake = new FakeAiProvider();
    const exam = await fake.exam({
      context: [{ role: 'user', content: 'Tenho dúvida sobre equações.' }],
      topics: ['Álgebra'],
      studyLevel: 'Ensino médio',
      total: 10,
      objectiveCount: 5,
      essayCount: 5,
      sources: [],
    });
    expect(exam.questions).toHaveLength(10);
    expect(
      exam.questions.filter((question) => question.type === 'objective'),
    ).toHaveLength(5);
    expect(exam.questions[0]?.alternatives).toHaveLength(4);
    expect(exam.questions[0]?.statement).toContain(
      'Tenho dúvida sobre equações.',
    );
    const otherContext = await fake.exam({
      context: [{ role: 'user', content: 'Quero revisar funções.' }],
      topics: ['Álgebra'],
      studyLevel: 'Ensino médio',
      total: 10,
      objectiveCount: 5,
      essayCount: 5,
      sources: [],
    });
    expect(otherContext.questions[0]?.statement).not.toBe(
      exam.questions[0]?.statement,
    );
  });
});
