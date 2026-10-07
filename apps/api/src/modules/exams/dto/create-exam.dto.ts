import { z } from 'zod';

export const rawSchema = z.strictObject({
  conversationId: z.uuid(),
  topicNames: z.array(z.string()).min(1).max(30),
  studyLevel: z.string(),
  total: z.number().int().min(10).max(30),
  objectiveCount: z.number().int().min(0).max(30),
  essayCount: z.number().int().min(0).max(30),
  materialIds: z.array(z.uuid()).max(10),
  originRecommendationId: z.uuid().optional(),
});

export type CreateExamDto = z.infer<typeof rawSchema>;
