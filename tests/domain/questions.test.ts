import { describe, expect, it } from 'vitest';
import {
  QUESTION_BANK,
  pickNextQuestion,
  readyToRecommend,
} from '@/lib/domain/questions';
import { scoreHypotheses } from '@/lib/domain/hypotheses';
import type { HypothesisScore, InvestigationState } from '@/lib/domain/types';

const hypotheses: HypothesisScore[] = [
  { id: 'STOCK', score: 9, level: 'high' },
  { id: 'VIS', score: 1, level: 'low' },
  { id: 'FULFIL', score: 0, level: 'low' },
  { id: 'DEMAND', score: 0, level: 'low' },
  { id: 'PRICE', score: -1, level: 'low' },
];
function state(
  overrides: Partial<InvestigationState> = {},
): InvestigationState {
  return { facts: {}, questionsAsked: [], hypotheses, ...overrides };
}

describe('investigation questions', () => {
  it('asks stock confirmation then restock ETA and becomes ready', () => {
    expect(pickNextQuestion(state())).toBe('Q_OOS_CONFIRM');
    const confirmed = state({
      facts: {
        oos_confirmed: {
          factId: 'oos_confirmed',
          value: 'yes',
          quote: 'yes',
          turn: 1,
        },
      },
      questionsAsked: ['Q_OOS_CONFIRM'],
    });
    expect(pickNextQuestion(confirmed)).toBe('Q_RESTOCK_ETA');
    confirmed.questionsAsked = ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA'];
    expect(readyToRecommend(confirmed)).toBe(true);
    expect(pickNextQuestion(confirmed)).toBeNull();
  });
  it('asks dispatch after a stock denial while retaining data scores', () => {
    const denied = state({
      facts: {
        oos_confirmed: {
          factId: 'oos_confirmed',
          value: 'no',
          quote: 'stock is fine',
          turn: 1,
        },
      },
      questionsAsked: ['Q_OOS_CONFIRM'],
    });
    expect(pickNextQuestion(denied)).toBe('Q_DISPATCH');
  });
  it('asks capacity before recommending when the seller cannot restock', () => {
    const unable = state({
      facts: {
        can_restock_partial: {
          factId: 'can_restock_partial',
          value: 'no',
          quote: 'I cannot restock',
          turn: 2,
        },
      },
      questionsAsked: ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA'],
    });
    expect(readyToRecommend(unable)).toBe(false);
    expect(pickNextQuestion(unable)).toBe('Q_CAPACITY');
    unable.questionsAsked = [...unable.questionsAsked, 'Q_CAPACITY'];
    expect(readyToRecommend(unable)).toBe(true);
    expect(pickNextQuestion(unable)).toBeNull();
  });
  it.each([
    ['FULFIL', 'Q_DISPATCH'],
    ['VIS', 'Q_VIEWS'],
    ['PRICE', 'Q_UNDERCUT'],
  ] as const)(
    'asks the relevant question for leading %s evidence',
    (id, expected) => {
      expect(
        pickNextQuestion(
          state({ hypotheses: [{ id, score: 5, level: 'high' }] }),
        ),
      ).toBe(expected);
    },
  );
  it('uses the second hypothesis before the views fallback', () => {
    const investigated = state({
      questionsAsked: ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA'],
      hypotheses: [
        { id: 'STOCK', score: 4, level: 'high' },
        { id: 'FULFIL', score: 3, level: 'medium' },
      ],
    });
    expect(pickNextQuestion(investigated)).toBe('Q_DISPATCH');
    investigated.hypotheses = scoreHypotheses([]);
    expect(pickNextQuestion(investigated)).toBe('Q_VIEWS');
  });
  it('never repeats an unanswered question, including unknown views', () => {
    expect(pickNextQuestion(state({ questionsAsked: ['Q_OOS_CONFIRM'] }))).toBe(
      'Q_RESTOCK_ETA',
    );
    const unknown = state({
      hypotheses: [{ id: 'VIS', score: 3, level: 'medium' }],
      facts: {
        views_dropped: {
          factId: 'views_dropped',
          value: 'unknown',
          quote: 'I do not know',
          turn: 1,
        },
      },
      questionsAsked: ['Q_VIEWS'],
    });
    expect(pickNextQuestion(unknown)).toBeNull();
  });
  it('stops at three regardless of a tie, and uses the exact readiness margin', () => {
    const tied = state({
      hypotheses: scoreHypotheses([]),
      questionsAsked: ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA', 'Q_VIEWS'],
    });
    expect(pickNextQuestion(tied)).toBeNull();
    expect(readyToRecommend(tied)).toBe(true);
    tied.questionsAsked = ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA'];
    expect(readyToRecommend(tied)).toBe(false);
    tied.hypotheses = [
      { id: 'STOCK', score: 4, level: 'high' },
      { id: 'VIS', score: 1, level: 'low' },
    ];
    expect(readyToRecommend(tied)).toBe(true);
  });
  it('keeps the complete documented bank within twenty words per question', () => {
    expect(Object.keys(QUESTION_BANK)).toHaveLength(6);
    for (const question of Object.values(QUESTION_BANK))
      expect(question.text.split(/\s+/).length).toBeLessThanOrEqual(20);
  });
});
