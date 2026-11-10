import { describe, expect, it } from 'vitest';
import { lintSpeech } from '@/lib/domain/speech';

describe('speech style validation', () => {
  it('accepts plain concise speakable text', () => {
    expect(
      lintSpeech('Understood. When do you expect fresh stock?', 'investigate'),
    ).toEqual({ ok: true, errors: [] });
  });
  it.each([
    ['**Stock** is low.', 'MARKDOWN'],
    ['# Summary', 'MARKDOWN'],
    ['- Restock today', 'MARKDOWN'],
    ['1. Restock today', 'MARKDOWN'],
    ['See [this](https://example.com)', 'MARKDOWN'],
    ['Your loss is ₹65000.', 'SYMBOL'],
    ['It fell 32.5%.', 'SYMBOL'],
    ['Rs. 500', 'SYMBOL'],
    ['Check KUR-101.', 'SKU_CODE'],
    ['Hello 😀', 'EMOJI'],
    ['It costs $500.', 'SYMBOL'],
  ])('rejects %s with a structured %s error', (text, expected) => {
    const result = lintSpeech(text, 'findings');
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(expected);
  });
  it('allows ordinary hyphenated words, decimal text and spelled-out money', () => {
    expect(
      lintSpeech(
        'Your best-sellers could recover up to sixty-one thousand five hundred rupees if fully recovered.',
        'recommend',
      ).ok,
    ).toBe(true);
    expect(lintSpeech('The average is 1.35 lakh.', 'findings').ok).toBe(true);
  });
  it('allows only one question, at the end', () => {
    expect(
      lintSpeech('Is stock low? Can you restock?', 'investigate').errors.map(
        (error) => error.code,
      ),
    ).toContain('QUESTION_COUNT');
    expect(
      lintSpeech('Is stock low? Let us check.', 'investigate').errors.map(
        (error) => error.code,
      ),
    ).toContain('QUESTION_POSITION');
  });
  it.each([
    ['intake', 35],
    ['findings', 50],
    ['recommend', 70],
  ] as const)('uses the %s word limit of %s', (phase, limit) => {
    expect(
      lintSpeech(Array.from({ length: limit }, () => 'word').join(' '), phase)
        .ok,
    ).toBe(true);
    expect(
      lintSpeech(
        Array.from({ length: limit + 1 }, () => 'word').join(' '),
        phase,
      ).errors.map((error) => error.code),
    ).toContain('WORD_LIMIT');
  });
  it('enforces sentence limits by phase and handles decimal points', () => {
    expect(
      lintSpeech('One. Two. Three.', 'intake').errors.map(
        (error) => error.code,
      ),
    ).toContain('SENTENCE_LIMIT');
    expect(lintSpeech('One. Two. Three.', 'findings').ok).toBe(true);
    expect(lintSpeech('One. Two. Three. Four.', 'recommend').ok).toBe(true);
    expect(lintSpeech('One. Two. Three. Four. Five.', 'recommend').ok).toBe(
      false,
    );
    expect(lintSpeech('The number is 1.35. Is that clear?', 'intake').ok).toBe(
      true,
    );
  });
  it('rejects empty speech', () => {
    expect(
      lintSpeech('  ', 'intake').errors.map((error) => error.code),
    ).toContain('EMPTY');
  });
});
