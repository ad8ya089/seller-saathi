import { bridge, netBridge } from '@/lib/domain/metrics';
import { computeDiagnosis } from '@/lib/domain/diagnosis';
import {
  inventoryMetrics,
  cancellationMetrics,
} from '@/lib/domain/data-calculations';
import { evaluateActions } from '@/lib/domain/actions';
import {
  spokenMoney,
  spokenNumber,
  spokenPercent,
} from '@/lib/domain/spoken-numbers';
import { domainState } from '@/lib/agent/session';
import type { Session } from '@/lib/agent/session';
import type { SellerData } from '@/lib/domain/data-schemas';
import type { AppConfig } from '@/lib/server/config';
import { DEFAULT_THRESHOLDS } from '@/lib/domain/settings';

export type DomainSettings = Pick<AppConfig, 'thresholds' | 'investigation'>;
export function diagnosisFor(
  session: Session,
  data: SellerData,
  settings?: DomainSettings,
): ReturnType<typeof computeDiagnosis> {
  const diagnosis = computeDiagnosis(
    domainState(session, data),
    settings?.thresholds,
    settings?.investigation,
  );
  session.hypotheses = diagnosis.hypotheses;
  return diagnosis;
}
export function spokenEvidence(session: Session, data: SellerData): string[] {
  if (!session.toolsCalled.has('get_seller_snapshot')) return [];
  const { last, this: current } = data.seller.periods;
  const evidence = [
    `Sales fell from ${spokenMoney(last.sales)} to ${spokenMoney(current.sales)}.`,
    'Average prices stayed the same.',
  ];
  if (session.toolsCalled.has('get_sku_breakdown')) {
    const inventory = inventoryMetrics(data.seller, data.skus);
    evidence.push(
      `${spokenNumber(inventory.oosCount)} out of stock products account for ${spokenPercent(inventory.concentrationPct)} of the lost orders.`,
    );
  }
  if (session.toolsCalled.has('get_cancellation_breakdown')) {
    const cancels = cancellationMetrics(data.cancellations);
    evidence.push(
      `${spokenPercent(cancels.stockPct)} of cancellations were because stock was unavailable.`,
    );
    if (cancels.stockPct >= DEFAULT_THRESHOLDS.stockCancelPct)
      evidence.push(
        `Sales fell from ${spokenMoney(last.sales)} to ${spokenMoney(current.sales)}, and stock shortages dominate cancellations.`,
      );
  }
  return evidence;
}
export function sellerSnapshot(
  session: Session,
  data: SellerData,
  settings?: DomainSettings,
): Record<string, unknown> {
  const diagnosis = diagnosisFor(session, data, settings);
  return {
    seller: data.seller,
    bridge: bridge(data.seller),
    netBridge: netBridge(data.seller),
    ...diagnosis,
    eligibleActions: evaluateActions(
      domainState(session, data),
      settings,
    ).filter((action) => action.eligible),
    spokenEvidence: spokenEvidence(session, data),
  };
}
