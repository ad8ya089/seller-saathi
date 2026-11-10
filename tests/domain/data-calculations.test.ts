import { describe, expect, it } from 'vitest';
import {
  cancellationMetrics,
  inventoryMetrics,
} from '@/lib/domain/data-calculations';
import { fixture } from '../fixtures';

describe('derived data', () => {
  it('derives inventory concentration and recovery ceilings from all zero-stock products', () => {
    expect(inventoryMetrics(fixture.seller, fixture.skus)).toMatchObject({
      oosCount: 3,
      oosOrdersLast: 190,
      oosOrdersThis: 67,
      oosDecline: 123,
      grossOrderDecline: 130,
      recoveryCeiling: 61500,
    });
  });
  it('includes offsets within the OOS group rather than summing only negative SKU changes', () => {
    const data = structuredClone(fixture.skus);
    const first = data.skus[0];
    if (!first) throw new Error('Missing SKU fixture');
    first.ordersThis = 106;
    expect(inventoryMetrics(fixture.seller, data).oosDecline).toBe(48);
  });
  it('does not divide by zero when there are no cancellations', () => {
    const data = structuredClone(fixture.cancellations);
    data.reasons = data.reasons.map((reason) => ({
      ...reason,
      last: 0,
      this: 0,
    }));
    expect(cancellationMetrics(data)).toEqual({
      totalLast: 0,
      totalThis: 0,
      stockThis: 0,
      dispatchThis: 0,
      stockPct: 0,
      dispatchPct: 0,
      controllablePct: 0,
    });
  });
});
