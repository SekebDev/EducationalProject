import { z } from 'zod';
import type pg from 'pg';
import { PublicError } from '../../infrastructure/http/public-error.js';

const rawSchema = z.strictObject({
  conversationId: z.uuid(),
  topicNames: z.array(z.string()).min(1).max(30),
  studyLevel: z.string(),
  total: z.number().int().min(10).max(30),
  objectiveCount: z.number().int().min(0).max(30),
  essayCount: z.number().int().min(0).max(30),
  materialIds: z.array(z.uuid()).max(10),
  originRecommendationId: z.uuid().optional(),
});

export type ExamConfig = {
  conversationId: string;
  topicNames: string[];
  studyLevel: string;
  total: number;
  objectiveCount: number;
  essayCount: number;
  materialIds: string[];
  originRecommendationId?: string;
};

export type ExamSourceSnapshot = {
  id: string;
  version: number;
  name: string;
};

export async function validateExamSources(
  client: pg.PoolClient,
  ownerId: string,
  conversationId: string,
  materialIds: string[],
): Promise<ExamSourceSnapshot[]> {
  if (materialIds.length === 0) {
    return [];
  }
  const result = await client.query<{
    id: string;
    version: number;
    original_name: string;
  }>(
    `SELECT id,version,original_name FROM material
     WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND conversation_id=$3 AND state='ready' AND deleted_at IS NULL
     ORDER BY id FOR SHARE`,
    [ownerId, materialIds, conversationId],
  );
  if (result.rows.length !== materialIds.length) {
    throw new PublicError(
      422,
      'SOURCE_UNAVAILABLE',
      'Escolha apenas materiais prontos e disponíveis.',
    );
  }
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  return materialIds.map((id) => {
    const row = byId.get(id);
    if (!row) {
      throw new Error('Fonte validada ausente');
    }
    return { id, version: row.version, name: row.original_name };
  });
}

export function parseExamConfig(value: unknown): ExamConfig {
  const parsed = rawSchema.safeParse(value);
  if (!parsed.success) {
    throw new PublicError(
      422,
      'INVALID_EXAM_CONFIG',
      'Confira a configuração da prova.',
    );
  }
  const input = parsed.data;
  const topics = input.topicNames.map((name) =>
    name.trim().replace(/\s+/gu, ' '),
  );
  const level = input.studyLevel.trim().replace(/\s+/gu, ' ');
  const topicKeys = topics.map((name) => name.toLocaleLowerCase('pt-BR'));
  if (
    topics.some((name) => name.length === 0 || name.length > 200) ||
    level.length === 0 ||
    level.length > 200 ||
    topics.length > input.total ||
    new Set(topicKeys).size !== topics.length ||
    input.objectiveCount + input.essayCount !== input.total ||
    new Set(input.materialIds).size !== input.materialIds.length
  ) {
    throw new PublicError(
      422,
      'INVALID_EXAM_CONFIG',
      'Confira temas, nível e distribuição das questões.',
    );
  }
  return {
    conversationId: input.conversationId,
    topicNames: topics,
    studyLevel: level,
    total: input.total,
    objectiveCount: input.objectiveCount,
    essayCount: input.essayCount,
    materialIds: input.materialIds,
    ...(input.originRecommendationId
      ? { originRecommendationId: input.originRecommendationId }
      : {}),
  };
}
