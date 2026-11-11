import { expect, it } from 'vitest';
import { echoSseResponse } from '@/lib/server/sse';

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
