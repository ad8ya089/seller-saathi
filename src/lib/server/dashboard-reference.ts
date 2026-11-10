import 'server-only';
import { signals } from '@/lib/domain/signals';
import { EVIDENCE_WEIGHTS, FACT_WEIGHTS } from '@/lib/domain/hypotheses';
import { QUESTION_BANK } from '@/lib/domain/questions';
import { percentChange } from '@/lib/domain/numbers';
import { hypothesisSchema } from '@/lib/domain/types';
import type { Hypothesis } from '@/lib/domain/types';
import type { SellerData } from '@/lib/domain/data-schemas';
import type { DomainSettings } from '@/lib/agent/snapshot';
import { dashboardReferenceSchema } from '@/lib/client/dashboard-contracts';
import type { DashboardReference } from '@/lib/client/dashboard-contracts';
import { signedNumber } from '@/lib/client/format';

// Read-only presentation metadata. The browser never imports policy/weight tables.
// Live rankings and facts continue to come exclusively from the P3 stream.
export function dashboardReference(
  data: SellerData,
  settings?: DomainSettings,
): DashboardReference {
  const contributions = (
    weights: Readonly<Partial<Record<Hypothesis, number>>>,
  ): { hypothesis: Hypothesis; contribution: string }[] =>
    hypothesisSchema.options.flatMap((hypothesis) => {
      const value = weights[hypothesis];
      return value === undefined
        ? []
        : [{ hypothesis, contribution: signedNumber(value) }];
    });
  const { last, this: current } = data.seller.periods;
  return dashboardReferenceSchema.parse({
    seller: data.seller,
    deltas: {
      orders: percentChange(last.orders, current.orders),
      sales: percentChange(last.sales, current.sales),
      asp: percentChange(last.asp, current.asp),
      oos: current.oosProducts - last.oosProducts,
      cancelPoints: (current.cancelRate - last.cancelRate) * 100,
    },
    dataEvidence: signals(
      {
        seller: data.seller,
        skus: data.skus,
        cancellations: data.cancellations,
      },
      settings?.thresholds,
    )
      .filter((signal) => signal.triggered)
      .map((signal) => ({
        id: signal.id,
        description: signal.evidence.description,
        detailed: [
          'S_SKU_CONCENTRATION',
          'S_CANCEL_STOCK_DOMINANT',
          'S_CANCEL_DISPATCH_DOMINANT',
        ].includes(signal.id),
        contributions: contributions(EVIDENCE_WEIGHTS[signal.id]),
      })),
    factEvidence: Object.entries(FACT_WEIGHTS).flatMap(([factId, values]) =>
      Object.entries(values).map(([value, weights]) => ({
        factId,
        value,
        contributions: contributions(weights),
      })),
    ),
    questions: Object.fromEntries(
      Object.entries(QUESTION_BANK).map(([id, question]) => [
        id,
        question.text,
      ]),
    ),
  });
}
