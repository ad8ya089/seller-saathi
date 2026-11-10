import { describe, expect, it } from 'vitest';
import { sellerFactSchema, sellerFactsSchema } from '@/lib/domain/types';

describe('seller fact boundaries', () => {
  it('validates fact values against their identifiers', () => {
    expect(
      sellerFactSchema.safeParse({
        factId: 'restock_eta_days',
        value: 'ten',
        quote: 'ten',
        turn: 1,
      }).success,
    ).toBe(false);
    expect(
      sellerFactSchema.safeParse({
        factId: 'dispatch_on_time',
        value: 'unknown',
        quote: 'not sure',
        turn: 1,
      }).success,
    ).toBe(false);
    expect(
      sellerFactSchema.safeParse({
        factId: 'views_dropped',
        value: 'unknown',
        quote: 'not sure',
        turn: 1,
      }).success,
    ).toBe(true);
  });
  it('rejects invented facts and mismatched record keys', () => {
    expect(
      sellerFactsSchema.safeParse({
        views_dropped: {
          factId: 'oos_confirmed',
          value: 'yes',
          quote: 'yes',
          turn: 1,
        },
      }).success,
    ).toBe(false);
    expect(
      sellerFactSchema.safeParse({
        factId: 'impressions',
        value: 100,
        quote: 'one hundred',
        turn: 1,
      }).success,
    ).toBe(false);
  });
  it('rejects negative ETA, missing evidence and fractional turn numbers', () => {
    expect(
      sellerFactSchema.safeParse({
        factId: 'restock_eta_days',
        value: -1,
        quote: 'yesterday',
        turn: 1,
      }).success,
    ).toBe(false);
    expect(
      sellerFactSchema.safeParse({
        factId: 'oos_confirmed',
        value: 'yes',
        quote: ' ',
        turn: 1,
      }).success,
    ).toBe(false);
    expect(
      sellerFactSchema.safeParse({
        factId: 'oos_confirmed',
        value: 'yes',
        quote: 'yes',
        turn: 1.5,
      }).success,
    ).toBe(false);
  });
});
