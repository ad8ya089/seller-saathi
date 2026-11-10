import type { RealTimeVADOptions } from '@ricky0123/vad-web';
import { VOICE_LIMITS } from '@/lib/voice/limits';

export const VAD_SETTINGS = {
  model: 'v6',
  baseAssetPath: '/vad/',
  onnxWASMBasePath: '/vad/',
  positiveSpeechThreshold: 0.5,
  negativeSpeechThreshold: 0.35,
  minSpeechMs: 250,
  preSpeechPadMs: 300,
  redemptionMs: 700,
  startOnLoad: false,
  submitUserSpeechOnPause: false,
} satisfies Partial<RealTimeVADOptions>;
export const CALL_SETTINGS = {
  echoTailMs: 200,
  maxCaptureMs: VOICE_LIMITS.utteranceMs - VAD_SETTINGS.preSpeechPadMs - 64,
} as const;
