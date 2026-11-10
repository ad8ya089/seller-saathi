import type { Phase } from '@/lib/domain/types';

type SpeechIssueCode =
  | 'EMPTY'
  | 'MARKDOWN'
  | 'SYMBOL'
  | 'SKU_CODE'
  | 'EMOJI'
  | 'WORD_LIMIT'
  | 'SENTENCE_LIMIT'
  | 'QUESTION_COUNT'
  | 'QUESTION_POSITION';
export interface SpeechIssue {
  code: SpeechIssueCode;
  message: string;
  actual?: number;
  limit?: number;
}
export interface SpeechValidation {
  ok: boolean;
  errors: SpeechIssue[];
}
const DEFAULT_LIMITS = { words: 35, sentences: 2 } as const;
const PHASE_LIMITS: Readonly<
  Partial<Record<Phase, { words: number; sentences: number }>>
> = {
  findings: { words: 50, sentences: 3 },
  recommend: { words: 70, sentences: 4 },
};
const TEXT_RULES: readonly {
  code: SpeechIssueCode;
  pattern: RegExp;
  message: string;
}[] = [
  {
    code: 'MARKDOWN',
    pattern: /[*_`#]|^\s*(?:[-+>]\s|\d+[.)]\s)|\[[^\]]*\]\([^)]*\)/m,
    message: 'Use plain speech without Markdown.',
  },
  {
    code: 'SYMBOL',
    pattern: /[₹$€£%]|\bRs\.?(?=\s|\d|$)|\bINR\b/i,
    message: 'Speak currency and percentages as words.',
  },
  {
    code: 'SKU_CODE',
    pattern: /\b[A-Z]{3}-\d{3}\b/i,
    message: 'Use product names instead of SKU codes.',
  },
  {
    code: 'EMOJI',
    pattern: /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F]/u,
    message: 'Do not include emojis in speech.',
  },
];

export function lintSpeech(text: string, phase: Phase): SpeechValidation {
  const errors: SpeechIssue[] = [];
  const trimmed = text.trim();
  if (!trimmed)
    return {
      ok: false,
      errors: [{ code: 'EMPTY', message: 'Speech must not be empty.' }],
    };
  for (const rule of TEXT_RULES) {
    if (rule.pattern.test(text))
      errors.push({ code: rule.code, message: rule.message });
  }
  const limits = PHASE_LIMITS[phase] ?? DEFAULT_LIMITS;
  const words = trimmed.split(/\s+/).length;
  const sentences = trimmed
    .split(/[.!?।]+(?:\s+|$)/u)
    .filter((part) => part.trim()).length;
  const questions = (text.match(/\?/g) ?? []).length;
  if (words > limits.words)
    errors.push({
      code: 'WORD_LIMIT',
      message: 'Speech exceeds the phase word limit.',
      actual: words,
      limit: limits.words,
    });
  if (sentences > limits.sentences)
    errors.push({
      code: 'SENTENCE_LIMIT',
      message: 'Speech exceeds the phase sentence limit.',
      actual: sentences,
      limit: limits.sentences,
    });
  if (questions > 1)
    errors.push({
      code: 'QUESTION_COUNT',
      message: 'Ask at most one question per turn.',
      actual: questions,
      limit: 1,
    });
  if (questions === 1 && !trimmed.endsWith('?'))
    errors.push({
      code: 'QUESTION_POSITION',
      message: 'Place the question at the end of the turn.',
    });
  return { ok: errors.length === 0, errors };
}
