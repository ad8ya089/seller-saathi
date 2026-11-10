import type { AppState } from '@/lib/client/app-state';
import type {
  DashboardReference,
  DashboardSnapshot,
} from '@/lib/client/dashboard-contracts';
import type { Hypothesis, SellerFact } from '@/lib/domain/types';

export const HYPOTHESIS_NAMES: Readonly<Record<Hypothesis, string>> = {
  STOCK: 'Stock availability',
  FULFIL: 'Dispatch and courier',
  VIS: 'Listing visibility',
  PRICE: 'Price competitiveness',
  DEMAND: 'Demand variation',
};
export const FACT_NAMES: Readonly<Record<SellerFact['factId'], string>> = {
  oos_confirmed: 'Best-seller stock',
  restock_cause: 'Restock constraint',
  restock_eta_days: 'Expected restock',
  dispatch_on_time: 'Dispatch on time',
  views_dropped: 'Product views down',
  competitor_undercut: 'Competitor undercutting',
  can_restock_partial: 'Partial restock possible',
};
export function referenceFor(
  snapshot: DashboardSnapshot | null,
  reference: DashboardReference | null,
): DashboardReference | null {
  return snapshot &&
    reference &&
    JSON.stringify(snapshot.seller) === JSON.stringify(reference.seller)
    ? reference
    : null;
}
export function questionProgress(state: AppState): {
  used: number | null;
  remaining: number | null;
  max: number | null;
} {
  const used =
    state.agent?.questionsAsked ??
    (state.maxQuestions !== null && state.snapshot
      ? state.maxQuestions - state.snapshot.questionsLeft
      : null);
  return {
    used,
    remaining:
      used !== null && state.maxQuestions !== null
        ? Math.max(0, state.maxQuestions - used)
        : null,
    max: state.maxQuestions,
  };
}
export interface EvidenceView {
  key: string;
  source: 'Data' | 'Seller said';
  text: string;
  contribution: string;
}
export function hypothesisEvidence(
  state: AppState,
  reference: DashboardReference | null,
  hypothesis: Hypothesis,
): EvidenceView[] {
  const current = referenceFor(state.snapshot, reference);
  if (!current) return [];
  // Presentation gating follows the server's completed-findings phase. Tool labels
  // alone do not prove a successful check and never authorize an evidence claim.
  const details =
    state.agent &&
    !['greeting', 'intake', 'findings'].includes(state.agent.phase);
  const data = current.dataEvidence.flatMap((item): EvidenceView[] => {
    const contribution = item.contributions.find(
      (entry) => entry.hypothesis === hypothesis,
    );
    return contribution && (!item.detailed || details)
      ? [
          {
            key: item.id,
            source: 'Data',
            text: item.description,
            contribution: contribution.contribution,
          },
        ]
      : [];
  });
  const seller = (state.agent?.facts ?? []).flatMap((fact): EvidenceView[] => {
    const contribution = current.factEvidence
      .find(
        (item) =>
          item.factId === fact.factId && item.value === String(fact.value),
      )
      ?.contributions.find((item) => item.hypothesis === hypothesis);
    return contribution
      ? [
          {
            key: fact.factId,
            source: 'Seller said',
            text: fact.quote,
            contribution: contribution.contribution,
          },
        ]
      : [];
  });
  return [...data, ...seller];
}
export function scoreGeometry(scores: readonly number[]): {
  min: number;
  max: number;
  bars: { left: number; width: number }[];
} {
  const min = Math.min(0, ...scores);
  const max = Math.max(0, ...scores);
  const span = max - min;
  return {
    min,
    max,
    bars: scores.map((score) => ({
      left: span ? ((Math.min(0, score) - min) / span) * 100 : 0,
      width: span ? (Math.abs(score) / span) * 100 : 0,
    })),
  };
}
export function effectWidth(value: number, effects: readonly number[]): number {
  const max = Math.max(...effects.map(Math.abs));
  return max ? (Math.abs(value) / max) * 100 : 0;
}
