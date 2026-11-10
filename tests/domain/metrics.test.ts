import { describe, expect, it } from 'vitest';
import { bridge, netBridge } from '@/lib/domain/metrics';
import { fixture } from '../fixtures';

describe('sales bridges', () => {
  it('attributes the gross decline to order volume', () => {
    expect(bridge(fixture.seller)).toMatchObject({
      salesDelta: -65000,
      pct: -32.5,
      orderDelta: -130,
      priceEffect: 0,
      volumeEffect: -65000,
    });
  });
  it('uses fractional cancellations for the net bridge', () => {
    expect(netBridge(fixture.seller)).toEqual({
      netOrdersLast: 368,
      netOrdersThis: 232.2,
      netSalesLast: 184000,
      netSalesThis: 116100,
      salesDelta: -67900,
      pct: -36.9,
      volumeEffect: -59800,
      cancelEffect: -8100,
      priceEffect: 0,
      volumeShare: 88.1,
      cancelShare: 11.9,
      priceShare: 0,
    });
  });
  it('keeps changing-price bridges additive', () => {
    const seller = structuredClone(fixture.seller);
    seller.periods.this.asp = 550;
    seller.periods.this.sales =
      seller.periods.this.orders * seller.periods.this.asp;
    const gross = bridge(seller);
    const net = netBridge(seller);
    expect(gross.volumeEffect + gross.priceEffect).toBe(gross.salesDelta);
    expect(net.volumeEffect + net.cancelEffect + net.priceEffect).toBe(
      net.salesDelta,
    );
  });
  it('returns unknown percentage for a zero baseline without non-finite numbers', () => {
    const seller = structuredClone(fixture.seller);
    seller.periods.last.orders = 0;
    seller.periods.last.sales = 0;
    expect(bridge(seller).pct).toBeNull();
    expect(netBridge(seller).pct).toBeNull();
  });
  it('handles unchanged periods without dividing by zero', () => {
    const seller = structuredClone(fixture.seller);
    seller.periods.this = { ...seller.periods.last };
    expect(netBridge(seller)).toMatchObject({
      salesDelta: 0,
      volumeShare: 0,
      cancelShare: 0,
    });
  });
});
