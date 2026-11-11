import { describe, expect, it, vi } from 'vitest';
import { runHinglishSmoke } from '@/lib/voice/language-smoke';
import { wavFixture } from './fixtures';
import { AppError } from '@/lib/errors';

describe('bounded Hindi smoke with fake providers', () => {
  it('reuses one synthetic TTS WAV for one STT request and preserves the transcript', async () => {
    const wav = wavFixture({ sampleRate: 24000 });
    const actual =
      'मेरी sale गिर गई है। Supplier late है, stock check करते हैं।';
    const tts = { synthesize: vi.fn().mockResolvedValue({ wav, ms: 2 }) };
    const stt = {
      transcribe: vi.fn().mockResolvedValue({ text: actual, ms: 3 }),
    };
    const result = await runHinglishSmoke(
      { stt, tts },
      'Meri sale gir gayi hai.',
    );
    expect(result.passed).toBe(true);
    expect(result.transcript).toBe(actual);
    expect(tts.synthesize).toHaveBeenCalledExactlyOnceWith(
      'Meri sale gir gayi hai.',
      'hi-IN',
    );
    expect(stt.transcribe).toHaveBeenCalledExactlyOnceWith(wav, 'hi-IN');
  });
  it('records a failed synthesis and never attempts recognition or hidden retries', async () => {
    const stt = { transcribe: vi.fn() };
    const result = await runHinglishSmoke(
      {
        stt,
        tts: {
          synthesize: vi
            .fn()
            .mockRejectedValue(
              new AppError('PROVIDER_UNAVAILABLE', 'private provider body'),
            ),
        },
      },
      'Meri sale gir gayi hai.',
    );
    expect(result.passed).toBe(false);
    expect(result.requests).toEqual([
      { kind: 'tts', ok: false, code: 'PROVIDER_UNAVAILABLE' },
    ]);
    expect(JSON.stringify(result)).not.toContain('private provider body');
    expect(stt.transcribe).not.toHaveBeenCalled();
  });
  it('does not certify speech translated entirely to English as Hindi recognition', async () => {
    const result = await runHinglishSmoke(
      {
        tts: {
          synthesize: vi
            .fn()
            .mockResolvedValue({
              wav: wavFixture({ sampleRate: 24000 }),
              ms: 2,
            }),
        },
        stt: {
          transcribe: vi
            .fn()
            .mockResolvedValue({
              text: 'My sales fell. Please check stock.',
              ms: 3,
            }),
        },
      },
      'Meri sale gir gayi hai.',
    );
    expect(result.passed).toBe(false);
    expect(result.requests).toHaveLength(2);
  });
});
