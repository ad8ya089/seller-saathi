import { describe, expect, it } from 'vitest';
import { computeDiagnosis } from '@/lib/domain/diagnosis';
import type { DomainState } from '@/lib/domain/types';
import { fixture } from '../fixtures';

export function diagnosticState(): DomainState {
  return {
    snapshot: fixture.seller,
    skus: fixture.skus,
    cancellations: fixture.cancellations,
    toolsCalled: new Set([
      'get_seller_snapshot',
      'get_sku_breakdown',
      'get_cancellation_breakdown',
    ]),
    facts: {},
    questionsAsked: [],
  };
}

describe('composed diagnosis', () => {
  it('returns scores, evidence and the next question without changing state', () => {
    const state = diagnosticState();
    const before = structuredClone(state);
    expect(computeDiagnosis(state)).toMatchObject({
      hypotheses: [{ id: 'STOCK', score: 9, level: 'high' }, {}, {}, {}, {}],
      suggestedNextQuestion: 'Q_OOS_CONFIRM',
      questionsLeft: 3,
      readyToRecommend: false,
    });
    expect(computeDiagnosis(state).evidence).toHaveLength(6);
    expect(state).toEqual(before);
  });
  it('uses detail evidence only once its tool was called', () => {
    const state = diagnosticState();
    state.toolsCalled = new Set(['get_seller_snapshot']);
    expect(computeDiagnosis(state).hypotheses[0]?.score).toBe(4);
  });
  it('combines seller facts and readiness with the same scoring engine', () => {
    const state = diagnosticState();
    state.facts.oos_confirmed = {
      factId: 'oos_confirmed',
      value: 'yes',
      quote: 'yes',
      turn: 1,
    };
    state.questionsAsked = ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA'];
    expect(computeDiagnosis(state)).toMatchObject({
      hypotheses: [{ id: 'STOCK', score: 11 }, {}, {}, {}, {}],
      readyToRecommend: true,
      suggestedNextQuestion: null,
      questionsLeft: 1,
    });
  });
  it('never reports negative remaining questions', () => {
    const state = diagnosticState();
    state.questionsAsked = [
      'Q_OOS_CONFIRM',
      'Q_RESTOCK_ETA',
      'Q_DISPATCH',
      'Q_VIEWS',
    ];
    expect(computeDiagnosis(state).questionsLeft).toBe(0);
  });
});
