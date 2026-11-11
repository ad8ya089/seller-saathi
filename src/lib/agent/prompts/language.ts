import type { Language } from '@/lib/voice/language';

export function languageAddendum(language: Language): string {
  return language === 'hi-IN'
    ? `LANGUAGE: Hindi/Hinglish. Use natural Roman-script Hindi with English business vocabulary: stock, supplier, dispatch, bestseller and the exact product names supplied by tools. Use respectful aap phrasing and mirror the seller's mix; avoid formal textbook Hindi. Keep the same sentence, word and question limits. Copy approved numeric speech exactly: Indian English number words with lakh and rupaye are appropriate in Hinglish. Never translate values or invent product/SKU translations. Preserve seller quotes verbatim, including Devanagari. The AI disclosure was already in the greeting; do not repeat it. Do not switch to an English-only response.`
    : 'LANGUAGE: English-India. Keep the existing English speaking rules.';
}
