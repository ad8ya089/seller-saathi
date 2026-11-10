import { z } from 'zod';
export const operationalTurnSchema = z.strictObject({
  sessionId: z.string(),
  turn: z.number().int().nonnegative(),
  phase: z.string(),
  status: z.enum(['success', 'failed', 'interrupted']),
  errorCode: z.string().nullable(),
  metrics: z.strictObject({
    historyBytes: z
      .strictObject({
        before: z.number().nonnegative(),
        after: z.number().nonnegative(),
      })
      .optional(),
    providerModels: z
      .strictObject({ stt: z.string(), tts: z.string() })
      .optional(),
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

export const metricsSnapshotSchema = z.strictObject({
  window: z.string(),
  day: z.iso.date(),
  totalTurns: z.number().nonnegative(),
  successfulTurns: z.number().nonnegative(),
  failedTurns: z.number().nonnegative(),
  interruptedTurns: z.number().nonnegative(),
  errors: z.record(z.string(), z.number().nonnegative()),
  fillerPlays: z.number().nonnegative(),
  fallbacks: z.number().nonnegative(),
  providerFallbacks: z.strictObject({
    stt: z.number().nonnegative(),
    tts: z.number().nonnegative(),
    llm: z.number().nonnegative(),
  }),
  tokens: z.strictObject({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    thoughts: z.number().nonnegative(),
  }),
  ttsCharacters: z.number().nonnegative(),
  firstAudioMs: z.strictObject({
    p50: z.number().nonnegative().nullable(),
    p95: z.number().nonnegative().nullable(),
  }),
  estimatedSessionCost: z.number().nonnegative().nullable(),
  estimatedDayCost: z.number().nonnegative().nullable(),
  costUnavailableReason: z.string(),
});
