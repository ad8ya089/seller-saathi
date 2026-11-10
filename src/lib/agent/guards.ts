import type { QuestionId, SellerFact } from '@/lib/domain/types';
import { QUESTION_BANK } from '@/lib/domain/questions';
import { spokenNumber } from '@/lib/domain/spoken-numbers';

export function normalizeEvidence(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function supportsQuote(quote: string, utterance: string): boolean {
  const normalized = normalizeEvidence(quote);
  return (
    normalized.length > 0 &&
    ` ${normalizeEvidence(utterance)} `.includes(` ${normalized} `)
  );
}
export function verifiedAcceptance(quote: string, utterance: string): boolean {
  if (!supportsQuote(quote, utterance) || /\?/.test(utterance)) return false;
  const text = normalizeEvidence(utterance);
  if (
    /\b(no|not|dont|never|cannot|cant|maybe|later|if|unless|but|however|only|ignore|override|rules|first|tell|explain)\b/.test(
      text,
    )
  )
    return false;
  return /^(?:(?:yes|yeah|yep|sure|okay|ok|agreed)(?:\s+(?:please|go ahead|and|save (?:it|this|this plan|the plan)|do that|lets do it|lets proceed|proceed|i agree|that works))*|i (?:agree|accept)(?: (?:to|with) (?:this|the) plan)?|(?:please )?save (?:it|this|this plan|the plan)|go ahead(?: and save (?:it|the plan))?)$/.test(
    text,
  );
}
const POSITIVE: Partial<Record<SellerFact['factId'], RegExp>> = {
  oos_confirmed:
    /\b(best sellers|bestsellers|out of stock|stockouts?|sold out)\b/,
  dispatch_on_time:
    /\b(dispatch|packing|orders|courier)\b.*\b(on time|fine|timely)\b/,
  views_dropped:
    /\b(views|visibility|impressions)\b.*\b(dropped|down|fell|falling|lower|decreased)\b/,
  competitor_undercut:
    /\b(competitors?|other sellers)\b.*\b(cut|lower|cheaper|reduced)\b/,
  can_restock_partial:
    /\b(i|we) (can|am able|are able)\b.*\b(restock|batch|stock)\b|\b(partial restock|small batch)\b.*\b(possible|feasible)\b/,
};
const NEGATIVE: Partial<Record<SellerFact['factId'], RegExp>> = {
  oos_confirmed: /\b(stock is fine|in stock|slow movers|not.*best sellers)\b/,
  dispatch_on_time:
    /\b(courier|dispatch|packing|handover|pick)\b.*\b(late|delay|delays|doesnt|not)\b|\b(doesnt|not)\b.*\b(pick|dispatch)\b/,
  views_dropped: /\b(views|visibility)\b.*\b(stable|same|fine|not.*dropped)\b/,
  competitor_undercut:
    /\b(competitors?|prices|other sellers)\b.*\b(same|not|no)\b/,
  can_restock_partial:
    /\b(cant|cannot|unable|impossible|no cash|no money)\b.*\b(restock|stock|batch)?\b/,
};
export function supportsFact(
  fact: SellerFact,
  utterance: string,
  question?: QuestionId,
): boolean {
  if (!supportsQuote(fact.quote, utterance)) return false;
  if (fact.factId === 'can_restock_partial' && /\?/.test(fact.quote))
    return false;
  const text = normalizeEvidence(fact.quote);
  if (
    /^(yes|yeah|sure|okay|ok)\b/.test(text) &&
    /\b(but|not|no|dont|cannot|cant)\b/.test(normalizeEvidence(utterance))
  )
    return false;
  const answering =
    question !== undefined &&
    QUESTION_BANK[question].records.includes(fact.factId);
  if (fact.factId === 'restock_eta_days') {
    return (
      fact.value <= 365 &&
      (answering || /\b(days?|weeks?|restock|arrive)\b/.test(text)) &&
      (` ${text} `.includes(` ${String(fact.value)} `) ||
        ` ${text} `.includes(` ${spokenNumber(fact.value)} `)) &&
      !/\b(weeks?|months?|items|orders|rupees)\b/.test(text)
    );
  }
  if (fact.factId === 'restock_cause') {
    const patterns = {
      supplier_delay: /supplier.*\b(late|delay|delayed|waiting)\b/,
      cash_constraint: /\b(cash|money|funds)\b/,
      unaware: /\b(unaware|didnt know)\b/,
      other: /\b(other|another)\b/,
    };
    return patterns[fact.value].test(text);
  }
  if (fact.value === 'unknown')
    return (
      answering &&
      /\b(dont know|not sure|unknown|uncertain|cannot tell)\b/.test(text)
    );
  if (fact.value === 'partial' || fact.value === 'sometimes')
    return (
      (answering || /stock|dispatch|courier/.test(text)) &&
      /\b(partial|some|sometimes|occasionally|not all)\b/.test(text)
    );
  const negative = /\b(no|not|dont|doesnt|cant|cannot|never)\b/.test(text);
  if (fact.value === 'no')
    return (
      (answering && /^(no|not|cant|cannot|dont)\b/.test(text)) ||
      NEGATIVE[fact.factId]?.test(text) === true
    );
  return (
    !negative &&
    ((answering && /^(yes|yeah|sure|okay|ok|both|of course)\b/.test(text)) ||
      POSITIVE[fact.factId]?.test(text) === true)
  );
}
