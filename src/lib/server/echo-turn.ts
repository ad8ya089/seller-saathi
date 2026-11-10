import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { SentenceChunker } from '@/lib/agent/chunker';
import { parseEchoInput } from '@/lib/server/turn-input';
import type { EchoInput } from '@/lib/server/turn-input';
import { echoSseResponse } from '@/lib/server/sse';
import { publicVoiceError } from '@/lib/server/voice-errors';
import type { EchoTimings } from '@/lib/voice/events';
import { throwIfAborted } from '@/lib/voice/abort';
import { VOICE_LIMITS } from '@/lib/voice/limits';
import type { TtsResult, VoiceProviders } from '@/lib/voice/providers';
import { validateWav } from '@/lib/voice/wav';

interface EchoOptions {
  providers: VoiceProviders;
  maxAudioBytes?: number;
  maxUtteranceMs?: number;
  sttLanguage?: string;
  ttsLanguage?: string;
  onMetrics?: (entry: { sessionId: string; timings: EchoTimings }) => void;
}
type TtsOutcome =
  { ok: true; result: TtsResult } | { ok: false; error: unknown };
const transcriptSchema = z.strictObject({
  text: z.string().trim().min(1).max(VOICE_LIMITS.transcriptChars),
  ms: z.number().nonnegative(),
});

export function createEchoHandler(
  options: EchoOptions,
): (request: Request) => Promise<Response> {
  return async (request): Promise<Response> => {
    const started = performance.now();
    let input: EchoInput;
    try {
      input = await parseEchoInput(request, {
        maxBytes: Math.min(
          options.maxAudioBytes ?? VOICE_LIMITS.uploadBytes,
          VOICE_LIMITS.uploadBytes,
        ),
        maxDurationMs: Math.min(
          options.maxUtteranceMs ?? VOICE_LIMITS.utteranceMs,
          VOICE_LIMITS.utteranceMs,
        ),
      });
    } catch (error: unknown) {
      const data = publicVoiceError(error);
      return Response.json(data, {
        status: data.code === 'UPLOAD_TOO_LARGE' ? 413 : 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return echoSseResponse(async (emit, signal): Promise<void> => {
      throwIfAborted(signal);
      const transcript = transcriptSchema.parse(
        input.kind === 'text'
          ? { text: input.text, ms: 0 }
          : await options.providers.stt.transcribe(
              input.wav,
              options.sttLanguage ?? 'unknown',
              signal,
            ),
      );
      emit({
        event: 'transcript',
        data: { text: transcript.text, sttMs: transcript.ms },
      });
      const chunker = new SentenceChunker();
      const chunks = [
        ...chunker.push(`You said: ${transcript.text}`),
        ...chunker.flush(),
      ];
      const pending = new Map<number, Promise<TtsOutcome>>();
      const queue = (idx: number): void => {
        const text = chunks[idx];
        if (text === undefined) return;
        pending.set(
          idx,
          options.providers.tts
            .synthesize(text, options.ttsLanguage ?? 'en-IN', signal)
            .then(
              (result): TtsOutcome => ({ ok: true, result }),
              (error: unknown): TtsOutcome => ({ ok: false, error }),
            ),
        );
      };
      queue(0);
      queue(1);
      let ttsFirstMs = 0;
      for (const [idx, text] of chunks.entries()) {
        throwIfAborted(signal);
        emit({ event: 'sentence', data: { idx, text } });
        const outcome = await pending.get(idx);
        pending.delete(idx);
        if (!outcome)
          throw new AppError('INTERNAL', 'Speech synthesis was not queued');
        if (!outcome.ok) throw outcome.error;
        throwIfAborted(signal);
        try {
          validateWav(outcome.result.wav, {
            sampleRates: [VOICE_LIMITS.outputSampleRate],
            maxBytes: VOICE_LIMITS.ttsAudioBytes,
            maxDurationMs: 120000,
          });
        } catch {
          throw new AppError(
            'PROVIDER_RESPONSE_INVALID',
            'Speech provider returned invalid WAV audio',
          );
        }
        if (idx === 0) ttsFirstMs = outcome.result.ms;
        emit({
          event: 'audio',
          data: {
            idx,
            mime: 'audio/wav',
            b64: outcome.result.wav.toString('base64'),
          },
        });
        queue(idx + 2);
      }
      const timings = {
        sttMs: transcript.ms,
        ttsFirstMs,
        totalMs: performance.now() - started,
      };
      emit({ event: 'done', data: { timings, turn: 1 } });
      options.onMetrics?.({ sessionId: input.sessionId, timings });
    }, request.signal);
  };
}
