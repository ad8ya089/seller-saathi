import { describe, expect, it } from 'vitest';
import { signals } from '@/lib/domain/signals';
import { DEFAULT_THRESHOLDS } from '@/lib/domain/settings';
import { fixture } from '../fixtures';

describe('diagnostic signals', () => {
  it('detects the six sample signals with readable evidence', () => {
    const result = signals({
      seller: fixture.seller,
      skus: fixture.skus,
      cancellations: fixture.cancellations,
    });
    expect(
      result.filter((signal) => signal.triggered).map((signal) => signal.id),
    ).toEqual([
      'S_ORDER_DROP',
      'S_ASP_FLAT',
      'S_OOS_SPIKE',
      'S_CANCEL_UP',
      'S_SKU_CONCENTRATION',
      'S_CANCEL_STOCK_DOMINANT',
    ]);
    expect(
      result.find((signal) => signal.id === 'S_SKU_CONCENTRATION')?.evidence
        .value,
    ).toBeCloseTo(94.6, 1);
    expect(
      result.find((signal) => signal.id === 'S_CANCEL_DISPATCH_DOMINANT')
        ?.evidence.value,
    ).toBeCloseTo(26.3, 1);
    expect(
      result.every((signal) => signal.evidence.description.length > 0),
    ).toBe(true);
  });
  it('does not invent detail signals before the detail data is available', () => {
    expect(signals({ seller: fixture.seller })).toHaveLength(4);
  });
  it('uses inclusive threshold boundaries and configurable thresholds', () => {
    const seller = structuredClone(fixture.seller);
    seller.periods.this.orders = 340;
    seller.periods.this.cancelRate = 0.11;
    seller.periods.this.oosProducts = 10;
    expect(
      signals({ seller }).filter((signal) => signal.triggered),
    ).toHaveLength(4);
    expect(
      signals({ seller }, { ...DEFAULT_THRESHOLDS, orderDropPct: -16 })[0]
        ?.triggered,
    ).toBe(false);
    expect(
      signals({ seller }, { ...DEFAULT_THRESHOLDS, oosIncrease: 6 })[2]
        ?.triggered,
    ).toBe(false);
  });
  it('handles zero baselines without triggering a false order decline or OOS spike', () => {
    const seller = structuredClone(fixture.seller);
    seller.periods.last.orders = 0;
    seller.periods.last.oosProducts = 0;
    seller.periods.this.oosProducts = 0;
    const result = signals({ seller });
    expect(result[0]?.triggered).toBe(false);
    expect(result[2]?.triggered).toBe(false);
  });
  it('detects dispatch dominance independently from stock', () => {
    const cancellations = structuredClone(fixture.cancellations);
    cancellations.reasons = cancellations.reasons.map((row) => ({
      ...row,
      this: row.reason === 'dispatch_delay' ? 20 : 1,
    }));
    const result = signals({ seller: fixture.seller, cancellations });
    expect(
      result.find((signal) => signal.id === 'S_CANCEL_DISPATCH_DOMINANT')
        ?.triggered,
    ).toBe(true);
    expect(
      result.find((signal) => signal.id === 'S_CANCEL_STOCK_DOMINANT')
        ?.triggered,
    ).toBe(false);
  });
});
