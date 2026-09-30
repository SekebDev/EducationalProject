import { z } from 'zod';

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.string()).optional(),
    retryable: z.boolean(),
    requestId: z.string(),
  }),
});

export const personalitySchema = z.enum([
  'acolhedora',
  'objetiva',
  'socratica',
]);
export const studentSchema = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  timezone: z.string(),
});
export const conversationSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  personality: personalitySchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

export const messageSchema = z.strictObject({
  id: z.uuid(),
  sequence: z.number().int().positive(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  state: z.enum(['queued', 'generating', 'completed', 'failed']),
  personality: personalitySchema,
  references: z.array(
    z.strictObject({
      materialId: z.uuid(),
      chunkId: z.uuid(),
      name: z.string(),
      locator: z.discriminatedUnion('kind', [
        z.strictObject({
          kind: z.literal('page'),
          number: z.number().int().positive(),
        }),
        z.strictObject({
          kind: z.literal('paragraph'),
          number: z.number().int().positive(),
        }),
        z.strictObject({
          kind: z.literal('line'),
          number: z.number().int().positive(),
        }),
      ]),
      available: z.boolean(),
    }),
  ),
  aiGenerated: z.boolean(),
  operationId: z.uuid().nullable().optional(),
});

export const operationSchema = z.strictObject({
  id: z.uuid(),
  kind: z.string(),
  state: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  phase: z.string(),
  attemptCount: z.number().int().nonnegative(),
  retryable: z.boolean(),
  error: z.strictObject({ code: z.string(), message: z.string() }).optional(),
  resourceId: z.uuid(),
  updatedAt: z.iso.datetime(),
});

export const pageSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.strictObject({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });

export const questionPublicSchema = z.strictObject({
  id: z.uuid(),
  ordinal: z.number().int().positive(),
  type: z.enum(['objective', 'essay']),
  topic: z.string(),
  studyLevel: z.string(),
  statement: z.string(),
  alternatives: z
    .array(z.strictObject({ id: z.string(), text: z.string() }))
    .optional(),
});

export const examSchema = z.strictObject({
  id: z.uuid(),
  conversationId: z.uuid().nullable(),
  conversationTitle: z.string().nullable(),
  title: z.string(),
  studyLevel: z.string(),
  total: z.number().int().min(10).max(30),
  objectiveCount: z.number().int().nonnegative(),
  essayCount: z.number().int().nonnegative(),
  state: z.enum(['queued', 'generating', 'ready', 'failed']),
  operationId: z.uuid(),
  attemptId: z.uuid().nullable().optional(),
  createdAt: z.iso.datetime(),
  questions: z.array(questionPublicSchema),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type Personality = z.infer<typeof personalitySchema>;
export type Student = z.infer<typeof studentSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type Page<T> = { items: T[]; nextCursor: string | null };
export type QuestionPublic = z.infer<typeof questionPublicSchema>;
export type Exam = z.infer<typeof examSchema>;
export type ExamListItem = Pick<
  Exam,
  | 'id'
  | 'conversationId'
  | 'conversationTitle'
  | 'title'
  | 'studyLevel'
  | 'total'
  | 'state'
  | 'operationId'
  | 'createdAt'
>;
