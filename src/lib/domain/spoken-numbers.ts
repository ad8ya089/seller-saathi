import type { Language } from '@/lib/voice/language';
const SMALL = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const;
const GROUPS = [
  { divisor: 10000000, label: 'crore' },
  { divisor: 100000, label: 'lakh' },
  { divisor: 1000, label: 'thousand' },
  { divisor: 100, label: 'hundred' },
] as const;
function integer(value: number): string {
  if (value < 20) return SMALL[value] ?? '';
  if (value < 100)
    return [TENS[Math.floor(value / 10)], value % 10 ? SMALL[value % 10] : '']
      .filter(Boolean)
      .join(' ');
  const group = GROUPS.find((entry) => value >= entry.divisor);
  if (!group) return '';
  return [
    integer(Math.floor(value / group.divisor)),
    group.label,
    value % group.divisor ? integer(value % group.divisor) : '',
  ]
    .filter(Boolean)
    .join(' ');
}
export function spokenNumber(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) > 999999999)
    throw new RangeError('Number is outside the supported speech range');
  const [whole = '0', decimal] = Math.abs(value)
    .toFixed(1)
    .replace(/\.0$/, '')
    .split('.');
  return `${value < 0 ? 'minus ' : ''}${integer(Number(whole))}${decimal ? ` point ${SMALL[Number(decimal)] ?? ''}` : ''}`;
}
export function spokenMoney(
  value: number,
  language: Language = 'en-IN',
): string {
  return `${spokenNumber(value)} ${language === 'hi-IN' ? 'rupaye' : 'rupees'}`;
}
export function spokenPercent(value: number): string {
  return `${spokenNumber(value)} percent`;
}
