import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/lib/domain/actions';
import { spokenActionTitles, planSummary } from '@/lib/domain/plan-speech';
import { lintSpeech } from '@/lib/domain/speech';
import { fixture } from '../fixtures';

describe('plan speech derived from catalog data', () => {
  it('speaks selected titles and a short owner/date/checkpoint summary', () => {
    const plan = buildPlan(
      {
        snapshot: fixture.seller,
        skus: fixture.skus,
        cancellations: fixture.cancellations,
        facts: {},
        questionsAsked: [],
        toolsCalled: new Set([
          'get_seller_snapshot',
          'get_sku_breakdown',
          'get_cancellation_breakdown',
        ]),
      },
      new Date('2026-11-10T00:00:00Z'),
    );
    expect(
      lintSpeech(
        `${spokenActionTitles(plan).join('. ')}. Shall I save this plan?`,
        'recommend',
      ).ok,
    ).toBe(true);
    expect(
      lintSpeech(`${planSummary(plan)} Saved to the demo ledger.`, 'summary')
        .ok,
    ).toBe(true);
    expect(planSummary(plan)).toContain('two days');
    expect(planSummary(plan)).toContain('seven days');
  });
});
