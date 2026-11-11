import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { cloneSession, replaceSession } from '@/lib/agent/session';
import type { Session } from '@/lib/agent/session';
import { applyPlaybackReceipt } from '@/lib/agent/interruption';
import { runTurn } from '@/lib/agent/orchestrator';
import type { TurnEnvironment, TurnMetrics } from '@/lib/agent/orchestrator';
import type { SessionStore } from '@/lib/server/session-store';
import type { EchoInput } from '@/lib/server/turn-input';
import { publicVoiceError } from '@/lib/server/voice-errors';
import type { EchoEvent, EmitEchoEvent } from '@/lib/voice/events';
import { abortable, throwIfAborted } from '@/lib/voice/abort';

interface Completed {
  fingerprint: string;
  events: EchoEvent[];
  metrics: TurnMetrics | null;
  completedAt: number;
  replayAvailable: boolean;
  bytes: number;
}
interface Running {
  fingerprint: string;
  result: Promise<Completed>;
}
export type AgentEnvironmentFactory = (
  session: Session,
) => Promise<Omit<TurnEnvironment, 'signal' | 'onCommitPoint'>>;
export interface CompletedTurnReport {
  sessionId: string;
  turn: number;
  metrics: TurnMetrics;
  status?: 'success' | 'failed' | 'interrupted';
  errorCode?: string;
  phase?: string;
}
export class TurnService {
  private cachedBytes = 0;
  private readonly completed = new Map<string, Completed>();
  private readonly running = new Map<string, Running>();
  constructor(
    private readonly sessions: SessionStore,
    private readonly environment: AgentEnvironmentFactory,
    private readonly now: () => number = Date.now,
    private readonly onCompleted?: (report: CompletedTurnReport) => void,
    private readonly admit?: () => void,
    private readonly maxReplayBytes = 32 * 1024 * 1024,
    private readonly onPlaybackReceipt?: (
      sessionId: string,
      turn: number,
      played: number,
    ) => void,
  ) {}
  async run(
    input: EchoInput & { turnId: string },
    emit: EmitEchoEvent,
    signal: AbortSignal,
  ): Promise<TurnMetrics | null> {
    if (!z.uuid().safeParse(input.turnId).success)
      throw new AppError('INVALID_INPUT', 'Supply a UUID turnId');
    this.sessions.get(input.sessionId);
    signal = AbortSignal.any([signal, this.sessions.signal(input.sessionId)]);
    this.prune();
    const key = `${input.sessionId}:${input.turnId}`;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([input.kind, input.playedSentences ?? null]))
      .update(input.kind === 'text' ? input.text : input.wav)
      .digest('hex');
    const cached = this.completed.get(key);
    const active = this.running.get(key);
    if (
      (cached ?? active)?.fingerprint !== undefined &&
      (cached ?? active)?.fingerprint !== fingerprint
    )
      throw new AppError(
        'TURN_CONFLICT',
        'This turnId already belongs to different input',
      );
    const replay =
      cached ?? (active ? await abortable(active.result, signal) : undefined);
    if (replay) {
      if (!replay.replayAvailable || this.now() - replay.completedAt >= 60000)
        throw new AppError(
          'REPLAY_EXPIRED',
          'The previous response expired. Start a new call.',
        );
      const result = replay;
      for (const event of result.events) {
        throwIfAborted(signal);
        emit(event);
      }
      return result.metrics;
    }
    const task = Promise.resolve().then(() =>
      this.sessions.exclusive(
        input.sessionId,
        async (base): Promise<Completed> => {
          this.sessions.assertCanTurn(base);
          this.admit?.();
          throwIfAborted(signal);
          if (input.playedSentences !== undefined) {
            applyPlaybackReceipt(base, input.playedSentences);
            this.onPlaybackReceipt?.(
              base.id,
              base.playback?.turn ?? base.history.at(-1)?.turn ?? base.turn,
              input.playedSentences,
            );
          }
          const draft = cloneSession(base);
          draft.turn += 1;
          const events: EchoEvent[] = [];
          let metrics: TurnMetrics | null = null;
          const forward: EmitEchoEvent = (event): void => {
            events.push(event);
            emit(event);
          };
          try {
            const environment = await this.environment(draft);
            metrics = await runTurn(draft, input, forward, {
              ...environment,
              onMetrics: (partial): void => {
                metrics = partial;
              },
              signal,
              onCommitPoint: (): void => {
                replaceSession(base, draft);
              },
            });
            const last = draft.history.at(-1);
            if (last)
              last.sentences = events
                .filter((event) => event.event === 'sentence')
                .map((event) => event.data.text);
            draft.playback = {
              turn: draft.turn,
              sentences: last?.sentences ?? [],
              spoken: last?.spoken ?? '',
              interrupted: false,
              ...(last?.questionId ? { questionId: last.questionId } : {}),
            };
            draft.reprompts = 0;
            replaceSession(base, draft);
            try {
              this.onCompleted?.({
                sessionId: base.id,
                turn: base.turn,
                metrics,
                status: 'success',
                phase: base.followup?.phase ?? base.phase,
              });
            } catch {
              // Observability must not turn a completed call into a failed turn.
            }
          } catch (error: unknown) {
            const noSpeech =
              error instanceof AppError && error.code === 'NO_SPEECH';
            const exhausted = noSpeech && (base.reprompts ?? 0) >= 2;
            if (noSpeech) base.reprompts = (base.reprompts ?? 0) + 1;
            const failure = publicVoiceError(
              exhausted
                ? new AppError('TEXT_REQUIRED', 'Please use text')
                : error,
            );
            if (metrics) metrics.usageComplete = false;
            if (!noSpeech) base.turn = draft.turn;
            try {
              this.onCompleted?.({
                sessionId: base.id,
                turn: base.turn,
                phase: base.followup?.phase ?? base.phase,
                status: signal.aborted ? 'interrupted' : 'failed',
                errorCode: failure.code,
                metrics: metrics ?? {
                  sttMs: 0,
                  llmFirstMs: 0,
                  llmTotalMs: 0,
                  ttsFirstMs: 0,
                  firstAudioMs: 0,
                  totalMs: 0,
                  tools: [],
                  models: [],
                  tokens: { input: 0, output: 0, thoughts: 0 },
                },
              });
            } catch {
              /* metrics must not affect recovery */
            }
            base.counters = draft.counters;
            if (signal.aborted && draft.history.length > base.history.length) {
              const interrupted = draft.history.at(-1);
              if (interrupted) {
                interrupted.interrupted = true;
                interrupted.sentences = events
                  .filter((event) => event.event === 'sentence')
                  .map((event) => event.data.text);
                interrupted.spoken =
                  '[Interrupted by seller; playback receipt pending.]';
                base.history.push(interrupted);
              }
            }
            const last = draft.history.at(-1);
            base.playback = {
              turn: draft.turn,
              sentences: events
                .filter((event) => event.event === 'sentence')
                .map((event) => event.data.text),
              spoken: '[Reply did not complete.]',
              interrupted: signal.aborted,
              ...(last?.turn === draft.turn && last.questionId
                ? { questionId: last.questionId }
                : {}),
            };
            // Facts, questions, phase, proposal and signed history stay at the last
            // successful turn; a staged commitment has never reached the ledger.
            if (noSpeech && !exhausted)
              forward({
                event: 'fallback',
                data: {
                  kind: 'stt',
                  message:
                    "Sorry, I didn't catch that. Could you say it again?",
                },
              });
            forward({ event: 'error', data: failure });
          }
          const result: Completed = {
            fingerprint,
            events,
            metrics,
            completedAt: this.now(),
            replayAvailable: true,
            bytes: Buffer.byteLength(JSON.stringify(events)),
          };
          this.completed.set(key, result);
          this.cachedBytes += result.bytes;
          for (const cached of this.completed.values()) {
            if (this.cachedBytes <= this.maxReplayBytes) break;
            this.releaseAudio(cached);
          }
          return result;
        },
      ),
    );
    this.running.set(key, { fingerprint, result: task });
    try {
      return (await task).metrics;
    } finally {
      this.running.delete(key);
    }
  }
  private releaseAudio(result: Completed): void {
    this.cachedBytes -= result.bytes;
    result.bytes = 0;
    result.events = [];
    result.replayAvailable = false;
  }
  private prune(): void {
    for (const [key, result] of this.completed)
      if (this.now() - result.completedAt >= 60000) {
        this.releaseAudio(result);
        try {
          this.sessions.get(key.split(':')[0] ?? '');
        } catch {
          this.completed.delete(key);
        }
      }
  }
}
