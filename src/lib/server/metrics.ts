import 'server-only';
import type { TurnMetrics } from '@/lib/agent/orchestrator';
import { indiaDay } from '@/lib/server/rate-limit';

export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}
export { operationalTurnSchema } from '@/lib/voice/operational-metrics';
import { operationalTurnSchema } from '@/lib/voice/operational-metrics';
import type { OperationalTurn } from '@/lib/voice/operational-metrics';
export class Metrics {
  private total = 0;
  private successful = 0;
  private failed = 0;
  private interrupted = 0;
  private readonly errors: Record<string, number> = {};
  private readonly tokens = { input: 0, output: 0, thoughts: 0 };
  private ttsCharacters = 0;
  private fallbackTotal = 0;
  private readonly providerFallbacks = { stt: 0, tts: 0, llm: 0 };
  private readonly turns: OperationalTurn[] = [];
  private readonly fillers = new Set<string>();
  private readonly bySession = new Map<string, OperationalTurn>();
  record(
    sessionId: string,
    turn: number,
    phase: string,
    status: OperationalTurn['status'],
    errorCode: string | null,
    metrics: TurnMetrics,
  ): OperationalTurn {
    const value = operationalTurnSchema.parse({
      sessionId,
      turn,
      phase,
      status,
      errorCode,
      metrics: {
        ...metrics,
        ttsChars: metrics.ttsChars ?? 0,
        fallbacks: metrics.fallbacks ?? 0,
      },
    });
    this.total += 1;
    if (status === 'success') this.successful += 1;
    if (status === 'failed') this.failed += 1;
    if (status === 'interrupted') this.interrupted += 1;
    if (errorCode) this.errors[errorCode] = (this.errors[errorCode] ?? 0) + 1;
    for (const key of ['input', 'output', 'thoughts'] as const)
      this.tokens[key] += value.metrics.tokens[key];
    for (const key of ['stt', 'tts', 'llm'] as const)
      this.providerFallbacks[key] +=
        value.metrics.providerFallbacks?.[key] ?? 0;
    this.ttsCharacters += value.metrics.ttsChars;
    this.fallbackTotal += value.metrics.fallbacks;
    this.turns.push(value);
    if (this.turns.length > 4096) this.turns.shift();
    this.bySession.set(sessionId, value);
    if (this.bySession.size > 2048)
      this.bySession.delete(this.bySession.keys().next().value ?? '');
    return value;
  }
  filler(sessionId: string, turn: number): void {
    this.fillers.add(`${sessionId}:${String(turn)}`);
    if (this.fillers.size > 4096)
      this.fillers.delete(this.fillers.values().next().value ?? '');
  }
  session(id: string): OperationalTurn | null {
    return this.bySession.get(id) ?? null;
  }
  snapshot(): object {
    const audio = this.turns
      .filter(
        (turn) => turn.status === 'success' && turn.metrics.firstAudioMs > 0,
      )
      .map((turn) => turn.metrics.firstAudioMs);
    return {
      window:
        'lifetime counters; latency sample last 4096 accepted turns; resets on restart',
      day: indiaDay(new Date()),
      totalTurns: this.total,
      successfulTurns: this.successful,
      failedTurns: this.failed,
      interruptedTurns: this.interrupted,
      errors: { ...this.errors },
      fillerPlays: this.fillers.size,
      fallbacks: this.fallbackTotal,
      providerFallbacks: { ...this.providerFallbacks },
      tokens: { ...this.tokens },
      ttsCharacters: this.ttsCharacters,
      firstAudioMs: {
        p50: percentile(audio, 0.5),
        p95: percentile(audio, 0.95),
      },
      estimatedSessionCost: null,
      estimatedDayCost: null,
      costUnavailableReason:
        'Usage of failed provider attempts and per-model billing allocation are not fully reported; no exchange rate is assumed.',
    };
  }
}
const shared = globalThis as typeof globalThis & {
  sellerSaathiMetrics?: Metrics;
};
export function getMetrics(): Metrics {
  return (shared.sellerSaathiMetrics ??= new Metrics());
}
