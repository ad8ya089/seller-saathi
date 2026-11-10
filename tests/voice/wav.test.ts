import { describe, expect, it } from 'vitest';
import { validateWav } from '@/lib/voice/wav';
import { wavFixture } from './fixtures';

describe('WAV boundaries', () => {
  it('parses mono PCM16 and computes duration from sample bytes', () => {
    expect(validateWav(wavFixture())).toMatchObject({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      durationMs: 100,
      dataBytes: 3200,
    });
  });
  it('walks unknown, odd-sized chunks instead of assuming a fixed header', () => {
    expect(validateWav(wavFixture({ metadata: true })).durationMs).toBe(100);
  });
  it.each(['RIFF', 'WAVE', 'fmt ', 'data'])(
    'rejects a missing %s chunk/signature',
    (marker) => {
      const bytes = wavFixture();
      const index = bytes.indexOf(marker);
      bytes.write('xxxx', index);
      expect(() => validateWav(bytes)).toThrow();
    },
  );
  it('rejects empty, truncated, over-declared and empty-data files', () => {
    expect(() => validateWav(Buffer.alloc(0))).toThrow();
    expect(() => validateWav(wavFixture().subarray(0, 43))).toThrow();
    const bytes = wavFixture();
    bytes.writeUInt32LE(bytes.length + 1, 40);
    expect(() => validateWav(bytes)).toThrow();
    expect(() => validateWav(wavFixture({ durationMs: 0 }))).toThrow();
  });
  it('rejects wrong formats and inconsistent byte rates or alignment', () => {
    for (const [offset, value] of [
      [20, 3],
      [32, 4],
      [34, 8],
    ] as const) {
      const bytes = wavFixture();
      bytes.writeUInt16LE(value, offset);
      expect(() => validateWav(bytes)).toThrow();
    }
    const bytes = wavFixture();
    bytes.writeUInt32LE(1, 28);
    expect(() => validateWav(bytes)).toThrow();
    expect(() => validateWav(wavFixture({ channels: 2 }))).toThrow();
    expect(() => validateWav(wavFixture({ sampleRate: 24000 }))).toThrow();
  });
  it('enforces byte and duration limits and accepts their inclusive boundary', () => {
    expect(validateWav(wavFixture({ durationMs: 28000 })).durationMs).toBe(
      28000,
    );
    expect(() => validateWav(wavFixture({ durationMs: 28001 }))).toThrow(
      /duration/,
    );
    expect(() => validateWav(Buffer.alloc(1048577))).toThrow(/size/);
  });
  it('supports explicitly permitted TTS sample rates without relaxing upload validation', () => {
    expect(
      validateWav(wavFixture({ sampleRate: 24000 }), { sampleRates: [24000] })
        .sampleRate,
    ).toBe(24000);
  });
  it('rejects duplicate format/data chunks and trailing partial chunks', () => {
    const source = wavFixture();
    const duplicate = Buffer.concat([source, source.subarray(12, 36)]);
    duplicate.writeUInt32LE(duplicate.length - 8, 4);
    expect(() => validateWav(duplicate)).toThrow();
    const trailing = Buffer.concat([source, Buffer.from('bad')]);
    trailing.writeUInt32LE(trailing.length - 8, 4);
    expect(() => validateWav(trailing)).toThrow();
  });
});
