import type { Language } from '@/lib/voice/language';
import type { FollowupView } from '@/lib/domain/followup-types';
import type { ActionPlan } from '@/lib/domain/plan';
import { spokenNumber } from '@/lib/domain/spoken-numbers';
import { spokenActionTitles } from '@/lib/domain/plan-speech';
import { ACTION_POLICY } from '@/lib/domain/action-context';

export function followupGreeting(
  windowDays: number,
  lang: Language,
  resumed = false,
): string {
  const days = spokenNumber(windowDays);
  if (lang === 'hi-IN')
    return resumed
      ? `Main aapka AI Virtual Account Manager hoon; yeh ${days} din ka simulated review hai. Audit record ho chuka hai; illustrative data se agle steps review karenge.`
      : `Main aapka AI Virtual Account Manager hoon; ${days} din ke simulated review mein illustrative data se complete, partial aur pending kaam check karenge. Kya audit sahi hai, ya feasibility badli hai?`;
  return resumed
    ? `I'm your AI Virtual Account Manager, returning to this simulated ${days} day review. The audit is recorded; we will review next steps using illustrative sample data.`
    : `I'm your AI Virtual Account Manager; this simulated ${days} day review uses illustrative data to check complete, partial and pending commitments. Does the audit match your work, or has anything become infeasible?`;
}
export function followupSpeech(
  view: FollowupView,
  plan: ActionPlan | undefined,
  lang: Language,
): string[] {
  const pace = spokenNumber(view.rolling7.ordersPerDay);
  const baseline = spokenNumber(view.baselineOrdersPerDay);
  const cancel = spokenNumber(Math.round(view.rolling7.cancelRate * 1000) / 10);
  const days = spokenNumber(ACTION_POLICY.followUpDays);
  const titles = plan ? spokenActionTitles(plan, lang) : [];
  if (lang === 'hi-IN')
    return [
      `Illustrative data mein daily orders ${baseline} se ${pace} hain aur cancellation rate ${cancel} percent hai; actions ka causal asar prove nahi hota.`,
      ...(titles.length
        ? titles.map((title) => `${title.replace(/[.!?।]+$/, '')}.`)
        : [
            'Abhi feasible aur eligible naya seller action nahi hai; koi plan save nahi hua.',
          ]),
      titles.length
        ? `Yeh naye steps save karun aur ${days} din baad review rakhein?`
        : `${days} din baad stock aur feasibility dobara review karenge.`,
    ];
  return [
    `Illustrative daily orders are ${pace} versus ${baseline}, with cancellations at ${cancel} percent; this does not prove the actions caused improvement.`,
    ...(titles.length
      ? titles.map((title) => `${title.replace(/[.!?।]+$/, '')}.`)
      : [
          'No further seller action is currently feasible and eligible; no new plan is saved.',
        ]),
    titles.length
      ? `Shall I save these new steps for review in ${days} days?`
      : `Review stock and feasibility again in ${days} days.`,
  ];
}
