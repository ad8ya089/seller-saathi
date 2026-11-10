import { AppError } from '@/lib/errors';
import { abortable, throwIfAborted } from '@/lib/voice/abort';
import {
  publicErrorSchema,
  sessionIdSchema,
  textTurnSchema,
} from '@/lib/voice/events';
import type { EchoEvent } from '@/lib/voice/events';
import { SseParser } from '@/lib/client/sse-parser';
export { SseParser } from '@/lib/client/sse-parser';

export type EchoSubmission =
  | { kind: 'text'; sessionId: string; text: string; turnId?: string }
  | { kind: 'audio'; sessionId: string; wav: ArrayBuffer; turnId?: string };
type EventHandler = (event: EchoEvent) => void | Promise<void>;

export async function httpError(response: Response): Promise<AppError> {
  try {
    const body: unknown = await response.json();
    const parsed = publicErrorSchema.safeParse(body);
    if (parsed.success)
      return new AppError(
        parsed.data.code,
        parsed.data.message,
        parsed.data.retryable,
      );
  } catch {
    /* Proxy responses may not be JSON. Never expose their body. */
  }
  return new AppError(
    'PROVIDER_UNAVAILABLE',
    `Voice request failed (HTTP ${String(response.status)}). Please try again.`,
    response.status === 429 || response.status >= 500,
  );
}

export async function postEchoTurn(
  input: EchoSubmission,
  onEvent: EventHandler,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  throwIfAborted(signal);
  let body: BodyInit;
  const headers = new Headers();
  if (input.kind === 'text') {
    const value = textTurnSchema.safeParse({
      sessionId: input.sessionId,
      text: input.text,
      ...(input.turnId ? { turnId: input.turnId } : {}),
    });
    if (!value.success)
      throw new AppError('INVALID_INPUT', 'Please enter a short message');
    body = JSON.stringify(value.data);
    headers.set('Content-Type', 'application/json');
  } else {
    if (!sessionIdSchema.safeParse(input.sessionId).success)
      throw new AppError('INVALID_INPUT', 'Start a new call before recording');
    const form = new FormData();
    form.set('sessionId', input.sessionId);
    if (input.turnId) form.set('turnId', input.turnId);
    form.set(
      'audio',
      new Blob([input.wav], { type: 'audio/wav' }),
      'utterance.wav',
    );
    body = form;
  }
  const response = await abortable(
    fetcher('/api/turn', {
      method: 'POST',
      body,
      headers,
      signal,
      credentials: 'same-origin',
      mode: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    }),
    signal,
  );
  if (!response.ok) throw await httpError(response);
  if (
    !response.headers
      .get('Content-Type')
      ?.toLowerCase()
      .startsWith('text/event-stream') ||
    !response.body
  )
    throw new AppError(
      'STREAM_INVALID',
      'The server did not return a voice event stream',
    );
  const reader = response.body.getReader();
  const parser = new SseParser();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let terminal = false;
  let transcriptSeen = false;
  let sentences = 0;
  let audios = 0;
  const dispatch = async (event: EchoEvent): Promise<boolean> => {
    if (terminal)
      throw new AppError(
        'STREAM_INVALID',
        'The voice stream continued after completion',
      );
    if (event.event === 'transcript') {
      if (transcriptSeen)
        throw new AppError(
          'STREAM_INVALID',
          'The voice stream repeated its transcript',
        );
      transcriptSeen = true;
    } else if (event.event === 'sentence') {
      if (!transcriptSeen || event.data.idx !== sentences)
        throw new AppError(
          'STREAM_INVALID',
          'Voice sentences arrived out of order',
        );
      sentences += 1;
    } else if (event.event === 'audio') {
      if (event.data.idx !== audios || audios >= sentences)
        throw new AppError(
          'STREAM_INVALID',
          'Voice audio arrived out of order',
        );
      audios += 1;
    } else if (event.event === 'fallback' && event.data.kind === 'tts') {
      if (!transcriptSeen || audios >= sentences)
        throw new AppError(
          'STREAM_INVALID',
          'Voice fallback arrived without a sentence',
        );
      audios += 1;
    } else if (event.event === 'done') {
      if (!transcriptSeen || audios !== sentences || audios === 0)
        throw new AppError(
          'STREAM_INVALID',
          'The voice stream ended before its audio was complete',
        );
    }
    await onEvent(event);
    if (event.event === 'error')
      throw new AppError(
        event.data.code,
        event.data.message,
        event.data.retryable,
      );
    return event.event === 'done';
  };
  try {
    for (;;) {
      const result = await abortable(reader.read(), signal);
      if (result.done) {
        for (const event of [
          ...parser.push(decoder.decode()),
          ...parser.flush(),
        ])
          terminal = (await dispatch(event)) || terminal;
        break;
      }
      for (const event of parser.push(
        decoder.decode(result.value, { stream: true }),
      ))
        terminal = (await dispatch(event)) || terminal;
      if (terminal) break;
    }
    if (!terminal)
      throw new AppError(
        'STREAM_INVALID',
        'The voice connection ended early. Please try again.',
      );
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
