import { z } from 'zod';
import { VOICE_LIMITS } from '@/lib/voice/limits';

export const sttModelSchema = z.enum(['saaras:v4', 'saaras:v3']);
export const sttModeSchema = z.enum([
  'transcribe',
  'translate',
  'verbatim',
  'translit',
  'codemix',
]);
export const sttLanguageSchema = z.enum([
  'unknown',
  'en-IN',
  'hi-IN',
  'bn-IN',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'od-IN',
  'pa-IN',
  'ta-IN',
  'te-IN',
  'gu-IN',
  'as-IN',
  'ur-IN',
  'ne-IN',
  'kok-IN',
  'ks-IN',
  'sd-IN',
  'sa-IN',
  'sat-IN',
  'mni-IN',
  'brx-IN',
  'mai-IN',
  'doi-IN',
]);
export const ttsModelSchema = z.enum(['bulbul:v4-flash', 'bulbul:v3']);
export const ttsLanguageSchema = z.enum([
  'en-IN',
  'hi-IN',
  'bn-IN',
  'ta-IN',
  'te-IN',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'gu-IN',
  'pa-IN',
  'od-IN',
]);
export type SttModel = z.infer<typeof sttModelSchema>;
export type SttMode = z.infer<typeof sttModeSchema>;
export type TtsModel = z.infer<typeof ttsModelSchema>;

export const DEFAULT_SPEAKERS: Readonly<Record<TtsModel, string>> = {
  'bulbul:v4-flash': 'shubh_enhi_ads',
  'bulbul:v3': 'priya',
};
export const AUDITION_SPEAKERS: Readonly<Record<TtsModel, readonly string[]>> =
  {
    'bulbul:v4-flash': [
      'shubh_enhi_ads',
      'ishita_enhi_customer',
      'shalini_enhi_customer',
      'simran_enhi_customer',
      'sunny_enhi_customer',
    ],
    'bulbul:v3': ['priya', 'shubh', 'roopa', 'aditya', 'ritu'],
  };
const V3_SPEAKERS = new Set([
  'shubh',
  'aditya',
  'ritu',
  'priya',
  'neha',
  'rahul',
  'pooja',
  'rohan',
  'simran',
  'kavya',
  'amit',
  'dev',
  'ishita',
  'shreya',
  'ratan',
  'varun',
  'manan',
  'sumit',
  'roopa',
  'kabir',
  'aayan',
  'ashutosh',
  'advait',
  'anand',
  'tanya',
  'tarun',
  'sunny',
  'mani',
  'gokul',
  'vijay',
  'shruti',
  'suhani',
  'mohit',
  'kavitha',
  'rehan',
  'soham',
  'rupali',
]);

// v4's evolving catalog uses persona IDs. Check the model-specific format here;
// Sarvam remains authoritative for whether an individual persona is available.
export function compatibleSpeaker(model: TtsModel, speaker: string): boolean {
  return model === 'bulbul:v3'
    ? V3_SPEAKERS.has(speaker)
    : /^[a-z]+_(?:enhi|en|hi|bn|gu|kn|mr|pa|ta|te)_[a-z]+(?:_[a-z]+)*$/.test(
        speaker,
      );
}
export const sttResponseSchema = z.object({
  request_id: z.string().min(1).nullable(),
  transcript: z.string().max(VOICE_LIMITS.transcriptChars),
  language_code: z.string().nullable(),
});
export const ttsResponseSchema = z.object({
  request_id: z.string().min(1).nullable(),
  audios: z
    .array(
      z
        .base64()
        .min(1)
        .max(Math.ceil(VOICE_LIMITS.ttsAudioBytes / 3) * 4),
    )
    .length(1),
});
