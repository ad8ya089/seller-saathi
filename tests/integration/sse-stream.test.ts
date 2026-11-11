import { expect, it } from 'vitest';
import { echoSseResponse } from '@/lib/server/sse';
import { createServer, get } from 'node:http';

it('flushes SSE over real loopback HTTP before the producer completes', async () => {
  let release = (): void => undefined;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = createServer((_request, outgoing) => {
    const response = echoSseResponse(async (emit) => {
      emit({ event: 'transcript', data: { text: 'Loopback input', sttMs: 0 } });
      await paused;
      emit({
        event: 'fallback',
        data: { kind: 'tts', message: 'Loopback tail' },
      });
    }, new AbortController().signal);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    void (async (): Promise<void> => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing SSE body');
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        outgoing.write(chunk.value);
      }
      outgoing.end();
    })().catch(() => outgoing.destroy());
  });
  try {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No loopback port');
    const received: string[] = [];
    let first = (): void => undefined;
    const firstChunk = new Promise<void>((resolve) => {
      first = resolve;
    });
    const completed = new Promise<void>((resolve, reject) => {
      get(`http://127.0.0.1:${String(address.port)}`, (response) => {
        expect(response.headers['content-type']).toContain('text/event-stream');
        response.on('data', (chunk: Buffer) => {
          received.push(chunk.toString());
          first();
        });
        response.on('end', resolve);
        response.on('error', reject);
      }).on('error', reject);
    });
    await firstChunk;
    expect(received.join('')).toContain('event: transcript');
    expect(received.join('')).not.toContain('event: fallback');
    release();
    await completed;
    expect(received.join('').indexOf('event: fallback')).toBeGreaterThan(
      received.join('').indexOf('event: transcript'),
    );
  } finally {
    release();
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

it('delivers an SSE chunk before completion and preserves subsequent event order', async () => {
  let release = (): void => undefined;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const response = echoSseResponse(async (emit) => {
    emit({ event: 'transcript', data: { text: 'Synthetic input', sttMs: 0 } });
    await paused;
    emit({
      event: 'fallback',
      data: { kind: 'tts', message: 'Synthetic fallback' },
    });
  }, new AbortController().signal);
  expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
  expect(response.headers.get('X-Accel-Buffering')).toBe('no');
  expect(response.headers.get('Content-Type')).toContain('text/event-stream');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('SSE body missing');
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain('event: transcript');
  release();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    'event: fallback',
  );
  expect((await reader.read()).done).toBe(true);
});
