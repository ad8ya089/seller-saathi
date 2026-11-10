import type { SellerSnapshot } from '@/lib/domain/data-schemas';
import { percentChange, round, share } from '@/lib/domain/numbers';

export interface SalesBridge {
  salesDelta: number;
  pct: number | null;
  orderDelta: number;
  priceEffect: number;
  volumeEffect: number;
}

export function bridge(seller: SellerSnapshot): SalesBridge {
  const { last, this: current } = seller.periods;
  const change = percentChange(last.sales, current.sales);
  return {
    salesDelta: round(current.sales - last.sales, 2),
    pct: change === null ? null : round(change),
    orderDelta: current.orders - last.orders,
    priceEffect: round((current.asp - last.asp) * current.orders, 2),
    volumeEffect: round((current.orders - last.orders) * last.asp, 2),
  };
}

export interface NetSalesBridge {
  netOrdersLast: number;
  netOrdersThis: number;
  netSalesLast: number;
  netSalesThis: number;
  salesDelta: number;
  pct: number | null;
  volumeEffect: number;
  cancelEffect: number;
  priceEffect: number;
  volumeShare: number;
  cancelShare: number;
  priceShare: number;
}

export function netBridge(seller: SellerSnapshot): NetSalesBridge {
  const { last, this: current } = seller.periods;
  const netOrdersLast = last.orders * (1 - last.cancelRate);
  const netOrdersThis = current.orders * (1 - current.cancelRate);
  const netSalesLast = netOrdersLast * last.asp;
  const netSalesThis = netOrdersThis * current.asp;
  const salesDelta = netSalesThis - netSalesLast;
  const volumeEffect =
    (current.orders - last.orders) * (1 - last.cancelRate) * last.asp;
  const cancelEffect =
    -current.orders * (current.cancelRate - last.cancelRate) * last.asp;
  const priceEffect = netOrdersThis * (current.asp - last.asp);
  const change = percentChange(netSalesLast, netSalesThis);
  return {
    netOrdersLast: round(netOrdersLast, 4),
    netOrdersThis: round(netOrdersThis, 4),
    netSalesLast: round(netSalesLast, 2),
    netSalesThis: round(netSalesThis, 2),
    salesDelta: round(salesDelta, 2),
    pct: change === null ? null : round(change),
    volumeEffect: round(volumeEffect, 2),
    cancelEffect: round(cancelEffect, 2),
    priceEffect: round(priceEffect, 2),
    volumeShare: round(share(volumeEffect, salesDelta)),
    cancelShare: round(share(cancelEffect, salesDelta)),
    priceShare: round(share(priceEffect, salesDelta)),
  };
}
