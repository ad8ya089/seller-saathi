import 'server-only';
import { z } from 'zod';
import { pricingSchema } from '@/lib/server/cost';
import { metricsSnapshotSchema } from '@/lib/voice/operational-metrics';

export const healthResponseSchema = z.strictObject({
  ok: z.boolean(),
  version: z.string().min(1),
  uptimeS: z.number().nonnegative(),
  providers: z.strictObject({ gemini: z.boolean(), sarvam: z.boolean() }),
  sessions: z.number().int().nonnegative(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export const notFoundSchema = z.strictObject({ error: z.literal('NOT_FOUND') });
export const verboseHealthSchema = z.strictObject({
  metrics: metricsSnapshotSchema,
  pricing: pricingSchema,
  speechPricing: z.strictObject({ source: z.url(), verified: z.iso.date() }),
  configured: z.strictObject({ gemini: z.boolean(), sarvam: z.boolean() }),
  limits: z.strictObject({
    dailyTurnCap: z.number().int().positive(),
    rateLimitTurns: z.number().int().positive(),
  }),
  clips: z.string(),
});
