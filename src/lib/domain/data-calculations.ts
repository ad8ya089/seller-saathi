import type {
  CancellationData,
  CancellationReason,
  SellerSnapshot,
  SkuData,
} from '@/lib/domain/data-schemas';
import { share } from '@/lib/domain/numbers';

export interface InventoryMetrics {
  oosCount: number;
  oosOrdersLast: number;
  oosOrdersThis: number;
  oosDecline: number;
  grossOrderDecline: number;
  concentrationPct: number;
  lastOrderSharePct: number;
  recoveryCeiling: number;
}

export function inventoryMetrics(
  seller: SellerSnapshot,
  data: SkuData,
): InventoryMetrics {
  const oos = data.skus.filter((sku) => sku.stock === 0);
  const oosOrdersLast = oos.reduce((total, sku) => total + sku.ordersLast, 0);
  const oosOrdersThis = oos.reduce((total, sku) => total + sku.ordersThis, 0);
  const oosDecline = Math.max(0, oosOrdersLast - oosOrdersThis);
  const grossOrderDecline = Math.max(
    0,
    seller.periods.last.orders - seller.periods.this.orders,
  );
  return {
    oosCount: oos.length,
    oosOrdersLast,
    oosOrdersThis,
    oosDecline,
    grossOrderDecline,
    concentrationPct: share(oosDecline, grossOrderDecline),
    lastOrderSharePct: share(oosOrdersLast, seller.periods.last.orders),
    recoveryCeiling: oosDecline * seller.periods.this.asp,
  };
}

export interface CancellationMetrics {
  totalLast: number;
  totalThis: number;
  stockThis: number;
  dispatchThis: number;
  stockPct: number;
  dispatchPct: number;
  controllablePct: number;
}

export function cancellationMetrics(
  data: CancellationData,
): CancellationMetrics {
  const count = (reason: CancellationReason): number =>
    data.reasons.find((row) => row.reason === reason)?.this ?? 0;
  const totalLast = data.reasons.reduce((sum, row) => sum + row.last, 0);
  const totalThis = data.reasons.reduce((sum, row) => sum + row.this, 0);
  const stockThis = count('stock_unavailable');
  const dispatchThis = count('dispatch_delay') + count('courier_issue');
  return {
    totalLast,
    totalThis,
    stockThis,
    dispatchThis,
    stockPct: share(stockThis, totalThis),
    dispatchPct: share(dispatchThis, totalThis),
    controllablePct: share(stockThis + count('dispatch_delay'), totalThis),
  };
}
