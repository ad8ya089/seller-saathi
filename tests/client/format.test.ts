import { describe, expect, it } from 'vitest';
import {
  currency,
  number,
  percent,
  percentagePoints,
  date,
  milliseconds,
} from '@/lib/client/format';

describe('dashboard formatting', () => {
  it('uses Indian grouping and clear signed currency without rounding away missing values', () => {
    expect(currency(200000)).toBe('₹2,00,000');
    expect(currency(135000)).toBe('₹1,35,000');
    expect(currency(-65000)).toBe('−₹65,000');
    expect(currency(0)).toBe('₹0');
    expect(number(1234567)).toBe('12,34,567');
    expect(percent(0.14)).toBe('14.0%');
    expect(percentagePoints(6)).toBe('+6.0 pp');
  });
  it('keeps unknown values distinct from zero and calendar dates independent of local time', () => {
    for (const missing of [
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(currency(missing)).toBe('Not available');
      expect(number(missing)).toBe('Not available');
      expect(percent(missing)).toBe('Not available');
      expect(milliseconds(missing)).toBe('Not available');
    }
    expect(date('2026-11-17')).toBe('17 Nov 2026');
    expect(date(null)).toBe('Not available');
  });
});
