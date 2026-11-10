import { z } from 'zod';
import { VOICE_LIMITS } from '@/lib/voice/limits';

export const publicErrorSchema = z.strictObject({
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(300),
  retryable: z.boolean(),
});
export const echoTimingsSchema = z.strictObject({
  sttMs: z.number().nonnegative(),
  ttsFirstMs: z.number().nonnegative(),
  totalMs: z.number().nonnegative(),
});
export type EchoTimings = z.infer<typeof echoTimingsSchema>;
export const echoEventSchema = z.discriminatedUnion('event', [
  z.strictObject({
    event: z.literal('transcript'),
    data: z.strictObject({
      text: z.string().max(VOICE_LIMITS.transcriptChars),
      sttMs: z.number().nonnegative(),
    }),
  }),
  z.strictObject({
    event: z.literal('sentence'),
    data: z.strictObject({
      idx: z.number().int().nonnegative(),
      text: z.string().min(1).max(VOICE_LIMITS.ttsTextChars),
    }),
  }),
  z.strictObject({
    event: z.literal('audio'),
    data: z.strictObject({
      idx: z.number().int().nonnegative(),
      mime: z.literal('audio/wav'),
      b64: z
        .base64()
        .min(1)
        .max(Math.ceil(VOICE_LIMITS.ttsAudioBytes / 3) * 4),
    }),
  }),
  z.strictObject({
    event: z.literal('done'),
    data: z.strictObject({
      timings: echoTimingsSchema,
      turn: z.number().int().positive(),
    }),
  }),
  z.strictObject({ event: z.literal('error'), data: publicErrorSchema }),
]);
export type EchoEvent = z.infer<typeof echoEventSchema>;
export type EmitEchoEvent = (event: EchoEvent) => void;
export const sessionIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const textTurnSchema = z.strictObject({
  sessionId: sessionIdSchema,
  text: z.string().trim().min(1).max(VOICE_LIMITS.textChars),
});
