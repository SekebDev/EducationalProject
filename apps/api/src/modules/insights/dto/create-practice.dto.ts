import { z } from 'zod';

export const practiceSchema = z.strictObject({
  topicIds: z.array(z.uuid()).min(1).max(30),
  total: z.number().int().min(10).max(30),
  objectiveCount: z.number().int().min(0).max(30),
  essayCount: z.number().int().min(0).max(30),
  studyLevel: z.string().trim().min(1).max(200),
  materialIds: z.array(z.uuid()).max(10),
});

export type CreatePracticeDto = z.infer<typeof practiceSchema>;
