import { hypothesisSchema } from '@/lib/domain/types';
import type {
  Evidence,
  FactId,
  Hypothesis,
  HypothesisScore,
  SellerFact,
  SignalId,
} from '@/lib/domain/types';

type Weights = Readonly<Partial<Record<Hypothesis, number>>>;
export const EVIDENCE_WEIGHTS: Readonly<Record<SignalId, Weights>> = {
  S_ORDER_DROP: { STOCK: 1, VIS: 1, DEMAND: 1 },
  S_ASP_FLAT: { PRICE: -1 },
  S_OOS_SPIKE: { STOCK: 2 },
  S_CANCEL_UP: { STOCK: 1, FULFIL: 1 },
  S_SKU_CONCENTRATION: { STOCK: 3, DEMAND: -1 },
  S_CANCEL_STOCK_DOMINANT: { STOCK: 2, FULFIL: -1 },
  S_CANCEL_DISPATCH_DOMINANT: { FULFIL: 2 },
};
export const FACT_WEIGHTS: Readonly<
  Partial<Record<FactId, Readonly<Record<string, Weights>>>>
> = {
  oos_confirmed: { yes: { STOCK: 2 }, no: { STOCK: -2 } },
  dispatch_on_time: {
    no: { FULFIL: 3 },
    sometimes: { FULFIL: 1 },
    yes: { FULFIL: -1.5 },
  },
  views_dropped: { yes: { VIS: 3 }, no: { VIS: -1.5 } },
  competitor_undercut: { yes: { PRICE: 3 }, no: { PRICE: -1 } },
};

export function confidence(score: number): HypothesisScore['level'] {
  return score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
}

export function rankHypotheses(
  hypotheses: readonly HypothesisScore[],
): HypothesisScore[] {
  return [...hypotheses].sort(
    (left, right) =>
      right.score - left.score ||
      hypothesisSchema.options.indexOf(left.id) -
        hypothesisSchema.options.indexOf(right.id),
  );
}

export function scoreHypotheses(
  evidence: readonly Evidence[],
): HypothesisScore[] {
  const data = new Set<SignalId>();
  const facts = new Map<FactId, SellerFact>();
  for (const item of evidence) {
    if (item.source === 'data') data.add(item.id);
    else {
      const previous = facts.get(item.fact.factId);
      if (!previous || previous.turn <= item.fact.turn)
        facts.set(item.fact.factId, item.fact);
    }
  }
  const rows: Weights[] = [
    ...[...data].map((id) => EVIDENCE_WEIGHTS[id]),
    ...[...facts.values()].map(
      (fact) => FACT_WEIGHTS[fact.factId]?.[String(fact.value)] ?? {},
    ),
  ];
  return rankHypotheses(
    hypothesisSchema.options.map((id) => {
      const score = rows.reduce(
        (total, weights) => total + (weights[id] ?? 0),
        0,
      );
      return { id, score, level: confidence(score) };
    }),
  );
}

export function margin(hypotheses: readonly HypothesisScore[]): number {
  const [first, second] = rankHypotheses(hypotheses);
  return first && second ? first.score - second.score : 0;
}
