import { describe, expect, it } from 'vitest';
import { FakeAiProvider } from '../../src/infrastructure/ai/provider.js';
import { validateGeneratedExam } from '../../src/modules/exams/exam.job.js';

const topics = [
  { id: crypto.randomUUID(), display_name: 'Ecologia', requested_count: 5 },
  { id: crypto.randomUUID(), display_name: 'Genética', requested_count: 5 },
];
const config = { total: 10, objective_count: 5, essay_count: 5 };

async function generated() {
  return new FakeAiProvider().exam({
    context: [{ role: 'user', content: 'Quero entender ecossistemas.' }],
    topics: topics.map((topic) => topic.display_name),
    studyLevel: 'Ensino Médio',
    total: 10,
    objectiveCount: 5,
    essayCount: 5,
    sources: [],
  });
}

describe('exam publication validation', () => {
  it('accepts the exact fake exam', async () => {
    const output = await generated();
    expect(() =>
      validateGeneratedExam(output, config, topics, new Set()),
    ).not.toThrow();
  });

  it('rejects a duplicate statement and wrong topic coverage', async () => {
    const duplicate = await generated();
    duplicate.questions[1]!.statement = duplicate.questions[0]!.statement;
    expect(() =>
      validateGeneratedExam(duplicate, config, topics, new Set()),
    ).toThrow('AI_DUPLICATE_QUESTION');

    const coverage = await generated();
    coverage.questions[1]!.topic = 'Ecologia';
    expect(() =>
      validateGeneratedExam(coverage, config, topics, new Set()),
    ).toThrow('AI_TOPIC_COVERAGE');
  });

  it('rejects malformed alternatives, rubrics and source references', async () => {
    const options = await generated();
    options.questions[0]!.alternatives[1]!.id = 'A';
    expect(() =>
      validateGeneratedExam(options, config, topics, new Set()),
    ).toThrow('AI_OBJECTIVE_INVALID');

    const rubric = await generated();
    rubric.questions[5]!.rubric[0]!.maxUnits = 9_999;
    expect(() =>
      validateGeneratedExam(rubric, config, topics, new Set()),
    ).toThrow('AI_RUBRIC_INVALID');

    const source = await generated();
    source.questions[0]!.sourceChunkIds = [crypto.randomUUID()];
    expect(() =>
      validateGeneratedExam(source, config, topics, new Set()),
    ).toThrow('AI_SOURCE_INVALID');

    const missingCitation = await generated();
    expect(() =>
      validateGeneratedExam(
        missingCitation,
        config,
        topics,
        new Set([crypto.randomUUID()]),
      ),
    ).toThrow('AI_SOURCE_INVALID');
  });
});
