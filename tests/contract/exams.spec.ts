import { describe, expect, it } from 'vitest';
import { questionPublicSchema } from '../../packages/contracts/src/index.js';
import { toQuestionPublic } from '../../packages/contracts/src/exams.js';

describe('contrato público de questões', () => {
  const publicQuestion = {
    id: crypto.randomUUID(),
    ordinal: 1,
    type: 'objective' as const,
    topic: 'Ecologia',
    studyLevel: 'Ensino Médio',
    statement: 'Qual alternativa?',
    alternatives: [{ id: 'A', text: 'Uma opção' }],
  };

  it('serializa apenas os campos públicos', () => {
    expect(toQuestionPublic(publicQuestion)).toEqual(publicQuestion);
    expect(
      questionPublicSchema.safeParse({
        ...publicQuestion,
        correctOptionId: 'A',
      }).success,
    ).toBe(false);
    expect(
      questionPublicSchema.safeParse({ ...publicQuestion, rubric: [] }).success,
    ).toBe(false);
    expect(
      questionPublicSchema.safeParse({
        ...publicQuestion,
        referenceAnswer: 'Segredo',
      }).success,
    ).toBe(false);
  });
});
