import { z } from 'zod';

export const credentialsSchema = z.strictObject({
  email: z.email().max(320),
  password: z.string().min(12).max(128),
});
export const resetRequestSchema = z.strictObject({ email: z.email().max(320) });
export const resetConfirmSchema = z.strictObject({
  token: z.string().min(32),
  newPassword: z.string().min(12).max(128),
});

export type CredentialsDto = z.infer<typeof credentialsSchema>;
export type RequestPasswordResetDto = z.infer<typeof resetRequestSchema>;
export type ConfirmPasswordResetDto = z.infer<typeof resetConfirmSchema>;
