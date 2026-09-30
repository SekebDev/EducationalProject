import { z } from 'zod';

export const answerSchema = z.strictObject({
  value: z.string().max(20_000),
  expectedVersion: z.number().int().nonnegative(),
});
export const submitSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  acceptUnanswered: z.boolean(),
});

export type AnswerDto = z.infer<typeof answerSchema>;
export type SubmitAttemptDto = z.infer<typeof submitSchema>;
