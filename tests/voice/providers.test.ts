import { afterEach, describe, expect, it, vi } from 'vitest';
import { SarvamStt } from '@/lib/voice/sarvam-stt';
import { SarvamTts } from '@/lib/voice/sarvam-tts';
import { parseConfig } from '@/lib/server/config';
import { wavFixture } from './fixtures';

const settings = { apiKey: 'provider-test-key', timeoutMs: 6000, retries: 1 };
const sttSettings = {
  ...settings,
  model: 'saaras:v4',
  mode: 'transcribe',
} as const;
const ttsSettings = {
  ...settings,
  model: 'bulbul:v4-flash',
  speaker: 'shubh_enhi_ads',
  pace: 1,
  sampleRate: 24000,
} as const;
const transcript = {
  request_id: 'request-test',
  transcript: 'Please check my stock.',
  language_code: 'en-IN',
};
function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, ...(headers ? { headers } : {}) });
}
function ttsResponse(): Response {
  return json({
    request_id: 'request-tts',
    audios: [wavFixture({ sampleRate: 24000 }).toString('base64')],
  });
}
afterEach(() => {
  vi.useRealTimers();
});

describe('Sarvam contracts with fake HTTP', () => {
  it('sends the documented multipart STT contract with a Node Blob', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(transcript));
    const result = await new SarvamStt(sttSettings, fetcher).transcribe(
      wavFixture(),
      'en-IN',
    );
    expect(result.text).toBe(transcript.transcript);
    expect(result.ms).toBeGreaterThanOrEqual(0);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.sarvam.ai/speech-to-text');
    expect(new Headers(init?.headers).get('api-subscription-key')).toBe(
      'provider-test-key',
    );
    const form = init?.body;
    if (!(form instanceof FormData)) throw new Error('Expected multipart form');
    expect(form.get('model')).toBe('saaras:v4');
    expect(form.get('mode')).toBe('transcribe');
    expect(form.get('language_code')).toBe('en-IN');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });
  it('sends WAV output, language_code and a compatible v4 speaker in TTS JSON', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ttsResponse());
    const result = await new SarvamTts(ttsSettings, fetcher).synthesize(
      'Hello there.',
      'en-IN',
    );
    expect(result.wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(result.ms).toBeGreaterThanOrEqual(0);
    const body = fetcher.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string') throw new Error('Expected JSON request body');
    const value: unknown = JSON.parse(body);
    expect(value).toEqual({
      text: 'Hello there.',
      model: 'bulbul:v4-flash',
      speaker: 'shubh_enhi_ads',
      pace: 1,
      speech_sample_rate: 24000,
      language_code: 'en-IN',
      output_audio_codec: 'wav',
    });
  });
  it('permits v3 explicitly without mixing speaker formats', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ttsResponse());
    await new SarvamTts(
      { ...ttsSettings, model: 'bulbul:v3', speaker: 'priya' },
      fetcher,
    ).synthesize('Hello there.', 'en-IN');
    await expect(
      new SarvamTts({ ...ttsSettings, speaker: 'priya' }, fetcher).synthesize(
        'Hello.',
        'en-IN',
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_CONFIG' });
    await expect(
      new SarvamTts({ ...ttsSettings, model: 'bulbul:v3' }, fetcher).synthesize(
        'Hello.',
        'en-IN',
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_CONFIG' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reports missing credentials only when a live operation is attempted', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const stt = new SarvamStt({ ...sttSettings, apiKey: undefined }, fetcher);
    await expect(stt.transcribe(wavFixture(), 'en-IN')).rejects.toMatchObject({
      code: 'PROVIDER_CONFIG',
      retryable: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 422])(
    'does not retry HTTP %s or expose response bodies',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ detail: 'private-provider-body' }, status));
      const promise = new SarvamStt(sttSettings, fetcher).transcribe(
        wavFixture(),
        'en-IN',
      );
      await expect(promise).rejects.toMatchObject({ retryable: false });
      await expect(promise).rejects.not.toThrow(
        /private-provider-body|provider-test-key/,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([429, 500, 503])(
    'retries HTTP %s once within a bounded deadline',
    async (status) => {
      vi.useFakeTimers();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({}, status, { 'Retry-After': '0.05' }))
        .mockResolvedValueOnce(json(transcript));
      const promise = new SarvamStt(sttSettings, fetcher).transcribe(
        wavFixture(),
        'en-IN',
      );
      await vi.advanceTimersByTimeAsync(49);
      expect(fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await promise).text).toBe(transcript.transcript);
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it('does not exceed the retry bound or wait for an excessive Retry-After', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, 503));
    const failure = expect(
      new SarvamStt(sttSettings, fetcher).transcribe(wavFixture(), 'en-IN'),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true });
    await vi.advanceTimersByTimeAsync(1000);
    await failure;
    expect(fetcher).toHaveBeenCalledTimes(2);
    const rateLimited = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({}, 429, { 'Retry-After': '600' }));
    await expect(
      new SarvamStt(sttSettings, rateLimited).transcribe(wavFixture(), 'en-IN'),
    ).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT' });
    expect(rateLimited).toHaveBeenCalledTimes(1);
  });
  it('times out stalled requests and clears timers', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const failure = expect(
      new SarvamStt(sttSettings, fetcher).transcribe(wavFixture(), 'en-IN'),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', retryable: true });
    await vi.advanceTimersByTimeAsync(6000);
    await failure;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates cancellation and does not leave rejected background promises', async () => {
    const abort = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const failure = expect(
      new SarvamStt(sttSettings, fetcher).transcribe(
        wavFixture(),
        'en-IN',
        abort.signal,
      ),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    abort.abort();
    await failure;
  });
  it('validates provider JSON and treats empty STT as a controlled no-speech result', async () => {
    await expect(
      new SarvamStt(
        sttSettings,
        vi.fn<typeof fetch>().mockResolvedValue(json({ transcript: 4 })),
      ).transcribe(wavFixture(), 'en-IN'),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    await expect(
      new SarvamStt(
        sttSettings,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(json({ ...transcript, transcript: ' ' })),
      ).transcribe(wavFixture(), 'en-IN'),
    ).rejects.toMatchObject({ code: 'NO_SPEECH' });
  });
  it.each([
    { audios: [] },
    { audios: ['bad base64'] },
    { audios: [Buffer.from('not WAV').toString('base64')] },
    { audios: ['AAAA', 'AAAA'] },
  ])('rejects unusable or ambiguous TTS audio %j', async ({ audios }) => {
    await expect(
      new SarvamTts(
        ttsSettings,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(json({ request_id: null, audios })),
      ).synthesize('Hello.', 'en-IN'),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });
  it('validates text and language before making paid calls', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const tts = new SarvamTts(ttsSettings, fetcher);
    await expect(tts.synthesize(' ', 'en-IN')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(
      tts.synthesize('Hello.', 'invalid-language'),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('provider configuration', () => {
  it('uses documented v4 defaults and model-specific default speakers', () => {
    const config = parseConfig({});
    expect(config.sarvam.stt).toMatchObject({
      model: 'saaras:v4',
      mode: 'transcribe',
    });
    expect(config.sarvam.tts).toMatchObject({
      model: 'bulbul:v4-flash',
      speaker: 'shubh_enhi_ads',
    });
    expect(
      parseConfig({ SARVAM_TTS_MODEL: 'bulbul:v3' }).sarvam.tts.speaker,
    ).toBe('priya');
    expect(() =>
      parseConfig({
        SARVAM_TTS_MODEL: 'bulbul:v4-flash',
        SARVAM_TTS_SPEAKER: 'priya',
      }),
    ).toThrow(/SARVAM_TTS_SPEAKER/);
  });
});
