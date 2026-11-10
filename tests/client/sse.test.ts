import { describe, expect, it, vi } from 'vitest';
import { SseParser, postEchoTurn } from '@/lib/client/sse';
import { wavFixture } from '../voice/fixtures';

const frame = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const transcript = frame('transcript', { text: 'नमस्ते stock', sttMs: 0 });
const sentence = frame('sentence', { idx: 0, text: 'You said: नमस्ते stock' });
const audio = frame('audio', {
  idx: 0,
  mime: 'audio/wav',
  b64: wavFixture({ sampleRate: 24000 }).toString('base64'),
});
const done = frame('done', {
  timings: { sttMs: 0, ttsFirstMs: 2, totalMs: 4 },
  turn: 1,
});

describe('incremental SSE parser', () => {
  it.each(['\n', '\r\n'])(
    'parses arbitrarily split frames using %j delimiters',
    (newline) => {
      const parser = new SseParser();
      const text = (transcript + done).replaceAll('\n', newline);
      const result = text
        .split(/(?=.)/u)
        .flatMap((character) => parser.push(character));
      expect(result.map((event) => event.event)).toEqual([
        'transcript',
        'done',
      ]);
      expect(parser.flush()).toEqual([]);
    },
  );
  it('handles comments, multiple data lines and multiple events per chunk', () => {
    const parser = new SseParser();
    expect(
      parser.push(
        ':keepalive\n\nevent: transcript\ndata: {"text":"hello",\ndata: "sttMs":0}\n\n' +
          done,
      ),
    ).toHaveLength(2);
  });
  it('accepts a complete final frame and rejects malformed or unknown frames safely', () => {
    const parser = new SseParser();
    parser.push(done.trimEnd());
    expect(parser.flush()[0]?.event).toBe('done');
    expect(() =>
      new SseParser().push('event: audio\ndata: bad-json\n\n'),
    ).toThrow(/stream/i);
    expect(() => new SseParser().push('event: unknown\ndata: {}\n\n')).toThrow(
      /stream/i,
    );
    expect(new SseParser().push(':comment\n\n')).toEqual([]);
  });
});

describe('POST SSE transport', () => {
  it('accepts state/activity and explicit TTS fallback without accepting arbitrary skipped audio indexes', async () => {
    const source =
      transcript +
      frame('tool', {
        name: 'get_seller_snapshot',
        label: 'Checking your numbers.',
      }) +
      frame('state', {
        phase: 'investigate',
        questionsAsked: 1,
        hypotheses: [],
        facts: [],
      }) +
      sentence +
      frame('fallback', { kind: 'tts', message: 'Use browser voice.' }) +
      done;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(source, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const seen: string[] = [];
    await postEchoTurn(
      {
        kind: 'text',
        sessionId: 'call',
        text: 'hello',
        turnId: '11111111-1111-4111-8111-111111111111',
      },
      (event): void => {
        seen.push(event.event);
      },
      new AbortController().signal,
      fetcher,
    );
    expect(seen).toEqual([
      'transcript',
      'tool',
      'state',
      'sentence',
      'fallback',
      'done',
    ]);
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain(
      '11111111-1111-4111-8111-111111111111',
    );
  });
  it('uses POST, preserves UTF-8 across byte chunks and dispatches events incrementally', async () => {
    const bytes = new TextEncoder().encode(
      transcript + sentence + audio + done,
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller): void {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const seen: string[] = [];
    await postEchoTurn(
      { kind: 'text', sessionId: 'call', text: 'hello' },
      (event): void => {
        seen.push(event.event);
      },
      new AbortController().signal,
      fetcher,
    );
    expect(seen).toEqual(['transcript', 'sentence', 'audio', 'done']);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/turn');
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('POST');
  });
  it('surfaces HTTP and SSE errors without using an HTML/proxy body as a message', async () => {
    const signal = new AbortController().signal;
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private-proxy-body', { status: 503 }));
    await expect(
      postEchoTurn(
        { kind: 'text', sessionId: 'call', text: 'hello' },
        (): void => undefined,
        signal,
        http,
      ),
    ).rejects.not.toThrow(/private-proxy/);
    const sse = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        frame('error', {
          code: 'PROVIDER_TIMEOUT',
          message: 'Please retry.',
          retryable: true,
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    await expect(
      postEchoTurn(
        { kind: 'text', sessionId: 'call', text: 'hello' },
        (): void => undefined,
        signal,
        sse,
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      message: 'Please retry.',
    });
  });
  it('rejects an incomplete stream and out-of-order audio before playback', async () => {
    for (const text of [
      transcript,
      transcript +
        sentence +
        frame('audio', {
          idx: 1,
          mime: 'audio/wav',
          b64: wavFixture().toString('base64'),
        }) +
        done,
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(text, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );
      await expect(
        postEchoTurn(
          { kind: 'text', sessionId: 'call', text: 'hello' },
          (): void => undefined,
          new AbortController().signal,
          fetcher,
        ),
      ).rejects.toMatchObject({ code: 'STREAM_INVALID' });
    }
  });
  it('cancels a stalled reader when aborted', async () => {
    let cancelCalled = false;
    const abort = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      cancel(): void {
        cancelCalled = true;
      },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const result = postEchoTurn(
      { kind: 'text', sessionId: 'call', text: 'hello' },
      (): void => undefined,
      abort.signal,
      fetcher,
    );
    const failure = expect(result).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
    });
    await Promise.resolve();
    await Promise.resolve();
    abort.abort();
    await failure;
    expect(cancelCalled).toBe(true);
  });
});
