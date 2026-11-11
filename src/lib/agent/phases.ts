import { AppError } from '@/lib/errors';
import { computeDiagnosis } from '@/lib/domain/diagnosis';
import type { Diagnosis, Phase, QuestionId } from '@/lib/domain/types';
import type { Session } from '@/lib/agent/session';
import { FUNCTION_DECLARATIONS } from '@/lib/agent/tool-contracts';
import type { ToolName } from '@/lib/agent/tool-contracts';
import type { ToolDeclaration } from '@/lib/llm/provider';
import type { DomainState } from '@/lib/domain/types';
import type { Language } from '@/lib/voice/language';

const TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  greeting: ['intake'],
  intake: ['findings'],
  findings: ['investigate'],
  investigate: ['recommend'],
  recommend: ['confirm', 'investigate'],
  confirm: ['commit', 'recommend'],
  commit: ['summary'],
  summary: ['done'],
  done: [],
};
const READ: readonly ToolName[] = [
  'get_seller_snapshot',
  'get_sku_breakdown',
  'get_cancellation_breakdown',
  'get_listing_funnel',
];
const TOOLS: Readonly<Record<Phase, readonly ToolName[]>> = {
  greeting: [],
  intake: ['get_seller_snapshot'],
  findings: READ,
  investigate: [...READ, 'record_seller_fact'],
  recommend: [...READ, 'propose_action_plan'],
  confirm: [...READ, 'commit_action_plan'],
  commit: [],
  summary: [],
  done: [],
};
export function hasSellerProblem(
  text: string,
  language: Language = 'en-IN',
): boolean {
  return (
    (language === 'hi-IN' && /बिक्री|ऑर्डर|स्टॉक|सेल|कारोबार/u.test(text)) ||
    /\b(sales?|orders?|stock|cancellations?|business|revenue|selling|dropped|decline)\b/i.test(
      text,
    )
  );
}
export function findingsComplete(session: Session): boolean {
  return [
    'get_seller_snapshot',
    'get_sku_breakdown',
    'get_cancellation_breakdown',
  ].every((name) => session.toolsCalled.has(name as ToolName));
}
export function transition(
  session: Session,
  next: Phase,
  diagnosis?: Diagnosis,
): void {
  if (!TRANSITIONS[session.phase].includes(next))
    throw new AppError(
      'TOOL_NOT_ALLOWED',
      'Conversation transition is not allowed',
    );
  if (
    session.phase === 'intake' &&
    !hasSellerProblem(session.lastUserText, session.lang)
  )
    throw new AppError(
      'TOOL_NOT_ALLOWED',
      'Identify the seller problem before findings',
    );
  if (session.phase === 'findings' && !findingsComplete(session))
    throw new AppError(
      'TOOL_NOT_ALLOWED',
      'Read snapshot, stock and cancellations before findings',
    );
  if (
    next === 'recommend' &&
    session.phase === 'investigate' &&
    !diagnosis?.readyToRecommend
  )
    throw new AppError('TOOL_NOT_ALLOWED', 'Investigation is not complete');
  if (next === 'confirm' && !session.proposedPlan)
    throw new AppError('TOOL_NOT_ALLOWED', 'Propose a valid plan first');
  if (next === 'commit' && !session.pendingCommit && !session.committedPlan)
    throw new AppError('COMMIT_REJECTED', 'Acceptance has not been verified');
  if (next === 'summary' && !session.committedPlan)
    throw new AppError(
      'COMMIT_REJECTED',
      'The ledger has not confirmed this plan',
    );
  session.phase = next;
}
export function toolAllowed(session: Session, name: ToolName): boolean {
  if (!TOOLS[session.phase].includes(name)) return false;
  if (
    session.phase === 'intake' &&
    !hasSellerProblem(session.lastUserText, session.lang)
  )
    return false;
  if (
    name !== 'get_seller_snapshot' &&
    !session.toolsCalled.has('get_seller_snapshot')
  )
    return false;
  return true;
}
export function phaseDeclarations(session: Session): ToolDeclaration[] {
  return FUNCTION_DECLARATIONS.filter((tool) =>
    toolAllowed(session, tool.name as ToolName),
  );
}
export function askQuestion(
  session: Session,
  id: QuestionId,
  state: DomainState,
): void {
  const diagnosis = computeDiagnosis(state);
  if (
    !findingsComplete(session) ||
    session.questionsAsked.length >= 3 ||
    session.questionsAsked.includes(id) ||
    diagnosis.suggestedNextQuestion !== id
  )
    throw new AppError(
      'TOOL_NOT_ALLOWED',
      'That question is not currently allowed',
    );
  session.questionsAsked.push(id);
}
