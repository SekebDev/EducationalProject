import { describe, expect, it } from 'vitest';
import { selectAction } from '../../src/modules/insights/recommendations.service.js';

const topic = {
  topicId: crypto.randomUUID(),
  level: 'Médio',
  name: 'História',
  classification: 'attention' as const,
  pointsUnits: 12000,
  possibleUnits: 30000,
  points: 1.2,
  possiblePoints: 3,
  questionCount: 3,
  percentage: 40,
  evidenceAnswerIds: [crypto.randomUUID()],
  evidenceRevisionIds: [crypto.randomUUID()],
  evidence: [],
};

describe('ações de estudo', () => {
  it('usa proposta restrita às evidências e faz fallback se a IA inventar IDs', () => {
    expect(
      selectAction(topic, [
        {
          topicIds: [topic.topicId],
          evidenceAnswerIds: topic.evidenceAnswerIds,
          action: 'Refaça três exercícios sobre causas históricas.',
          explanation: 'lacuna observada',
        },
      ]),
    ).toContain('Refaça');
    expect(
      selectAction(topic, [
        {
          topicIds: [crypto.randomUUID()],
          evidenceAnswerIds: topic.evidenceAnswerIds,
          action: 'Ação inventada',
          explanation: 'não usar',
        },
      ]),
    ).toContain('Revise História');
  });
});
