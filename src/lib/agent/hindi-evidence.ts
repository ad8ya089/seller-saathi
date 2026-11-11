import type { SellerFact } from '@/lib/domain/types';

// Validation only. Original transcripts and literal quotes are never rewritten.
export const HINDI_NEGATION =
  /(?:^|\s)(?:nahi|nahin|mat|agar|lekin|magar|pehle|shayad|baad|नहीं|नही|मत|अगर|लेकिन|पहले|शायद|बाद)(?=\s|$)/u;
const YES =
  /^(?:haan|han|haanji|ji haan|bilkul|theek hai|हाँ|हां|जी हाँ|ठीक है)(?:\s+(?:dono|both|sahi|ji|theek hai|सही|दोनों|ठीक है))*$/u;
export function hindiAcceptance(text: string): boolean {
  if (HINDI_NEGATION.test(text)) return false;
  return (
    YES.test(text) ||
    /^(?:(?:haan|han|ji haan|हाँ|हां|जी हाँ) )?(?:(?:yeh|ye|is|this|the|इस|यह) )?(?:(?:plan|yojana|योजना|प्लान) )?(?:save kar (?:dijiye|do)|save kijiye|sev kar dijiye|सेव कर दीजिए|सेव कीजिए)$/u.test(
      text,
    )
  );
}
const DAYS = [
  'zero|shunya|शून्य',
  'ek|एक',
  'do|दो',
  'teen|तीन',
  'chaar|char|चार',
  'paanch|panch|पाँच|पांच',
  'chhe|cheh|छह',
  'saat|सात',
  'aath|आठ',
  'nau|नौ',
  'das|dus|दस',
  'gyarah|ग्यारह',
  'barah|बारह',
  'terah|तेरह',
  'chaudah|चौदह',
  'pandrah|पंद्रह',
  'solah|सोलह',
  'satrah|सत्रह',
  'atharah|अठारह',
  'unnis|उन्नीस',
  'bees|बीस',
];
export function hindiFact(
  fact: SellerFact,
  text: string,
  answering: boolean,
): boolean | undefined {
  const negative = /(?:^|\s)(?:nahi|nahin|mat|नहीं|नही|मत)(?=\s|$)/u.test(text);
  if (fact.factId === 'restock_eta_days') {
    if (
      negative ||
      /weeks?|months?|hafte|hafta|mahine|mahina|हफ्ते|सप्ताह|महीने|rupees|rupaye|orders|items/u.test(
        text,
      )
    )
      return false;
    const digits = text.replace(/[०-९]/gu, (value) =>
      String(value.charCodeAt(0) - 0x0966),
    );
    const value = fact.value;
    if (value > 365) return false;
    const literal = new RegExp(
      `(?:^|\\s)(?:${String(value)}|${DAYS[value] ?? '(?!)'})(?=\\s|$)`,
      'u',
    ).test(digits);
    return literal
      ? answering || /\b(?:din|days?)\b|दिन/u.test(text)
      : undefined;
  }
  if (fact.factId === 'restock_cause') {
    if (fact.value === 'supplier_delay' && negative) return false;
    const patterns = {
      supplier_delay: /(?:supplier|सप्लायर).*(?:late|delay|deri|देर)/u,
      cash_constraint: /cash|paise|paisa|पैसे|पैसा|पूंजी/u,
      unaware: /pata nahi|maloom nahi|पता नहीं|मालूम नहीं/u,
      other: /doosra|dusra|alag|दूसरा|अलग/u,
    };
    return patterns[fact.value].test(text) ? true : undefined;
  }
  if (fact.value === 'unknown')
    return /pata nahi|maloom nahi|पता नहीं|मालूम नहीं/u.test(text)
      ? answering
      : undefined;
  if (fact.value === 'partial' || fact.value === 'sometimes')
    return (
      /partial|kuch|thoda|kabhi|कुछ|थोड़ा|कभी/u.test(text) &&
      (answering || /stock|dispatch|courier|स्टॉक/u.test(text))
    );
  if (
    fact.value === 'no' &&
    ((answering && /^(?:nahi|nahin|नहीं|नही)(?:\s|$)/u.test(text)) ||
      (fact.factId === 'can_restock_partial' &&
        /restock|batch|रीस्टॉक|बैच/u.test(text) &&
        /sakta|sakte|possible|feasible|सकता|सकते|संभव/u.test(text))) &&
    negative
  )
    return true;
  if (fact.value === 'yes' && negative) return false;
  if (
    answering &&
    /^(?:haan|han|ji haan|हाँ|हां|जी हाँ|dono|दोनों)(?:\s|$)/u.test(text)
  )
    return fact.value === 'yes';
  if (
    fact.value === 'yes' &&
    fact.factId === 'can_restock_partial' &&
    /(?:restock|batch|stock).*(?:kar sakta|kar sakte|possible|कर सकता|कर सकते)/u.test(
      text,
    )
  )
    return true;
  return undefined;
}
