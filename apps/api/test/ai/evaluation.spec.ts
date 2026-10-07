import { describe, expect, it } from 'vitest';
import { EvaluationBudget } from '../../../../tests/evaluations/accounting.js';
import { evaluationSamples } from '../../../../tests/evaluations/samples.js';
import { validateChatCitations } from '../../src/modules/conversations/sources.service.js';
import { validateGrade } from '../../src/modules/grading/grade.job.js';

const prices = {
  model: 'fixture-model',
  inputPerMillion: 1,
  outputPerMillion: 2,
};
const request = {
  model: prices.model,
  schema: 'study_grade_v1',
  inputTokenUpperBound: 1000,
  maxOutputTokens: 1000,
};

describe('evaluation accounting and corpus', () => {
  it('blocks an unaffordable call before reserving or spending', () => {
    const budget = new EvaluationBudget(0.001, prices);
    expect(() => budget.beforeRequest(request)).toThrow(
      'EVALUATION_BUDGET_EXCEEDED',
    );
    expect(budget.spentUsd).toBe(0);
    expect(budget.reservedUsd).toBe(0);
  });

  it('settles returned usage and keeps uncertain timeout charges', () => {
    const budget = new EvaluationBudget(1, prices);
    budget.beforeRequest(request);
    budget.receivedResponse({
      model: 'fixture-model-2026-10-01',
      schema: request.schema,
      inputTokens: 100,
      cachedInputTokens: 50,
      outputTokens: 200,
    });
    budget.finishRequest();
    expect(budget.spentUsd).toBeCloseTo(0.0005);
    budget.beforeRequest(request);
    budget.finishRequest();
    expect(budget.spentUsd).toBeCloseTo(0.0035);
    expect(budget.reservedUsd).toBe(0);
  });

  it('rejects unknown models, duplicate reservations and invalid prices', () => {
    const budget = new EvaluationBudget(1, prices);
    expect(() =>
      budget.beforeRequest({ ...request, model: 'unpriced' }),
    ).toThrow();
    budget.beforeRequest(request);
    expect(() => budget.beforeRequest(request)).toThrow();
    expect(() => new EvaluationBudget(0, prices)).toThrow();
    expect(
      () => new EvaluationBudget(1, { ...prices, outputPerMillion: NaN }),
    ).toThrow();
  });

  it('provides 30 source cases and 30 essays with fixed complete rubrics', () => {
    const samples = evaluationSamples();
    expect(samples.filter((sample) => sample.kind === 'source')).toHaveLength(
      30,
    );
    expect(samples.filter((sample) => sample.kind === 'essay')).toHaveLength(
      30,
    );
    expect(new Set(samples.map((sample) => sample.id)).size).toBe(60);
    for (const sample of samples) {
      if (sample.kind === 'essay') {
        expect(
          sample.input.rubric.reduce(
            (sum, criterion) => sum + criterion.maxUnits,
            0,
          ),
        ).toBe(10_000);
      } else {
        expect(
          sample.chunks.every(
            (chunk) => chunk.locator !== null && chunk.text.length > 0,
          ),
        ).toBe(true);
      }
    }
  });

  it('rejects fabricated citation IDs and grades exceeding a criterion', () => {
    const source = evaluationSamples().find(
      (sample) => sample.kind === 'source',
    )!;
    if (source.kind !== 'source') {
      throw new Error('Fixture missing');
    }
    expect(() =>
      validateChatCitations(
        {
          segments: [
            {
              text: 'Fonte inventada',
              basis: 'source',
              chunkIds: ['99999999-9999-4999-8999-999999999999'],
            },
          ],
          conflicts: [],
        },
        source.chunks,
      ),
    ).toThrow('AI_SOURCE_INVALID');
    expect(() =>
      validateGrade(
        {
          criteria: [
            {
              criterionId: 'conceitos',
              awardedUnits: 7000,
              reason: 'Excedeu teto',
            },
            { criterionId: 'relacoes', awardedUnits: 0, reason: 'Ausente' },
          ],
          explanation: 'Teste',
          strengths: [],
          gaps: [],
          referenceAnswer: 'Teste',
        },
        [
          {
            id: 'conceitos',
            label: 'Conceitos',
            maxUnits: 6000,
            description: 'Teste',
          },
          {
            id: 'relacoes',
            label: 'Relações',
            maxUnits: 4000,
            description: 'Teste',
          },
        ],
      ),
    ).toThrow('AI_GRADE_INVALID');
  });
});
