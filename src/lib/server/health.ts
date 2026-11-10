import 'server-only';
import { z } from 'zod';

export const healthResponseSchema = z.strictObject({
  ok: z.boolean(),
  version: z.string().min(1),
  uptimeS: z.number().nonnegative(),
  providers: z.strictObject({ gemini: z.boolean(), sarvam: z.boolean() }),
  sessions: z.number().int().nonnegative(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export const notFoundSchema = z.strictObject({ error: z.literal('NOT_FOUND') });
