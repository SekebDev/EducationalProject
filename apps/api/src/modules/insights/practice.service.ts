import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { readConfig } from '../../infrastructure/config.js';
import { createPool } from '../../infrastructure/db/pool.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { ExamsService } from '../exams/exams.service.js';
import { RecommendationsService } from './recommendations.service.js';

const practiceSchema = z.strictObject({
  topicIds: z.array(z.uuid()).min(1).max(30),
  total: z.number().int().min(10).max(30),
  objectiveCount: z.number().int().min(0).max(30),
  essayCount: z.number().int().min(0).max(30),
  studyLevel: z.string().trim().min(1).max(200),
  materialIds: z.array(z.uuid()).max(10),
});

export function parsePractice(value: unknown, allowedTopics: string[]) {
  const parsed = practiceSchema.safeParse(value);
  if (!parsed.success) {
    throw new PublicError(
      422,
      'INVALID_PRACTICE',
      'Confira a configuração da prática.',
    );
  }
  const input = parsed.data;
  if (
    input.topicIds.length > input.total ||
    input.objectiveCount + input.essayCount !== input.total ||
    new Set(input.topicIds).size !== input.topicIds.length ||
    new Set(input.materialIds).size !== input.materialIds.length ||
    input.topicIds.some((id) => !allowedTopics.includes(id))
  ) {
    throw new PublicError(
      422,
      'INVALID_PRACTICE',
      'Escolha somente temas recomendados e uma divisão válida.',
    );
  }
  return input;
}

@Injectable()
export class PracticeService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);
  constructor(
    @Inject(RecommendationsService)
    private readonly recommendations: RecommendationsService,
    @Inject(ExamsService) private readonly exams: ExamsService,
  ) {}

  async get(ownerId: string, recommendationId: string) {
    const recommendation = await this.recommendations.requireCurrent(
      ownerId,
      recommendationId,
    );
    const topics = await this.pool.query<{ id: string; display_name: string }>(
      'SELECT id,display_name FROM topic WHERE owner_id=$1 AND id=ANY($2::uuid[])',
      [ownerId, recommendation.topic_ids],
    );
    if (topics.rows.length !== recommendation.topic_ids.length) {
      throw new PublicError(409, 'STALE_EVIDENCE', 'Temas indisponíveis.');
    }
    const origin = await this.pool.query<{
      conversation_id: string | null;
      study_level: string;
    }>(
      `SELECT e.conversation_id,e.study_level FROM answer a
       JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
       JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
       WHERE a.owner_id=$1 AND a.id=ANY($2::uuid[])
       ORDER BY att.submitted_at DESC LIMIT 1`,
      [ownerId, recommendation.evidence_answer_ids],
    );
    const source = origin.rows[0];
    if (!source?.conversation_id) {
      throw new PublicError(
        422,
        'PRACTICE_ORIGIN_UNAVAILABLE',
        'Esta recomendação não tem conversa de origem disponível.',
      );
    }
    return {
      id: recommendationId,
      topics: topics.rows.map((row) => ({
        id: row.id,
        name: row.display_name,
      })),
      studyLevel: source.study_level,
      conversationId: source.conversation_id,
    };
  }

  async create(
    ownerId: string,
    recommendationId: string,
    key: string,
    body: unknown,
  ) {
    const origin = await this.get(ownerId, recommendationId);
    const input = parsePractice(
      body,
      origin.topics.map((topic) => topic.id),
    );
    const byId = new Map(origin.topics.map((topic) => [topic.id, topic.name]));
    return this.exams.create(ownerId, key, {
      conversationId: origin.conversationId,
      topicNames: input.topicIds.map((id) => byId.get(id)),
      studyLevel: input.studyLevel,
      total: input.total,
      objectiveCount: input.objectiveCount,
      essayCount: input.essayCount,
      materialIds: input.materialIds,
      originRecommendationId: recommendationId,
    });
  }
}
