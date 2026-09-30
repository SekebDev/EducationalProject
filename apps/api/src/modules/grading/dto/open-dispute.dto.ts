import { z } from 'zod';

export const openDisputeSchema = z.strictObject({
  reason: z.string().min(1).max(2_000),
});
export type OpenDisputeDto = z.infer<typeof openDisputeSchema>;
