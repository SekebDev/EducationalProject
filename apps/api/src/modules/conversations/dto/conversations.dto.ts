import { z } from 'zod';

export const personalitySchema = z.enum([
  'acolhedora',
  'objetiva',
  'socratica',
]);
export const createSchema = z.strictObject({
  personality: personalitySchema,
  title: z.string().trim().min(1).max(120).optional(),
});
export const updateSchema = z.strictObject({
  personality: personalitySchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  version: z.number().int().min(1),
});
export const sendSchema = z.strictObject({
  content: z.string().trim().min(1).max(12_000),
  conversationVersion: z.number().int().min(1),
});
export const sourcesSchema = z.strictObject({
  materialIds: z.array(z.uuid()).max(10),
  version: z.number().int().min(1),
});

export type CreateConversationDto = z.infer<typeof createSchema>;
export type UpdateConversationDto = z.infer<typeof updateSchema>;
export type SendMessageDto = z.infer<typeof sendSchema>;
export type SelectSourcesDto = z.infer<typeof sourcesSchema>;
