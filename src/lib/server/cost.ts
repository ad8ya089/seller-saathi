import 'server-only';
import { z } from 'zod';

export const pricingSchema = z.strictObject({
  source: z.url(),
  verified: z.iso.date(),
  llm: z.record(
    z.string(),
    z.strictObject({
      inputUsdPerMillion: z.number().nonnegative(),
      outputUsdPerMillion: z.number().nonnegative(),
    }),
  ),
  stt: z.record(z.string(), z.number().nonnegative()),
  tts: z.record(z.string(), z.number().nonnegative()),
});
export type Pricing = z.infer<typeof pricingSchema>;
// Standard paid pay-as-you-go rates; no cache/grounding/diarization enabled.
// Units: LLM USD / million tokens; STT INR / minute; TTS INR / 1000 chars.
export function defaultPricing(day: string): Pricing {
  return {
    source: 'https://aistudio.google.com/docs/pricing',
    verified: '2026-11-11',
    llm: {
      'gemini-3.5-flash-lite': {
        inputUsdPerMillion: 0.3,
        outputUsdPerMillion: 2.5,
      },
      'gemini-3.6-flash': {
        inputUsdPerMillion: day < '2027-01-01' ? 0.75 : 1.5,
        outputUsdPerMillion: day < '2027-01-01' ? 3.75 : 7.5,
      },
    },
    stt: { 'saaras:v4': 0.49, 'saaras:v3': 0.49 },
    tts: { 'bulbul:v4-flash': day <= '2026-11-12' ? 1 : 2, 'bulbul:v3': 3 },
  };
}
export const SPEECH_PRICING_SOURCE = {
  source: 'https://www.sarvam.ai/api-pricing',
  verified: '2026-11-11',
};
export function llmCost(
  model: string,
  usage: { input: number; output: number; thoughts: number },
  pricing: Pricing,
): number | null {
  const rate = pricing.llm[model];
  return rate
    ? (usage.input * rate.inputUsdPerMillion +
        (usage.output + usage.thoughts) * rate.outputUsdPerMillion) /
        1000000
    : null;
}
