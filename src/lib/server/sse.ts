import 'server-only';
import { echoEventSchema } from '@/lib/voice/events';
import type { EmitEchoEvent } from '@/lib/voice/events';
import { publicVoiceError } from '@/lib/server/voice-errors';

type Runner = (emit: EmitEchoEvent, signal: AbortSignal) => Promise<void>;

export function echoSseResponse(
  run: Runner,
  requestSignal: AbortSignal,
): Response {
  const abort = new AbortController();
  let closed = false;
  const encoder = new TextEncoder();
  const cancel = (): void => {
    abort.abort();
  };
  requestSignal.addEventListener('abort', cancel, { once: true });
  if (requestSignal.aborted) cancel();
  const stream = new ReadableStream<Uint8Array>({
    start(controller): void {
      const emit: EmitEchoEvent = (event): void => {
        if (closed || abort.signal.aborted) return;
        const parsed = echoEventSchema.parse(event);
        controller.enqueue(
          encoder.encode(
            `event: ${parsed.event}\ndata: ${JSON.stringify(parsed.data)}\n\n`,
          ),
        );
      };
      const execute = async (): Promise<void> => {
        try {
          await run(emit, abort.signal);
        } catch (error: unknown) {
          emit({ event: 'error', data: publicVoiceError(error) });
        } finally {
          abort.abort();
          requestSignal.removeEventListener('abort', cancel);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      };
      void execute().catch(() => {
        abort.abort();
      });
    },
    cancel(): void {
      closed = true;
      cancel();
      requestSignal.removeEventListener('abort', cancel);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
