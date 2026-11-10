import { describe, expect, it } from 'vitest';
import { encodeMicrophoneWav } from '@/lib/client/wav-encode';
import { validateWav } from '@/lib/voice/wav';

describe('microphone WAV encoding', () => {
  it('uses the installed VAD PCM16 encoder at sixteen kilohertz', () => {
    const buffer = encodeMicrophoneWav(new Float32Array([-2, -1, 0, 1, 2]));
    const info = validateWav(new Uint8Array(buffer));
    expect(info).toMatchObject({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      dataBytes: 10,
    });
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(52, true)).toBe(32767);
  });
  it('rejects empty, non-finite and overlong captures before allocating a WAV', () => {
    expect(() => encodeMicrophoneWav(new Float32Array())).toThrow();
    expect(() => encodeMicrophoneWav(new Float32Array([NaN]))).toThrow();
    expect(() =>
      encodeMicrophoneWav(new Float32Array(16000 * 28 + 1)),
    ).toThrow();
  });
});
