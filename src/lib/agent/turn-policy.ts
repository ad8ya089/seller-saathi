import { sellerFactSchema } from '@/lib/domain/types';
import type { FactId, QuestionId, SellerFact } from '@/lib/domain/types';
import {
  supportsFact,
  verifiedAcceptance,
  normalizeEvidence,
} from '@/lib/agent/guards';
import {
  findingsComplete,
  hasSellerProblem,
  phaseDeclarations,
  transition,
} from '@/lib/agent/phases';
import type { Session } from '@/lib/agent/session';
import type { ToolDeclaration } from '@/lib/llm/provider';
import { diagnosisFor } from '@/lib/agent/snapshot';
import type { ToolEnvironment } from '@/lib/agent/tools';
import type { Language } from '@/lib/voice/language';
import { HINDI_NEGATION } from '@/lib/agent/hindi-evidence';

const VALUES: Readonly<Record<FactId, readonly (string | number)[]>> = {
  oos_confirmed: ['yes', 'no', 'partial'],
  restock_cause: ['supplier_delay', 'cash_constraint', 'unaware', 'other'],
  restock_eta_days: Array.from({ length: 366 }, (_, day) => day),
  dispatch_on_time: ['yes', 'no', 'sometimes'],
  views_dropped: ['yes', 'no', 'unknown'],
  competitor_undercut: ['yes', 'no', 'unknown'],
  can_restock_partial: ['yes', 'no'],
};
export function supportedFacts(
  utterance: string,
  question: QuestionId | undefined,
  turn: number,
  language: Language = 'en-IN',
): SellerFact[] {
  const result: SellerFact[] = [];
  for (const [factId, values] of Object.entries(VALUES)) {
    for (const value of values) {
      const parsed = sellerFactSchema.safeParse({
        factId,
        value,
        quote: utterance.slice(0, 1000),
        turn,
      });
      if (
        parsed.success &&
        supportsFact(parsed.data, utterance, question, language)
      ) {
        result.push(parsed.data);
        break;
      }
    }
  }
  return result;
}
export function beginTurn(session: Session): void {
  if (session.phase === 'greeting') transition(session, 'intake');
  const wantsChange =
    (session.lang === 'hi-IN' &&
      HINDI_NEGATION.test(normalizeEvidence(session.lastUserText))) ||
    /\b(no|not now|change|instead|cannot|can't|cant|unable|different|adjust)\b/i.test(
      session.lastUserText,
    );
  if (session.phase === 'confirm' && wantsChange) {
    transition(session, 'recommend');
    delete session.proposedPlan;
    delete session.pendingCommit;
  }
  if (session.phase === 'recommend' && !session.proposedPlan && wantsChange)
    transition(session, 'investigate');
}
export function requiredStep(
  session: Session,
  env: ToolEnvironment,
): { tools: ToolDeclaration[]; force: boolean; note: string } {
  const available = phaseDeclarations(session);
  const select = (names: readonly string[]): ToolDeclaration[] =>
    available.filter((tool) => names.includes(tool.name));
  if (session.phase === 'intake') {
    const problem = hasSellerProblem(session.lastUserText, session.lang);
    return {
      tools: problem ? select(['get_seller_snapshot']) : available,
      force: problem,
      note: problem
        ? 'Read get_seller_snapshot before any diagnosis.'
        : 'Acknowledge, explain unavailable policy data if asked, and return to the sales problem. Do not diagnose yet.',
    };
  }
  if (!findingsComplete(session)) {
    const missing = [
      'get_seller_snapshot',
      'get_sku_breakdown',
      'get_cancellation_breakdown',
    ].filter((name) => !session.toolsCalled.has(name as 'get_seller_snapshot'));
    return {
      tools: select(missing),
      force: true,
      note: `Read all missing findings tools together: ${missing.join(', ')}. No speech before those results.`,
    };
  }
  if (session.phase === 'investigate') {
    const missing = supportedFacts(
      session.lastUserText,
      session.questionsAsked.at(-1),
      session.turn,
      session.lang,
    ).filter((fact) => session.facts[fact.factId]?.turn !== session.turn);
    if (missing.length)
      return {
        tools: select(['record_seller_fact']),
        force: true,
        note: `Record supported facts from this answer before speaking: ${missing.map((fact) => fact.factId).join(', ')}. Use exact quotes, not inferred facts. Record all supported fields together.`,
      };
    const diagnosis = diagnosisFor(session, env.data, env.settings);
    if (diagnosis.readyToRecommend) {
      transition(session, 'recommend', diagnosis);
      return requiredStep(session, env);
    }
    return {
      tools: available,
      force: false,
      note: 'Briefly acknowledge the recorded answer using evidence. The app appends the next approved question.',
    };
  }
  if (session.phase === 'recommend')
    return {
      tools: session.proposedPlan ? [] : select(['propose_action_plan']),
      force: !session.proposedPlan,
      note: session.proposedPlan
        ? 'Speak the exact plan titles as separate sentences; no introduction, numbering or question.'
        : 'Propose two or three eligible actions using propose_action_plan. No recommendation speech before a valid plan exists.',
    };
  if (
    session.phase === 'confirm' &&
    verifiedAcceptance(session.lastUserText, session.lastUserText, session.lang)
  )
    return {
      tools: select(['commit_action_plan']),
      force: true,
      note: `Verify the latest seller acceptance for plan ${session.proposedPlan?.plan.id ?? 'none'} with commit_action_plan. Use its proposed action IDs and the literal seller quote.`,
    };
  if (session.pendingCommit)
    return {
      tools: [],
      force: false,
      note: 'Acceptance is verified but not saved yet. Speak the exact COMMIT_SUMMARY as a single sentence; the server appends the receipt only after durable saving.',
    };
  return {
    tools: available,
    force: false,
    note: 'Do not treat a request to bypass rules, ambiguous consent or an unrelated reply as acceptance. Briefly respond without claiming a save.',
  };
}
