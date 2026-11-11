import { z } from 'zod';

const count = z.number().int().nonnegative();
export const periodSchema = z.strictObject({
  label: z.string().min(1),
  sales: z.number().nonnegative(),
  orders: count,
  cancelRate: z.number().min(0).max(1),
  asp: z.number().positive(),
  oosProducts: count,
});
export const sellerSnapshotSchema = z.strictObject({
  sellerId: z.string().min(1),
  name: z.string().min(1),
  city: z.string().min(1),
  category: z.string().min(1),
  activeListings: count,
  asp: z.number().positive(),
  periods: z.strictObject({ last: periodSchema, this: periodSchema }),
  synthetic: z.array(z.enum(['skus', 'cancellations', 'followupDay7'])),
  unavailable: z.array(
    z.enum([
      'impressions',
      'clicks',
      'conversion',
      'competitorPrices',
      'returns',
      'categoryBenchmark',
    ]),
  ),
});
export type SellerSnapshot = z.infer<typeof sellerSnapshotSchema>;
export const skuSchema = z.strictObject({
  sku: z.string().regex(/^[A-Z]{3}-\d{3}$/),
  spokenName: z.string().min(1),
  ordersLast: count,
  ordersThis: count,
  stock: count,
  oosSinceDay: z.number().int().min(1).max(31).optional(),
  note: z.string(),
});
export const skuDataSchema = z
  .strictObject({
    synthetic: z.literal(true),
    skus: z.array(skuSchema).min(1),
    tail: z.strictObject({
      listings: count,
      ordersLast: count,
      ordersThis: count,
      oosLast: count,
      oosThis: count,
    }),
  })
  .refine(
    (data) =>
      new Set(data.skus.map((sku) => sku.sku)).size === data.skus.length,
    { message: 'Duplicate SKU identifiers' },
  )
  .refine(
    (data) =>
      data.tail.oosLast <= data.tail.listings &&
      data.tail.oosThis <= data.tail.listings,
    { message: 'Tail OOS exceeds listings' },
  );
export type SkuData = z.infer<typeof skuDataSchema>;
export const cancellationReasonSchema = z.enum([
  'stock_unavailable',
  'dispatch_delay',
  'buyer_cancelled',
  'courier_issue',
]);
export type CancellationReason = z.infer<typeof cancellationReasonSchema>;
export const cancellationDataSchema = z
  .strictObject({
    synthetic: z.literal(true),
    reasons: z
      .array(
        z.strictObject({
          reason: cancellationReasonSchema,
          last: count,
          this: count,
        }),
      )
      .length(4),
    roundingNote: z.string().min(1),
  })
  .refine((data) => new Set(data.reasons.map((row) => row.reason)).size === 4, {
    message: 'Cancellation reasons must appear exactly once',
  });
export type CancellationData = z.infer<typeof cancellationDataSchema>;
export const followupDataSchema = z.strictObject({
  synthetic: z.literal(true),
  windowDays: z.literal(7),
  rolling7: z.strictObject({
    orders: count,
    ordersPerDay: z.number().nonnegative(),
    cancelRate: z.number().min(0).max(1),
    oosProducts: count,
  }),
  baselineThisMonthOrdersPerDay: z.number().nonnegative(),
  actionStatus: z.partialRecord(
    z.enum([
      'A_RESTOCK_TOP',
      'A_STOCK_SYNC',
      'A_PUSH_INSTOCK',
      'A_DISPATCH_SLA',
      'A_VISIBILITY_AUDIT',
      'A_PRICE_CHECK',
    ]),
    z.enum(['partial', 'done', 'not_done']),
  ),
  skuStock: z.record(z.string().regex(/^[A-Z]{3}-\d{3}$/), count),
});
export type FollowupData = z.infer<typeof followupDataSchema>;
export interface SellerData {
  seller: SellerSnapshot;
  skus: SkuData;
  cancellations: CancellationData;
  followup: FollowupData;
}
