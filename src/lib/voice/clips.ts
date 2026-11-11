import { z } from 'zod';
import { languageSchema } from '@/lib/voice/language';
import type { Language } from '@/lib/voice/language';

export const CLIP_TEXT = {
  filler: 'One moment, let me check.',
  reprompt: "Sorry, I didn't catch that. Could you say it again?",
  apology: "I'm having trouble right now. Could you try again?",
  turns: 'This call has reached its turn limit. Please start a new call.',
  time: 'We have reached the time limit for this call. Please start a new call.',
  daily: 'The demo has reached its daily budget. Please return tomorrow.',
} as const;
export type ClipName = keyof typeof CLIP_TEXT;
const HINDI_CLIP_TEXT: Record<ClipName, string> = {
  filler: 'Ek pal, main check karta hoon.',
  reprompt: 'Maaf kijiye, baat saaf nahi sunai di. Kya aap phir se bolenge?',
  apology: 'Abhi kuch dikkat aa rahi hai. Kya aap phir try karenge?',
  turns:
    'Is call ki turn limit poori ho gayi hai. Kripya nayi call shuru kijiye.',
  time: 'Is call ka samay poora ho gaya hai. Kripya nayi call shuru kijiye.',
  daily: 'Demo ka aaj ka budget poora ho gaya hai. Kripya kal phir aaiye.',
};
export function clipText(
  language: Language,
): Readonly<Record<ClipName, string>> {
  return language === 'hi-IN' ? HINDI_CLIP_TEXT : CLIP_TEXT;
}
export const clipBundleSchema = z.strictObject({
  language: languageSchema.optional(),
  state: z.enum(['unconfigured', 'pending', 'ready', 'degraded']),
  clips: z.record(
    z.enum(['filler', 'reprompt', 'apology', 'turns', 'time', 'daily']),
    z.string().nullable(),
  ),
});
export type ClipBundle = z.infer<typeof clipBundleSchema>;
