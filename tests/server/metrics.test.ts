import { describe, expect, it } from 'vitest';
import { Metrics, percentile } from '@/lib/server/metrics';
import { defaultPricing, llmCost } from '@/lib/server/cost';

describe('operational measurements', () => {
  it('keeps unavailable percentiles null and uses nearest rank for observed samples', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([600, 100, 300, 200], 0.5)).toBe(200);
    expect(percentile([600, 100, 300, 200], 0.95)).toBe(600);
  });
  it('records failed, interrupted and successful turns without text and deduplicates filler reports', () => {
    const metrics = new Metrics();
    const measured = {
      sttMs: 1,
      llmFirstMs: 2,
      llmTotalMs: 3,
      ttsFirstMs: 4,
      firstAudioMs: 5,
      totalMs: 6,
      tokens: { input: 10, output: 2, thoughts: 0 },
      tools: ['read'],
      models: ['test'],
    };
    metrics.record('session', 1, 'intake', 'success', null, measured);
    metrics.record(
      'session',
      2,
      'intake',
      'failed',
      'PROVIDER_TIMEOUT',
      measured,
    );
    metrics.record(
      'session',
      3,
      'intake',
      'interrupted',
      'REQUEST_ABORTED',
      measured,
    );
    metrics.filler('session', 1);
    metrics.filler('session', 1);
    expect(metrics.snapshot()).toMatchObject({
      totalTurns: 3,
      successfulTurns: 1,
      failedTurns: 1,
      interruptedTurns: 1,
      fillerPlays: 1,
      tokens: { input: 30, output: 6, thoughts: 0 },
      estimatedDayCost: null,
    });
    expect(JSON.stringify(metrics.snapshot())).not.toContain('transcript');
    metrics.markInterrupted('session', 1);
    metrics.markInterrupted('session', 1);
    expect(metrics.snapshot()).toMatchObject({
      totalTurns: 3,
      successfulTurns: 0,
      interruptedTurns: 2,
    });
  });
  it('uses actual model identifiers, billing units and announced effective dates', () => {
    const price = defaultPricing('2026-11-11');
    expect(
      llmCost(
        'gemini-3.5-flash-lite',
        { input: 1000000, output: 1000000, thoughts: 0 },
        price,
      ),
    ).toBe(2.8);
    expect(
      llmCost('unknown', { input: 1, output: 1, thoughts: 0 }, price),
    ).toBeNull();
    expect(price.tts['bulbul:v4-flash']).toBe(1);
    expect(defaultPricing('2026-11-13').tts['bulbul:v4-flash']).toBe(2);
    expect(
      defaultPricing('2027-01-01').llm['gemini-3.6-flash']?.inputUsdPerMillion,
    ).toBe(1.5);
  });
});
