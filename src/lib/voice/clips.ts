import { z } from 'zod';

export const CLIP_TEXT = {
  filler: 'One moment, let me check.',
  reprompt: "Sorry, I didn't catch that. Could you say it again?",
  apology: "I'm having trouble right now. Could you try again?",
  turns: 'This call has reached its turn limit. Please start a new call.',
  time: 'We have reached the time limit for this call. Please start a new call.',
  daily: 'The demo has reached its daily budget. Please return tomorrow.',
} as const;
export type ClipName = keyof typeof CLIP_TEXT;
export const clipBundleSchema = z.strictObject({
  state: z.enum(['unconfigured', 'pending', 'ready', 'degraded']),
  clips: z.record(
    z.enum(['filler', 'reprompt', 'apology', 'turns', 'time', 'daily']),
    z.string().nullable(),
  ),
});
export type ClipBundle = z.infer<typeof clipBundleSchema>;
