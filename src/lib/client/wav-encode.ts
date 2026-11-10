import { encodeWAV } from '@ricky0123/vad-web/dist/utils';
import { AppError } from '@/lib/errors';
import { VOICE_LIMITS } from '@/lib/voice/limits';

export function encodeMicrophoneWav(audio: Float32Array): ArrayBuffer {
  const maxSamples =
    (VOICE_LIMITS.inputSampleRate * VOICE_LIMITS.utteranceMs) / 1000;
  if (
    audio.length === 0 ||
    audio.length > maxSamples ||
    audio.some((sample) => !Number.isFinite(sample))
  )
    throw new AppError(
      'INVALID_AUDIO',
      'Please record a short, clear message within twenty-eight seconds',
    );
  return encodeWAV(audio, 1, VOICE_LIMITS.inputSampleRate, 1, 16);
}
