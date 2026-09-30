import { createHash } from 'node:crypto';
import type pg from 'pg';
import { createPool } from '../../infrastructure/db/pool.js';
import { readConfig } from '../../infrastructure/config.js';
import { createAiProvider } from '../../infrastructure/ai/provider.js';
import type { ExamOutput } from '../../infrastructure/ai/contracts.js';
import type { JobHandler } from '../../infrastructure/jobs/dispatcher.js';

class ExamGenerationError extends Error {
  readonly retryable = false;
  constructor(readonly code: string) {
    super(code);
  }
}

type ExamRow = {
  id: string;
  study_level: string;
  total: number;
  objective_count: number;
  essay_count: number;
  context_snapshot: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } | null;
  origin_snapshot: {
    avoidStatements: string[];
    avoidedStatementHashes: string[];
  } | null;
};
type TopicRow = { id: string; display_name: string; requested_count: number };
type ChunkRow = {
  id: string;
  text: string;
  locator: unknown;
  material_id: string;
};

type GeneratedQuestion = ExamOutput['questions'][number];

function validateObjective(question: GeneratedQuestion): void {
  const ids = question.alternatives.map((item) => item.id);
  if (
    ids.length !== 4 ||
    new Set(ids).size !== 4 ||
    !question.correctOptionId ||
    !ids.includes(question.correctOptionId) ||
    question.rubric.length ||
    question.referenceAnswer !== null ||
    question.optionExplanations.length !== 4 ||
    new Set(question.optionExplanations.map((item) => item.optionId)).size !==
      4 ||
    question.optionExplanations.some((item) => !ids.includes(item.optionId))
  ) {
    throw new ExamGenerationError('AI_OBJECTIVE_INVALID');
  }
}

function validateEssay(question: GeneratedQuestion): void {
  if (
    question.alternatives.length ||
    question.correctOptionId !== null ||
    question.optionExplanations.length ||
    !question.referenceAnswer?.trim() ||
    question.rubric.length === 0 ||
    new Set(question.rubric.map((item) => item.id)).size !==
      question.rubric.length ||
    question.rubric.reduce((sum, item) => sum + item.maxUnits, 0) !== 10_000
  ) {
    throw new ExamGenerationError('AI_RUBRIC_INVALID');
  }
}

export function validateGeneratedExam(
  output: ExamOutput,
  exam: Pick<ExamRow, 'total' | 'objective_count' | 'essay_count'>,
  topics: TopicRow[],
  allowedChunkIds: Set<string>,
  avoidedStatementHashes: Set<string> = new Set(),
): void {
  if (output.support !== 'sufficient') {
    throw new ExamGenerationError('AI_INSUFFICIENT_SUPPORT');
  }
  if (output.questions.length !== exam.total) {
    throw new ExamGenerationError('AI_QUESTION_COUNT');
  }
  const required = new Map(
    topics.map((topic) => [topic.display_name, topic.requested_count]),
  );
  const actual = new Map(topics.map((topic) => [topic.display_name, 0]));
  let objectiveCount = 0;
  let essayCount = 0;
  const statements = new Set<string>();
  for (const question of output.questions) {
    if (!required.has(question.topic)) {
      throw new ExamGenerationError('AI_TOPIC_INVALID');
    }
    actual.set(question.topic, (actual.get(question.topic) ?? 0) + 1);
    const normalized = question.statement
      .trim()
      .replace(/\s+/gu, ' ')
      .toLocaleLowerCase('pt-BR');
    if (statements.has(normalized)) {
      throw new ExamGenerationError('AI_DUPLICATE_QUESTION');
    }
    statements.add(normalized);
    if (
      avoidedStatementHashes.has(
        createHash('sha256').update(normalized).digest('hex'),
      )
    ) {
      throw new ExamGenerationError('AI_DUPLICATE_ORIGIN');
    }
    if (
      (allowedChunkIds.size > 0 && question.sourceChunkIds.length === 0) ||
      question.sourceChunkIds.some((id) => !allowedChunkIds.has(id))
    ) {
      throw new ExamGenerationError('AI_SOURCE_INVALID');
    }
    if (question.type === 'objective') {
      objectiveCount++;
      validateObjective(question);
    } else {
      essayCount++;
      validateEssay(question);
    }
  }
  if (
    objectiveCount !== exam.objective_count ||
    essayCount !== exam.essay_count
  ) {
    throw new ExamGenerationError('AI_TYPE_COUNT');
  }
  if (
    topics.some(
      (topic) => actual.get(topic.display_name) !== topic.requested_count,
    )
  ) {
    throw new ExamGenerationError('AI_TOPIC_COVERAGE');
  }
}

export function createExamJobHandler(databaseUrl: string): JobHandler {
  const pool = createPool(databaseUrl);
  const provider = createAiProvider(readConfig(process.env));
  return async (lease) => {
    const result = await pool.query<ExamRow>(
      "SELECT id,study_level,total,objective_count,essay_count,context_snapshot,origin_snapshot FROM exam WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL AND state IN ('queued','generating')",
      [lease.ownerId, lease.resourceId],
    );
    const exam = result.rows[0];
    if (!exam) {
      throw new ExamGenerationError('EXAM_UNAVAILABLE');
    }
    if (
      !exam.context_snapshot?.messages.some(
        (message) => message.role === 'user' && message.content.trim(),
      )
    ) {
      throw new ExamGenerationError('EXAM_CONTEXT_EMPTY');
    }
    await pool.query(
      "UPDATE exam SET state='generating' WHERE owner_id=$1 AND id=$2 AND state='queued' AND deleted_at IS NULL",
      [lease.ownerId, exam.id],
    );
    const topicResult = await pool.query<TopicRow>(
      `SELECT t.id,t.display_name,et.requested_count FROM exam_topic et JOIN topic t ON t.id=et.topic_id AND t.owner_id=et.owner_id
       WHERE et.owner_id=$1 AND et.exam_id=$2 ORDER BY et.ordinal`,
      [lease.ownerId, exam.id],
    );
    const topics = topicResult.rows;
    const sourceResult = await pool.query<ChunkRow>(
      `SELECT mc.id,mc.text,mc.locator,mc.material_id FROM exam_source es
       JOIN material m ON m.id=es.material_id AND m.owner_id=es.owner_id AND m.version=es.material_version
       JOIN material_chunk mc ON mc.material_id=m.id AND mc.owner_id=m.owner_id AND mc.extraction_version=m.version-1
       WHERE es.owner_id=$1 AND es.exam_id=$2 AND es.available=true AND m.deleted_at IS NULL AND m.state='ready'
       ORDER BY mc.material_id,mc.ordinal LIMIT 100`,
      [lease.ownerId, exam.id],
    );
    const sourceCount = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM exam_source WHERE owner_id=$1 AND exam_id=$2',
      [lease.ownerId, exam.id],
    );
    const selectedCount = Number(sourceCount.rows[0]?.count ?? 0);
    if (selectedCount > 0 && sourceResult.rows.length === 0) {
      throw new ExamGenerationError('SOURCE_UNAVAILABLE');
    }
    const sourceIds = new Set(sourceResult.rows.map((chunk) => chunk.id));
    const output = await provider.exam({
      context: exam.context_snapshot.messages,
      topics: topics.map((topic) => topic.display_name),
      studyLevel: exam.study_level,
      total: exam.total,
      objectiveCount: exam.objective_count,
      essayCount: exam.essay_count,
      sources: sourceResult.rows.map((chunk) => ({
        id: chunk.id,
        text: chunk.text,
      })),
      ...(exam.origin_snapshot
        ? { avoidStatements: exam.origin_snapshot.avoidStatements }
        : {}),
    });
    validateGeneratedExam(
      output,
      exam,
      topics,
      sourceIds,
      new Set(exam.origin_snapshot?.avoidedStatementHashes ?? []),
    );
    return {
      apply: async (client: pg.PoolClient) => {
        const current = await client.query(
          "SELECT 1 FROM exam WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL AND state='generating' FOR UPDATE",
          [lease.ownerId, exam.id],
        );
        if (!current.rowCount) {
          throw new ExamGenerationError('EXAM_UNAVAILABLE');
        }
        const activeSources = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM exam_source es JOIN material m ON m.id=es.material_id AND m.owner_id=es.owner_id
         WHERE es.owner_id=$1 AND es.exam_id=$2 AND es.available=true AND m.deleted_at IS NULL AND m.state='ready' AND m.version=es.material_version`,
          [lease.ownerId, exam.id],
        );
        if (Number(activeSources.rows[0]?.count ?? 0) !== selectedCount) {
          throw new ExamGenerationError('SOURCE_UNAVAILABLE');
        }
        const topicByName = new Map(
          topics.map((topic) => [topic.display_name, topic.id]),
        );
        const chunkById = new Map(
          sourceResult.rows.map((chunk) => [chunk.id, chunk]),
        );
        for (const [index, question] of output.questions.entries()) {
          const topicId = topicByName.get(question.topic);
          if (!topicId) {
            throw new ExamGenerationError('AI_TOPIC_INVALID');
          }
          const statementHash = createHash('sha256')
            .update(
              question.statement
                .trim()
                .replace(/\s+/gu, ' ')
                .toLocaleLowerCase('pt-BR'),
            )
            .digest('hex');
          const locators = question.sourceChunkIds.map((id) => {
            const chunk = chunkById.get(id);
            if (!chunk) {
              throw new ExamGenerationError('AI_SOURCE_INVALID');
            }
            return {
              chunkId: id,
              materialId: chunk.material_id,
              locator: chunk.locator,
            };
          });
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO question(owner_id,exam_id,ordinal,topic_id,study_level_snapshot,type,statement,statement_hash,alternatives,source_locators)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING id`,
            [
              lease.ownerId,
              exam.id,
              index + 1,
              topicId,
              exam.study_level,
              question.type,
              question.statement,
              statementHash,
              question.type === 'objective'
                ? JSON.stringify(question.alternatives)
                : null,
              JSON.stringify(locators),
            ],
          );
          const questionId = inserted.rows[0]?.id;
          if (!questionId) {
            throw new Error('Questão não criada');
          }
          await client.query(
            `INSERT INTO question_secret(question_id,owner_id,correct_option_id,rubric,option_explanations,reference_answer)
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
            [
              questionId,
              lease.ownerId,
              question.correctOptionId,
              question.type === 'essay'
                ? JSON.stringify(question.rubric)
                : null,
              question.type === 'objective'
                ? JSON.stringify(question.optionExplanations)
                : null,
              question.referenceAnswer,
            ],
          );
        }
        await client.query(
          "UPDATE exam SET state='ready' WHERE owner_id=$1 AND id=$2",
          [lease.ownerId, exam.id],
        );
        await client.query(
          "INSERT INTO attempt(owner_id,exam_id,state) VALUES ($1,$2,'in_progress')",
          [lease.ownerId, exam.id],
        );
      },
    };
  };
}
