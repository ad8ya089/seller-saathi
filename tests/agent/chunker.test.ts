import { describe, expect, it } from 'vitest';
import { SentenceChunker } from '@/lib/agent/chunker';

function chunks(parts: string[]): string[] {
  const chunker = new SentenceChunker();
  return [...parts.flatMap((part) => chunker.push(part)), ...chunker.flush()];
}
describe('streaming sentence chunker', () => {
  it('keeps decimal numbers intact', () => {
    expect(
      chunks(['Sales fell from 1.35 lakh. Are those best-sellers?']),
    ).toEqual(['Sales fell from 1.35 lakh.', 'Are those best-sellers?']);
  });
  it('waits for enough first-chunk content where possible', () => {
    const chunker = new SentenceChunker();
    expect(chunker.push('Thanks. ')).toEqual([]);
    expect(chunker.push('Let me check your stock. ')).toEqual([
      'Thanks. Let me check your stock.',
    ]);
  });
  it('handles danda and several sentences in one fragment', () => {
    expect(chunks(['यह आपकी आवाज़ का परीक्षण है। फिर से बोलिए।'])).toEqual([
      'यह आपकी आवाज़ का परीक्षण है।',
      'फिर से बोलिए।',
    ]);
  });
  it('splits long clauses at a useful separator, then flushes the tail', () => {
    const prefix =
      'Please check the stock levels on your most popular products before updating the quantities in your seller panel';
    const result = chunks([
      `${prefix}, and then match each quantity to what you can actually ship today without delay or confusion`,
    ]);
    expect(result[0]).toBe(`${prefix},`);
    expect(result.join(' ')).toContain('without delay or confusion');
  });
  it('removes Markdown and expands symbols without discarding their meaning', () => {
    expect(chunks(['**Sales** are ₹1.35 lakh, down 32.5%.'])).toEqual([
      'Sales are rupees 1.35 lakh, down 32.5 percent.',
    ]);
    expect(
      chunks(['# Note\n- Check [your panel](https://example.com).']),
    ).toEqual(['Note Check your panel.']);
  });
  it('handles empty input and final incomplete sentences', () => {
    expect(chunks(['', '  ', ''])).toEqual([]);
    expect(chunks(['A short final reply'])).toEqual(['A short final reply']);
    const chunker = new SentenceChunker();
    chunker.push('Short.');
    expect(chunker.flush()).toEqual(['Short.']);
    expect(chunker.flush()).toEqual([]);
  });
  it('retains boundary punctuation until the following fragment disambiguates it', () => {
    const chunker = new SentenceChunker();
    expect(chunker.push('Sales fell from 1.')).toEqual([]);
    expect(chunker.push('35 lakh.')).toEqual([]);
    expect(chunker.push(' Is stock available? ')).toEqual([
      'Sales fell from 1.35 lakh.',
      'Is stock available?',
    ]);
    expect(chunker.flush()).toEqual([]);
  });
  it('is independent of arbitrary fragment boundaries', () => {
    const text =
      'Your latest stock update is available. Can you confirm 1.35 lakh?';
    expect(chunks(text.split(/(?=.)/u))).toEqual(chunks([text]));
  });
  it('bounds long unpunctuated speech while preserving the words', () => {
    const text = 'stock '.repeat(100).trim();
    const result = chunks([text]);
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((part) => part.length <= 140)).toBe(true);
    expect(result.join(' ')).toBe(text);
  });
});
