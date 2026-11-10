import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { cloneSession, replaceSession } from '@/lib/agent/session';
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
}
interface Running {
  fingerprint: string;
  result: Promise<Completed>;
}
export type AgentEnvironmentFactory = () => Promise<
  Omit<TurnEnvironment, 'signal' | 'onCommitPoint'>
>;
export interface CompletedTurnReport {
  sessionId: string;
  turn: number;
  metrics: TurnMetrics;
}
export class TurnService {
  private readonly completed = new Map<string, Completed>();
  private readonly running = new Map<string, Running>();
  constructor(
    private readonly sessions: SessionStore,
    private readonly environment: AgentEnvironmentFactory,
    private readonly now: () => number = Date.now,
    private readonly onCompleted?: (report: CompletedTurnReport) => void,
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
      .update(input.kind)
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
          throwIfAborted(signal);
          const draft = cloneSession(base);
          draft.turn += 1;
          const events: EchoEvent[] = [];
          let metrics: TurnMetrics | null = null;
          const forward: EmitEchoEvent = (event): void => {
            events.push(event);
            emit(event);
          };
          try {
            const environment = await this.environment();
            metrics = await runTurn(draft, input, forward, {
              ...environment,
              signal,
              onCommitPoint: (): void => {
                replaceSession(base, draft);
              },
            });
            replaceSession(base, draft);
            try {
              this.onCompleted?.({
                sessionId: base.id,
                turn: base.turn,
                metrics,
              });
            } catch {
              // Observability must not turn a completed call into a failed turn.
            }
          } catch (error: unknown) {
            base.turn = draft.turn;
            base.counters = draft.counters;
            // Facts, questions, phase, proposal and signed history stay at the last
            // successful turn; a staged commitment has never reached the ledger.
            forward({ event: 'error', data: publicVoiceError(error) });
          }
          const result: Completed = {
            fingerprint,
            events,
            metrics,
            completedAt: this.now(),
          };
          this.completed.set(key, result);
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
  private prune(): void {
    for (const [key, result] of this.completed)
      if (this.now() - result.completedAt >= 60000) this.completed.delete(key);
  }
}
