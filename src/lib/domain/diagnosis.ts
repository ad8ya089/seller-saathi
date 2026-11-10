import type { Diagnosis, DomainState, Evidence } from '@/lib/domain/types';
import { signals } from '@/lib/domain/signals';
import { scoreHypotheses } from '@/lib/domain/hypotheses';
import { pickNextQuestion, readyToRecommend } from '@/lib/domain/questions';
import {
  DEFAULT_INVESTIGATION_POLICY,
  DEFAULT_THRESHOLDS,
} from '@/lib/domain/settings';
import type {
  InvestigationPolicy,
  SignalThresholds,
} from '@/lib/domain/settings';

export function computeDiagnosis(
  state: DomainState,
  thresholds: SignalThresholds = DEFAULT_THRESHOLDS,
  policy: InvestigationPolicy = DEFAULT_INVESTIGATION_POLICY,
): Diagnosis {
  const computedSignals = signals(
    {
      seller: state.snapshot,
      ...(state.toolsCalled.has('get_sku_breakdown') && state.skus
        ? { skus: state.skus }
        : {}),
      ...(state.toolsCalled.has('get_cancellation_breakdown') &&
      state.cancellations
        ? { cancellations: state.cancellations }
        : {}),
    },
    thresholds,
  );
  const evidence: Evidence[] = [
    ...computedSignals
      .filter((signal) => signal.triggered)
      .map((signal) => signal.evidence),
    ...Object.values(state.facts).map((fact): Evidence => ({
      source: 'seller',
      fact,
    })),
  ];
  const hypotheses = scoreHypotheses(evidence);
  const investigation = {
    facts: state.facts,
    questionsAsked: state.questionsAsked,
    hypotheses,
  };
  return {
    signals: computedSignals,
    hypotheses,
    evidence,
    suggestedNextQuestion: pickNextQuestion(investigation, policy),
    questionsLeft: Math.max(
      0,
      policy.maxQuestions - state.questionsAsked.length,
    ),
    readyToRecommend: readyToRecommend(investigation, policy),
  };
}
