import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { readConfig } from '../../infrastructure/config.js';
import { createPool } from '../../infrastructure/db/pool.js';
import { createAiProvider } from '../../infrastructure/ai/provider.js';
import type { AiProvider } from '../../infrastructure/ai/provider.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { InsightsService } from './insights.service.js';
import type { InsightFilters } from './insights.service.js';

type Topic = Awaited<ReturnType<InsightsService['get']>>['topics'][number];

export function selectAction(
  topic: Topic,
  proposals: Awaited<ReturnType<AiProvider['insights']>>['recommendations'],
): string {
  const matching = proposals.find(
    (proposal) =>
      proposal.topicIds.length === 1 &&
      proposal.topicIds[0] === topic.topicId &&
      proposal.evidenceAnswerIds.length > 0 &&
      proposal.evidenceAnswerIds.every((id) =>
        topic.evidenceAnswerIds.includes(id),
      ) &&
      proposal.action.length <= 500,
  );
  if (matching) {
    return matching.action;
  }
  return topic.classification === 'attention'
    ? `Revise ${topic.name} no nível ${topic.level} e pratique com novas questões sobre as dificuldades observadas.`
    : `Pratique ${topic.name} no nível ${topic.level} para consolidar os conceitos.`;
}

@Injectable()
export class RecommendationsService {
  private readonly pool = createPool(readConfig(process.env).databaseUrl);
  constructor(
    @Inject(InsightsService) private readonly insights: InsightsService,
  ) {}

  async list(ownerId: string, filters: InsightFilters) {
    const summary = await this.insights.get(ownerId, filters);
    const candidates = summary.topics.filter(
      (topic) =>
        topic.classification === 'attention' ||
        topic.classification === 'developing',
    );
    if (candidates.length === 0) {
      return { ...summary, recommendations: [] };
    }
    let proposals: Awaited<
      ReturnType<AiProvider['insights']>
    >['recommendations'] = [];
    try {
      proposals = (
        await createAiProvider(readConfig(process.env)).insights({
          topicIds: candidates.map((topic) => topic.topicId),
          evidenceAnswerIds: candidates.flatMap(
            (topic) => topic.evidenceAnswerIds,
          ),
        })
      ).recommendations;
    } catch {
      // O texto da ação tem um fallback determinístico; notas e evidências nunca vêm da IA.
    }
    const recommendations = [];
    for (const topic of candidates) {
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            filters: summary.filters,
            topicId: topic.topicId,
            level: topic.level,
            answerIds: topic.evidenceAnswerIds,
            revisionIds: topic.evidenceRevisionIds,
          }),
        )
        .digest('hex');
      const action = selectAction(topic, proposals);
      const created = await this.pool.query<{ id: string }>(
        `INSERT INTO recommendation(owner_id,topic_ids,evidence_answer_ids,evidence_revision_ids,filter_snapshot,action,state,fingerprint)
         VALUES ($1,$2::uuid[],$3::uuid[],$4::uuid[],$5::jsonb,$6,'active',$7)
         ON CONFLICT(owner_id,fingerprint) DO UPDATE SET action=EXCLUDED.action
         RETURNING id`,
        [
          ownerId,
          [topic.topicId],
          topic.evidenceAnswerIds,
          topic.evidenceRevisionIds,
          JSON.stringify(summary.filters),
          action,
          fingerprint,
        ],
      );
      recommendations.push({
        id: created.rows[0]!.id,
        topicIds: [topic.topicId],
        topicName: topic.name,
        level: topic.level,
        classification: topic.classification,
        action,
        evidenceAnswerIds: topic.evidenceAnswerIds,
        evidenceRevisionIds: topic.evidenceRevisionIds,
      });
    }
    return { ...summary, recommendations };
  }

  async requireCurrent(ownerId: string, recommendationId: string) {
    const found = await this.pool.query<{
      id: string;
      topic_ids: string[];
      evidence_answer_ids: string[];
      evidence_revision_ids: string[];
      state: string;
      filter_snapshot: InsightFilters;
    }>(
      'SELECT id,topic_ids,evidence_answer_ids,evidence_revision_ids,state,filter_snapshot FROM recommendation WHERE owner_id=$1 AND id=$2',
      [ownerId, recommendationId],
    );
    const recommendation = found.rows[0];
    if (!recommendation) {
      throw new PublicError(404, 'NOT_FOUND', 'Recomendação não encontrada.');
    }
    const revisions = await this.pool.query<{
      answer_id: string;
      revision_id: string;
    }>(
      `SELECT a.id AS answer_id,gc.current_revision_id AS revision_id
       FROM answer a JOIN grade_current gc ON gc.answer_id=a.id AND gc.owner_id=a.owner_id
       JOIN attempt att ON att.id=a.attempt_id AND att.owner_id=a.owner_id
       JOIN exam e ON e.id=att.exam_id AND e.owner_id=att.owner_id
       WHERE a.owner_id=$1 AND a.id=ANY($2::uuid[]) AND gc.state='graded'
         AND att.state='completed' AND att.deleted_at IS NULL AND e.deleted_at IS NULL`,
      [ownerId, recommendation.evidence_answer_ids],
    );
    const byAnswer = new Map(
      revisions.rows.map((row) => [row.answer_id, row.revision_id]),
    );
    const valid =
      recommendation.state === 'active' &&
      recommendation.evidence_answer_ids.length ===
        recommendation.evidence_revision_ids.length &&
      recommendation.evidence_answer_ids.every(
        (id, index) =>
          byAnswer.get(id) === recommendation.evidence_revision_ids[index],
      );
    if (!valid) {
      await this.pool.query(
        "UPDATE recommendation SET state='stale' WHERE owner_id=$1 AND id=$2",
        [ownerId, recommendationId],
      );
      throw new PublicError(
        409,
        'STALE_EVIDENCE',
        'Os resultados mudaram. Atualize a evolução antes de praticar.',
      );
    }
    return recommendation;
  }
}
