import { z } from 'zod';

export const chatOutputSchema = z.strictObject({
  segments: z.array(
    z.strictObject({
      text: z.string().min(1),
      basis: z.enum(['source', 'general', 'unsupported']),
      chunkIds: z.array(z.uuid()),
    }),
  ),
  conflicts: z.array(
    z.strictObject({ description: z.string(), chunkIds: z.array(z.uuid()) }),
  ),
});

const alternativeSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
});
const explanationSchema = z.strictObject({
  optionId: z.string().min(1),
  explanation: z.string().min(1),
});
const criterionSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  maxUnits: z.number().int().min(1).max(10_000),
  description: z.string().min(1),
});

export const examOutputSchema = z.strictObject({
  support: z.enum(['sufficient', 'insufficient']),
  reason: z.string().nullable(),
  questions: z.array(
    z.strictObject({
      topic: z.string().min(1),
      type: z.enum(['objective', 'essay']),
      statement: z.string().min(1),
      sourceChunkIds: z.array(z.uuid()),
      alternatives: z.array(alternativeSchema),
      correctOptionId: z.string().nullable(),
      optionExplanations: z.array(explanationSchema),
      rubric: z.array(criterionSchema),
      referenceAnswer: z.string().nullable(),
    }),
  ),
});

export const gradeOutputSchema = z.strictObject({
  criteria: z.array(
    z.strictObject({
      criterionId: z.string(),
      awardedUnits: z.number().int().min(0).max(10_000),
      reason: z.string().min(1),
    }),
  ),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  referenceAnswer: z.string(),
  explanation: z.string().min(1),
});

export const insightsOutputSchema = z.strictObject({
  recommendations: z.array(
    z.strictObject({
      topicIds: z.array(z.uuid()),
      evidenceAnswerIds: z.array(z.uuid()),
      action: z.string().min(1),
      explanation: z.string().min(1),
    }),
  ),
});

export type ChatOutput = z.infer<typeof chatOutputSchema>;
export type ExamOutput = z.infer<typeof examOutputSchema>;
export type GradeOutput = z.infer<typeof gradeOutputSchema>;
export type InsightsOutput = z.infer<typeof insightsOutputSchema>;

export function parseAiOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error('AI_SCHEMA_INVALID');
  }
  return result.data;
}
