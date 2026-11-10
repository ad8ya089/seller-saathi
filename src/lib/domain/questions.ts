import type {
  FactId,
  Hypothesis,
  InvestigationState,
  QuestionId,
} from '@/lib/domain/types';
import { margin, rankHypotheses } from '@/lib/domain/hypotheses';
import { DEFAULT_INVESTIGATION_POLICY } from '@/lib/domain/settings';
import type { InvestigationPolicy } from '@/lib/domain/settings';

interface Question {
  text: string;
  records: readonly FactId[];
}
export const QUESTION_BANK: Readonly<Record<QuestionId, Question>> = {
  Q_OOS_CONFIRM: {
    text: 'I see your cotton kurti set and saree are out of stock. Are those your regular best-sellers?',
    records: ['oos_confirmed'],
  },
  Q_RESTOCK_ETA: {
    text: 'When do you expect fresh stock to arrive?',
    records: ['restock_eta_days', 'restock_cause'],
  },
  Q_DISPATCH: {
    text: 'Are your orders being packed and handed to the courier on time?',
    records: ['dispatch_on_time'],
  },
  Q_VIEWS: {
    text: 'In your seller panel, have product views gone down compared to last month?',
    records: ['views_dropped'],
  },
  Q_UNDERCUT: {
    text: 'Have other sellers recently cut prices on similar items?',
    records: ['competitor_undercut'],
  },
  Q_CAPACITY: {
    text: 'Even a small restock batch this week — is that possible?',
    records: ['can_restock_partial'],
  },
};
const HYPOTHESIS_QUESTIONS: Readonly<Partial<Record<Hypothesis, QuestionId>>> =
  {
    FULFIL: 'Q_DISPATCH',
    VIS: 'Q_VIEWS',
    PRICE: 'Q_UNDERCUT',
  };

function mandatoryQuestion(state: InvestigationState): QuestionId | null {
  if (
    state.facts.can_restock_partial?.value === 'no' &&
    !state.questionsAsked.includes('Q_CAPACITY')
  )
    return 'Q_CAPACITY';
  if (
    state.facts.oos_confirmed?.value === 'no' &&
    !state.facts.dispatch_on_time &&
    !state.questionsAsked.includes('Q_DISPATCH')
  )
    return 'Q_DISPATCH';
  return null;
}

export function readyToRecommend(
  state: InvestigationState,
  policy: InvestigationPolicy = DEFAULT_INVESTIGATION_POLICY,
): boolean {
  if (state.questionsAsked.length >= policy.maxQuestions) return true;
  return (
    mandatoryQuestion(state) === null &&
    state.questionsAsked.length >= policy.minQuestions &&
    margin(state.hypotheses) >= policy.readinessMargin
  );
}

function available(id: QuestionId, state: InvestigationState): boolean {
  if (state.questionsAsked.includes(id)) return false;
  const primaryFact = QUESTION_BANK[id].records[0];
  return primaryFact !== undefined && state.facts[primaryFact] === undefined;
}

export function pickNextQuestion(
  state: InvestigationState,
  policy: InvestigationPolicy = DEFAULT_INVESTIGATION_POLICY,
): QuestionId | null {
  if (
    state.questionsAsked.length >= policy.maxQuestions ||
    readyToRecommend(state, policy)
  )
    return null;
  const mandatory = mandatoryQuestion(state);
  if (mandatory) return mandatory;
  const [top, second] = rankHypotheses(state.hypotheses);
  const candidates: QuestionId[] = [];
  if (top?.id === 'STOCK') {
    candidates.push('Q_OOS_CONFIRM');
    if (state.facts.can_restock_partial?.value !== 'no')
      candidates.push('Q_RESTOCK_ETA');
  } else if (top) {
    const question = HYPOTHESIS_QUESTIONS[top.id];
    if (question) candidates.push(question);
  }
  if (second && second.score >= 2) {
    const question = HYPOTHESIS_QUESTIONS[second.id];
    if (question) candidates.push(question);
  }
  candidates.push('Q_VIEWS');
  return candidates.find((question) => available(question, state)) ?? null;
}
