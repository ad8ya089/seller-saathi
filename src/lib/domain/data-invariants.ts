import type { SellerData } from '@/lib/domain/data-schemas';
import {
  inventoryMetrics,
  cancellationMetrics,
} from '@/lib/domain/data-calculations';

export interface InvariantResult {
  name: string;
  actual: number;
  expected: number;
  ok: boolean;
}

export function verifyData(data: SellerData): InvariantResult[] {
  const { seller, skus, cancellations, followup } = data;
  const { last, this: current } = seller.periods;
  const inventory = inventoryMetrics(seller, skus);
  const cancels = cancellationMetrics(cancellations);
  const result: InvariantResult[] = [];
  const check = (
    name: string,
    actual: number,
    expected: number,
    tolerance = 0.000001,
  ): void => {
    result.push({
      name,
      actual,
      expected,
      ok: Math.abs(actual - expected) <= tolerance,
    });
  };
  check('Seller last orders', last.orders, 400);
  check('Seller this orders', current.orders, 270);
  check('Seller last ASP', last.asp, 500);
  check('Seller this ASP', current.asp, 500);
  check('Seller ASP', seller.asp, 500);
  check('Seller last sales', last.sales, 200000);
  check('Seller this sales', current.sales, 135000);
  check('Seller last OOS', last.oosProducts, 5);
  check('Seller this OOS', current.oosProducts, 18);
  check('Seller last cancellation rate', last.cancelRate, 0.08);
  check('Seller this cancellation rate', current.cancelRate, 0.14);
  check('Last orders times ASP', last.orders * last.asp, last.sales);
  check('This orders times ASP', current.orders * current.asp, current.sales);
  check('Explicit SKUs', skus.skus.length, 8);
  check('Tail listings', skus.tail.listings, 52);
  check('Total listings', skus.skus.length + skus.tail.listings, 60);
  check('Seller listings', seller.activeListings, 60);
  check(
    'SKU last orders',
    skus.skus.reduce((sum, sku) => sum + sku.ordersLast, skus.tail.ordersLast),
    last.orders,
  );
  check(
    'SKU this orders',
    skus.skus.reduce((sum, sku) => sum + sku.ordersThis, skus.tail.ordersThis),
    current.orders,
  );
  check('Explicit zero stock SKUs', inventory.oosCount, 3);
  check('Last OOS total', skus.tail.oosLast, last.oosProducts);
  check(
    'This OOS total',
    inventory.oosCount + skus.tail.oosThis,
    current.oosProducts,
  );
  check('OOS gross order decline', inventory.oosDecline, 123);
  check('Overall gross order decline', inventory.grossOrderDecline, 130);
  check(
    'OOS share of gross decline percent',
    inventory.concentrationPct,
    94.6,
    0.05,
  );
  check(
    'OOS last order share percent',
    inventory.lastOrderSharePct,
    47.5,
    0.05,
  );
  check('Recovery ceiling rupees', inventory.recoveryCeiling, 61500);
  check('Last cancellation total', cancels.totalLast, 32);
  check('This cancellation total', cancels.totalThis, 38);
  check(
    'Last cancellations match rate',
    cancels.totalLast,
    Math.round(last.orders * last.cancelRate),
  );
  check(
    'This cancellations match rounded rate',
    cancels.totalThis,
    Math.round(current.orders * current.cancelRate),
  );
  check('Stock unavailable cancellations', cancels.stockThis, 21);
  check('Stock unavailable share percent', cancels.stockPct, 55.3, 0.05);
  check(
    'Seller controllable share percent',
    cancels.controllablePct,
    73.7,
    0.05,
  );
  check(
    'Day seven orders per day',
    followup.rolling7.orders / followup.windowDays,
    followup.rolling7.ordersPerDay,
    0.05,
  );
  check(
    'Day seven baseline daily orders',
    followup.baselineThisMonthOrdersPerDay,
    9,
  );
  check('Day seven window', followup.windowDays, 7);
  check('Day seven orders', followup.rolling7.orders, 83);
  check('Day seven cancellation rate', followup.rolling7.cancelRate, 0.096);
  check('Day seven OOS products', followup.rolling7.oosProducts, 11);
  check('Day seven kurti stock', followup.skuStock['KUR-101'] ?? -1, 60);
  check('Day seven saree stock', followup.skuStock['SAR-201'] ?? -1, 0);
  check('Day seven kurti-pant stock', followup.skuStock['KUR-103'] ?? -1, 0);
  check(
    'Day seven restock partial',
    Number(followup.actionStatus.A_RESTOCK_TOP === 'partial'),
    1,
  );
  check(
    'Day seven stock sync done',
    Number(followup.actionStatus.A_STOCK_SYNC === 'done'),
    1,
  );
  check(
    'Day seven promotion done',
    Number(followup.actionStatus.A_PUSH_INSTOCK === 'done'),
    1,
  );
  return result;
}
