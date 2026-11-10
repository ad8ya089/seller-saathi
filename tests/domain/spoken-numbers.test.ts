import { describe, expect, it } from 'vitest';
import {
  spokenNumber,
  spokenMoney,
  spokenPercent,
} from '@/lib/domain/spoken-numbers';

describe('domain-derived speech numbers', () => {
  it('uses Indian grouping and speakable decimals', () => {
    expect(spokenMoney(135000)).toBe('one lakh thirty five thousand rupees');
    expect(spokenMoney(200000)).toBe('two lakh rupees');
    expect(spokenNumber(61500)).toBe('sixty one thousand five hundred');
    expect(spokenPercent(32.5)).toBe('thirty two point five percent');
    expect(spokenNumber(0)).toBe('zero');
  });
});
