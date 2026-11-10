import { AppError } from '@/lib/errors';
import { VOICE_LIMITS } from '@/lib/voice/limits';

interface WavOptions {
  maxBytes?: number;
  maxDurationMs?: number;
  sampleRates?: readonly number[];
}
export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationMs: number;
  dataBytes: number;
  dataOffset: number;
}
function invalid(message: string): never {
  throw new AppError('INVALID_AUDIO', message);
}

export function validateWav(
  bytes: Uint8Array,
  options: WavOptions = {},
): WavInfo {
  if (bytes.byteLength > (options.maxBytes ?? VOICE_LIMITS.uploadBytes))
    throw new AppError(
      'UPLOAD_TOO_LARGE',
      'Audio exceeds the maximum file size',
    );
  if (bytes.byteLength < 44) invalid('Audio must be a non-empty PCM WAV file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const marker = (offset: number): string =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (marker(0) !== 'RIFF' || marker(8) !== 'WAVE')
    invalid('Audio must have RIFF and WAVE signatures');
  if (view.getUint32(4, true) + 8 !== bytes.byteLength)
    invalid('WAV length is inconsistent or truncated');
  let format:
    | {
        sampleRate: number;
        channels: number;
        bitsPerSample: number;
        blockAlign: number;
      }
    | undefined;
  let data: { size: number; offset: number } | undefined;
  let offset = 12;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength)
      invalid('WAV contains a truncated chunk header');
    const id = marker(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const next = start + size + (size % 2);
    if (next > bytes.byteLength) invalid('WAV contains a truncated chunk');
    if (id === 'fmt ') {
      if (format || size < 16)
        invalid('WAV must contain one complete format chunk');
      const codec = view.getUint16(start, true);
      const channels = view.getUint16(start + 2, true);
      const sampleRate = view.getUint32(start + 4, true);
      const byteRate = view.getUint32(start + 8, true);
      const blockAlign = view.getUint16(start + 12, true);
      const bitsPerSample = view.getUint16(start + 14, true);
      if (
        codec !== 1 ||
        channels !== 1 ||
        bitsPerSample !== 16 ||
        blockAlign !== channels * 2 ||
        byteRate !== sampleRate * blockAlign
      )
        invalid(
          'Audio must be mono PCM16 with consistent byte rate and alignment',
        );
      if (
        !(options.sampleRates ?? [VOICE_LIMITS.inputSampleRate]).includes(
          sampleRate,
        )
      )
        invalid('Audio has an unsupported sample rate');
      format = { sampleRate, channels, bitsPerSample, blockAlign };
    } else if (id === 'data') {
      if (data || size === 0)
        invalid('WAV must contain one non-empty audio data chunk');
      data = { size, offset: start };
    }
    offset = next;
  }
  if (!format || !data || data.size % format.blockAlign !== 0)
    invalid('WAV format or audio data is missing or malformed');
  const durationMs =
    (data.size / (format.sampleRate * format.blockAlign)) * 1000;
  if (
    durationMs <= 0 ||
    durationMs > (options.maxDurationMs ?? VOICE_LIMITS.utteranceMs)
  )
    invalid('Audio recording duration exceeds the supported limit');
  return {
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitsPerSample: format.bitsPerSample,
    durationMs,
    dataBytes: data.size,
    dataOffset: data.offset,
  };
}
