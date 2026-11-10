import type {
  SellerSnapshot,
  SkuData,
  CancellationData,
} from '@/lib/domain/data-schemas';
import type { Signal, SignalId } from '@/lib/domain/types';
import { DEFAULT_THRESHOLDS } from '@/lib/domain/settings';
import type { SignalThresholds } from '@/lib/domain/settings';
import {
  inventoryMetrics,
  cancellationMetrics,
} from '@/lib/domain/data-calculations';
import { percentChange, round } from '@/lib/domain/numbers';

interface SignalInput {
  seller: SellerSnapshot;
  skus?: SkuData;
  cancellations?: CancellationData;
}

function signal(
  id: SignalId,
  triggered: boolean,
  value: number | null,
  description: string,
): Signal {
  return {
    id,
    triggered,
    evidence: { source: 'data', id, value, description },
  };
}

export function signals(
  input: SignalInput,
  thresholds: SignalThresholds = DEFAULT_THRESHOLDS,
): Signal[] {
  const { last, this: current } = input.seller.periods;
  const orderChange = percentChange(last.orders, current.orders);
  const aspChange = percentChange(last.asp, current.asp);
  const cancelIncrease = round(
    (current.cancelRate - last.cancelRate) * 100,
    10,
  );
  const oosIncrease = current.oosProducts - last.oosProducts;
  const oosRatio =
    last.oosProducts === 0 ? null : current.oosProducts / last.oosProducts;
  const result = [
    signal(
      'S_ORDER_DROP',
      orderChange !== null && orderChange <= thresholds.orderDropPct,
      orderChange,
      `Gross placed orders changed by ${orderChange === null ? 'an unavailable percentage' : `${String(round(orderChange))} percent`}.`,
    ),
    signal(
      'S_ASP_FLAT',
      aspChange !== null && Math.abs(aspChange) <= thresholds.aspFlatPct,
      aspChange,
      `Average selling price changed by ${aspChange === null ? 'an unavailable percentage' : `${String(round(aspChange))} percent`}.`,
    ),
    signal(
      'S_OOS_SPIKE',
      current.oosProducts > last.oosProducts &&
        current.oosProducts >= last.oosProducts * thresholds.oosRatio &&
        oosIncrease >= thresholds.oosIncrease,
      oosRatio,
      `Out-of-stock listings changed from ${String(last.oosProducts)} to ${String(current.oosProducts)}, an increase of ${String(oosIncrease)}.`,
    ),
    signal(
      'S_CANCEL_UP',
      cancelIncrease >= thresholds.cancelIncreasePp,
      cancelIncrease,
      `The cancellation rate increased by ${String(round(cancelIncrease))} percentage points.`,
    ),
  ];
  if (input.skus) {
    const inventory = inventoryMetrics(input.seller, input.skus);
    result.push(
      signal(
        'S_SKU_CONCENTRATION',
        inventory.grossOrderDecline > 0 &&
          inventory.concentrationPct >= thresholds.concentrationPct,
        inventory.concentrationPct,
        `${String(inventory.oosCount)} zero-stock products explain ${String(round(inventory.concentrationPct))} percent of the gross placed-order decline (synthetic SKU data).`,
      ),
    );
  }
  if (input.cancellations) {
    const cancellations = cancellationMetrics(input.cancellations);
    result.push(
      signal(
        'S_CANCEL_STOCK_DOMINANT',
        cancellations.totalThis > 0 &&
          cancellations.stockPct >= thresholds.stockCancelPct,
        cancellations.stockPct,
        `Stock unavailable accounts for ${String(round(cancellations.stockPct))} percent of cancellations (synthetic reason data).`,
      ),
      signal(
        'S_CANCEL_DISPATCH_DOMINANT',
        cancellations.totalThis > 0 &&
          cancellations.dispatchPct >= thresholds.dispatchCancelPct,
        cancellations.dispatchPct,
        `Dispatch and courier issues account for ${String(round(cancellations.dispatchPct))} percent of cancellations (synthetic reason data).`,
      ),
    );
  }
  return result;
}
