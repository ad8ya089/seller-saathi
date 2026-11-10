import { z } from 'zod';
export const operationalTurnSchema = z.strictObject({
  sessionId: z.string(),
  turn: z.number().int().nonnegative(),
  phase: z.string(),
  status: z.enum(['success', 'failed', 'interrupted']),
  errorCode: z.string().nullable(),
  metrics: z.strictObject({
    usageComplete: z.boolean().optional(),
    sttMs: z.number().nonnegative(),
    llmFirstMs: z.number().nonnegative(),
    llmTotalMs: z.number().nonnegative(),
    ttsFirstMs: z.number().nonnegative(),
    firstAudioMs: z.number().nonnegative(),
    totalMs: z.number().nonnegative(),
    providerFallbacks: z
      .strictObject({
        stt: z.number().nonnegative(),
        tts: z.number().nonnegative(),
        llm: z.number().nonnegative(),
      })
      .optional(),
    tools: z.array(z.string()),
    models: z.array(z.string()),
    tokens: z.strictObject({
      input: z.number().nonnegative(),
      output: z.number().nonnegative(),
      thoughts: z.number().nonnegative(),
    }),
    ttsChars: z.number().nonnegative(),
    fallbacks: z.number().nonnegative(),
  }),
});
export type OperationalTurn = z.infer<typeof operationalTurnSchema>;
