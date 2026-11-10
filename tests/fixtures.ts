import seller from '../data/seller.json' with { type: 'json' };
import skus from '../data/skus.json' with { type: 'json' };
import cancellations from '../data/cancellations.json' with { type: 'json' };
import followup from '../data/followup_day7.json' with { type: 'json' };
import {
  sellerSnapshotSchema,
  skuDataSchema,
  cancellationDataSchema,
  followupDataSchema,
} from '@/lib/domain/data-schemas';

export const fixture = {
  seller: sellerSnapshotSchema.parse(seller),
  skus: skuDataSchema.parse(skus),
  cancellations: cancellationDataSchema.parse(cancellations),
  followup: followupDataSchema.parse(followup),
};
