export const VOICE_LIMITS = {
  uploadBytes: 1_048_576,
  utteranceMs: 28_000,
  inputSampleRate: 16_000,
  outputSampleRate: 24_000,
  textChars: 1_000,
  transcriptChars: 8_000,
  ttsTextChars: 2_500,
  ttsAudioBytes: 6_000_000,
  multipartOverheadBytes: 16_384,
} as const;
