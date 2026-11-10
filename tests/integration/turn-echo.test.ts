import { describe, expect, it, vi } from 'vitest';
import { createEchoHandler } from '@/lib/server/echo-turn';
import { FakeStt, FakeTts } from '@/lib/voice/fakes';
import { echoEventSchema } from '@/lib/voice/events';
import type { EchoEvent } from '@/lib/voice/events';
import { AppError } from '@/lib/errors';
import { SarvamStt } from '@/lib/voice/sarvam-stt';
import { SarvamTts } from '@/lib/voice/sarvam-tts';
import { parseConfig } from '@/lib/server/config';
import { wavFixture } from '../voice/fixtures';

function textRequest(
  text = 'Please check my stock.',
  signal?: AbortSignal,
): Request {
  return new Request('http://localhost/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'call-test', text }),
    ...(signal ? { signal } : {}),
  });
}
function audioRequest(audio = wavFixture()): Request {
  const body = new FormData();
  body.set('sessionId', 'call-test');
  body.set(
    'audio',
    new Blob([new Uint8Array(audio)], { type: 'audio/wav' }),
    'input.wav',
  );
  return new Request('http://localhost/api/turn', { method: 'POST', body });
}
function events(text: string): EchoEvent[] {
  return text
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      const name = frame
        .split('\n')
        .find((line) => line.startsWith('event: '))
        ?.slice(7);
      const raw = frame
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6);
      const data: unknown = JSON.parse(raw ?? 'null');
      return echoEventSchema.parse({ event: name, data });
    });
}
function setup(
  stt = new FakeStt(),
  tts = new FakeTts(wavFixture({ sampleRate: 24000 })),
): {
  stt: FakeStt;
  tts: FakeTts;
  handler: (request: Request) => Promise<Response>;
} {
  return { stt, tts, handler: createEchoHandler({ providers: { stt, tts } }) };
}

describe('streaming voice echo API', () => {
  it('transcribes audio and produces the documented incremental SSE contract', async () => {
    const { handler, stt, tts } = setup();
    const response = await handler(audioRequest());
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe(
      'no-cache, no-transform',
    );
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    const result = events(await response.text());
    expect(result.map((event) => event.event)).toEqual([
      'transcript',
      'sentence',
      'audio',
      'done',
    ]);
    expect(result[0]).toMatchObject({
      data: { text: 'Please check my stock.', sttMs: 3 },
    });
    expect(tts.calls[0]?.text).toBe('You said: Please check my stock.');
    expect(stt.calls).toHaveLength(1);
    expect(result.at(-1)).toMatchObject({
      data: { turn: 1, timings: { sttMs: 3, ttsFirstMs: 2 } },
    });
  });
  it('skips STT for text and keeps sentence/audio pairs indexed in order', async () => {
    const { handler, stt, tts } = setup();
    const result = events(
      await (
        await handler(
          textRequest(
            'The first stock update has arrived. The second stock update is ready.',
          ),
        )
      ).text(),
    );
    expect(stt.calls).toHaveLength(0);
    expect(tts.calls).toHaveLength(2);
    expect(result.map((event) => event.event)).toEqual([
      'transcript',
      'sentence',
      'audio',
      'sentence',
      'audio',
      'done',
    ]);
    expect(
      result
        .filter((event) => event.event === 'audio')
        .map((event) => event.data.idx),
    ).toEqual([0, 1]);
    expect(result[0]).toMatchObject({ data: { sttMs: 0 } });
  });
  it('emits transcript and sentence before TTS completes, and orders out-of-order TTS results', async () => {
    let releaseFirst: () => void = () => undefined;
    let secondDone: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      secondDone = resolve;
    });
    const tts = new FakeTts(wavFixture({ sampleRate: 24000 }), {
      before: (index): Promise<void> =>
        index === 0 ? firstGate : (secondDone(), Promise.resolve()),
    });
    const { handler } = setup(new FakeStt(), tts);
    const response = await handler(
      textRequest(
        'The first stock update has arrived. The second stock update is ready.',
      ),
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing SSE stream');
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain(
      'event: transcript',
    );
    expect(decoder.decode((await reader.read()).value)).toContain(
      'event: sentence',
    );
    let audioArrived = false;
    const next = reader.read().then((result) => {
      audioArrived = true;
      return result;
    });
    await second;
    expect(audioArrived).toBe(false);
    expect(tts.calls).toHaveLength(2);
    releaseFirst();
    expect(events(decoder.decode((await next).value))[0]).toMatchObject({
      event: 'audio',
      data: { idx: 0 },
    });
    let tail = '';
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      tail += decoder.decode(result.value);
    }
    expect(
      events(tail)
        .filter((event) => event.event === 'audio')
        .map((event) => event.data.idx),
    ).toEqual([1]);
  });
  it('rejects invalid or oversized WAV before calling STT', async () => {
    const { handler, stt } = setup();
    expect((await handler(audioRequest(Buffer.from('not a WAV')))).status).toBe(
      400,
    );
    expect((await handler(audioRequest(Buffer.alloc(1048577)))).status).toBe(
      413,
    );
    expect(stt.calls).toHaveLength(0);
  });
  it('rejects oversized JSON, invalid identifiers, extra fields and unsupported input', async () => {
    const { handler, stt, tts } = setup();
    expect((await handler(textRequest('x'.repeat(1001)))).status).toBe(400);
    for (const body of [
      { sessionId: '', text: 'hello' },
      { sessionId: 'call', text: 'hello', apiKey: 'not-allowed' },
    ]) {
      const response = await handler(
        new Request('http://localhost/api/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(
      (
        await handler(
          new Request('http://localhost/api/turn', {
            method: 'POST',
            body: 'invalid',
          }),
        )
      ).status,
    ).toBe(400);
    expect(stt.calls).toHaveLength(0);
    expect(tts.calls).toHaveLength(0);
  });
  it('limits actual streamed request bytes without trusting Content-Length or MIME', async () => {
    const { handler, stt } = setup();
    const body = new FormData();
    body.set('sessionId', 'call');
    body.set(
      'audio',
      new Blob([new Uint8Array(2_000_000)], { type: 'audio/wav' }),
    );
    expect(
      (
        await handler(
          new Request('http://localhost/api/turn', { method: 'POST', body }),
        )
      ).status,
    ).toBe(413);
    expect(stt.calls).toHaveLength(0);
  });
  it.each(['PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE'] as const)(
    'sanitizes %s into an SSE error event',
    async (code) => {
      const stt = new FakeStt({
        error: new AppError(code, 'private-provider-body-and-key', true),
      });
      const response = await setup(stt).handler(audioRequest());
      const text = await response.text();
      const failureEvents = events(text);
      expect(failureEvents).toHaveLength(1);
      expect(failureEvents[0]).toMatchObject({
        event: 'error',
        data: { code, retryable: true },
      });
      expect(text).not.toContain('private-provider');
    },
  );
  it('contains unexpected errors and invalid upstream audio without exposing internal details', async () => {
    const errorResponse = await setup(
      new FakeStt({ error: new Error('private-stack-text') }),
    ).handler(audioRequest());
    expect(await errorResponse.text()).not.toContain('private-stack-text');
    const badTts = await setup(
      new FakeStt(),
      new FakeTts(Buffer.from('not WAV')),
    ).handler(textRequest());
    expect(
      events(await badTts.text()).some(
        (event) =>
          event.event === 'error' &&
          event.data.code === 'PROVIDER_RESPONSE_INVALID',
      ),
    ).toBe(true);
  });
  it('handles missing credentials as an SSE error without a network call or crash', async () => {
    const sarvam = parseConfig({}).sarvam;
    const fetcher = vi.fn<typeof fetch>();
    const providers = {
      stt: new SarvamStt({ ...sarvam, ...sarvam.stt }, fetcher),
      tts: new SarvamTts({ ...sarvam, ...sarvam.tts }, fetcher),
    };
    const result = events(
      await (await createEchoHandler({ providers })(textRequest())).text(),
    );
    expect(result.at(-1)).toMatchObject({
      event: 'error',
      data: { code: 'PROVIDER_CONFIG' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels provider work when the client disconnects', async () => {
    const tts = new FakeTts(wavFixture({ sampleRate: 24000 }), {
      before: (): Promise<void> => new Promise(() => undefined),
    });
    const response = await setup(new FakeStt(), tts).handler(textRequest());
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing stream');
    await reader.read();
    await reader.read();
    await reader.cancel();
    await Promise.resolve();
    expect(tts.aborted).toBeGreaterThan(0);
  });
  it('rejects cross-origin requests before calling providers', async () => {
    const { handler, stt, tts } = setup();
    const request = textRequest();
    request.headers.set('Origin', 'https://other.example');
    expect((await handler(request)).status).toBe(400);
    expect(stt.calls).toHaveLength(0);
    expect(tts.calls).toHaveLength(0);
  });
  it('accepts the browser Host when Next exposes an internal localhost request URL', async () => {
    const { handler } = setup();
    const request = textRequest();
    request.headers.set('Host', '127.0.0.1:4101');
    request.headers.set('Origin', 'http://127.0.0.1:4101');
    expect((await handler(request)).status).toBe(200);
  });
  it.each(['http://other.example', 'http://localhost:4101', 'null'])(
    'rejects Origin %s when the browser Host differs from the internal URL',
    async (origin) => {
      const { handler, tts } = setup();
      const request = textRequest();
      request.headers.set('Host', '127.0.0.1:4101');
      request.headers.set('Origin', origin);
      expect((await handler(request)).status).toBe(400);
      expect(tts.calls).toHaveLength(0);
    },
  );
});
