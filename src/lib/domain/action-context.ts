import { computeDiagnosis } from '@/lib/domain/diagnosis';
import {
  cancellationMetrics,
  inventoryMetrics,
} from '@/lib/domain/data-calculations';
import type {
  CancellationMetrics,
  InventoryMetrics,
} from '@/lib/domain/data-calculations';
import type { DomainState, Hypothesis, SellerFacts } from '@/lib/domain/types';
import type { z } from 'zod';
import type { skuSchema } from '@/lib/domain/data-schemas';

export const ACTION_POLICY = {
  healthyStockMin: 10,
  stockSyncMinSharePct: 30,
  weeklyStockCancelTarget: 3,
  weeklyDispatchCancelTarget: 2,
  followUpDays: 7,
  priceComparisons: 3,
  delayedRestockDays: 7,
  delayedRestockFeasibility: 0.95,
  cashConstraintFeasibility: 0.5,
} as const;

export interface ActionContext {
  scores: ReadonlyMap<Hypothesis, number>;
  facts: SellerFacts;
  inventory: InventoryMetrics | null;
  cancellations: CancellationMetrics | null;
  healthyHeroes: z.infer<typeof skuSchema>[];
  oosProducts: z.infer<typeof skuSchema>[];
}

export function actionContext(state: DomainState): ActionContext {
  const skus = state.toolsCalled.has('get_sku_breakdown')
    ? state.skus
    : undefined;
  const cancellations = state.toolsCalled.has('get_cancellation_breakdown')
    ? state.cancellations
    : undefined;
  return {
    scores: new Map(
      computeDiagnosis(state).hypotheses.map((hypothesis) => [
        hypothesis.id,
        hypothesis.score,
      ]),
    ),
    facts: state.facts,
    inventory: skus ? inventoryMetrics(state.snapshot, skus) : null,
    cancellations: cancellations ? cancellationMetrics(cancellations) : null,
    healthyHeroes:
      skus?.skus
        .filter(
          (sku) =>
            sku.stock >= ACTION_POLICY.healthyStockMin && sku.ordersThis > 0,
        )
        .sort((left, right) => right.ordersThis - left.ordersThis) ?? [],
    oosProducts:
      skus?.skus
        .filter((sku) => sku.stock === 0)
        .sort((left, right) => right.ordersLast - left.ordersLast) ?? [],
  };
}
