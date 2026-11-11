import { auditRowSchema } from '@/lib/domain/followup-types';
import type { AuditRow } from '@/lib/domain/followup-types';
import type { CommittedPlan } from '@/lib/domain/plan';
import type { FollowupData } from '@/lib/domain/data-schemas';
import type { SellerActionId } from '@/lib/domain/types';

const ALIASES: Readonly<Record<SellerActionId, RegExp>> = {
  A_RESTOCK_TOP: /\b(restock|restocking|stock mangana)\b|रीस्टॉक/u,
  A_STOCK_SYNC: /\b(stock sync|panel stock|stock milana)\b|स्टॉक सिंक/u,
  A_PUSH_INSTOCK: /\b(promot\w*|push in.?stock|photos|titles)\b|प्रमोशन/u,
  A_DISPATCH_SLA: /\b(dispatch|handover|packing)\b|डिस्पैच/u,
  A_VISIBILITY_AUDIT: /\b(visibility|views|listing audit)\b|व्यूज/u,
  A_PRICE_CHECK: /\b(price check|price comparison|prices compare)\b|कीमत/u,
};
export function auditActions(
  original: CommittedPlan,
  data: FollowupData,
): AuditRow[] {
  return original.plan.actions
    .filter((action) => original.acceptedActionIds.includes(action.id))
    .map((action) =>
      auditRowSchema.parse({
        id: action.id,
        title: action.title,
        status: data.actionStatus[action.id] ?? 'not_available',
        source: 'sample',
      }),
    );
}
export function correctAudit(
  rows: readonly AuditRow[],
  quote: string,
): AuditRow[] {
  // Literal declarative corrections only. Instructions, questions and conditional reports
  // cannot promote sample evidence into seller-reported completion.
  if (
    /[?？]|\b(ignore|pretend|mark|set|override|rules|if|unless|maybe|would|should|will|agar|shayad|maan lo|dikhao)\b|अगर|शायद|मान लो|दिखाओ/i.test(
      quote,
    )
  )
    return [...rows];
  const clauses = quote.toLowerCase().split(/[.;।]|\b(?:but|and|lekin|aur)\b/u);
  return rows.map((row) => {
    const matches = clauses.filter(
      (clause) =>
        ALIASES[row.id].test(clause) &&
        rows.filter((other) => ALIASES[other.id].test(clause)).length === 1,
    );
    const statuses = matches
      .map((clause): AuditRow['status'] | undefined => {
        if (
          /\b(not (?:yet )?(?:done|completed)|never (?:been )?(?:done|completed)|pending|nahi hua|nahi kiya)\b|नहीं हुआ|नहीं किया/u.test(
            clause,
          )
        )
          return 'not_done';
        if (
          /\b(not|never|no|cannot|can't|don't|hasn't|haven't|nahi|nahin)\b|नहीं/u.test(
            clause,
          )
        )
          return undefined;
        if (
          /\b(partial|partly|partially|aadha|almost|nearly)\b|आधा/u.test(clause)
        )
          return 'partial';
        if (
          /\b(done|completed|finished|ho gaya|kar diya)\b|हो गया|कर दिया/u.test(
            clause,
          )
        )
          return 'done';
        return undefined;
      })
      .filter((status) => status !== undefined);
    if (!statuses.length || new Set(statuses).size !== 1) return row;
    return auditRowSchema.parse({
      ...row,
      status: statuses[0],
      source: 'seller_reported',
      quote,
    });
  });
}
