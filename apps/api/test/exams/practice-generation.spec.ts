import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeAiProvider } from '../../src/infrastructure/ai/provider.js';
import { validateGeneratedExam } from '../../src/modules/exams/exam.job.js';

const topic = {
  id: crypto.randomUUID(),
  display_name: 'Ecologia',
  requested_count: 10,
};
const config = { total: 10, objective_count: 5, essay_count: 5 };
const input = {
  topics: [topic.display_name],
  studyLevel: 'Médio',
  total: 10,
  objectiveCount: 5,
  essayCount: 5,
  sources: [],
};
const normalize = (statement: string) =>
  statement.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');

describe('geração de nova prática', () => {
  it('rejeita enunciado literal da prova anterior e aceita nova prova separada', async () => {
    const ai = new FakeAiProvider();
    const first = await ai.exam({
      ...input,
      context: [{ role: 'user', content: 'Explique ecologia.' }],
    });
    const hashes = new Set(
      first.questions.map((question) =>
        createHash('sha256')
          .update(normalize(question.statement))
          .digest('hex'),
      ),
    );
    expect(() =>
      validateGeneratedExam(first, config, [topic], new Set(), hashes),
    ).toThrow('AI_DUPLICATE_ORIGIN');
    const practice = await ai.exam({
      ...input,
      context: [
        { role: 'user', content: 'Explique ecologia.' },
        {
          role: 'user',
          content: `Nova prática ${crypto.randomUUID()}. Crie novas questões.`,
        },
      ],
    });
    expect(() =>
      validateGeneratedExam(practice, config, [topic], new Set(), hashes),
    ).not.toThrow();
  });
});
