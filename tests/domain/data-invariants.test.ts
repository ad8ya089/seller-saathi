import { expect, it } from 'vitest';
import { verifyData } from '@/lib/domain/data-invariants';
import { fixture } from '../fixtures';

it('verifies every documented dataset invariant', () => {
  expect(verifyData(fixture).filter((result) => !result.ok)).toEqual([]);
});
it('identifies changed source data and derived totals', () => {
  const data = structuredClone(fixture);
  const sku = data.skus.skus[0];
  if (!sku) throw new Error('Fixture is missing its first SKU');
  sku.ordersThis += 1;
  const failures = verifyData(data).filter((result) => !result.ok);
  expect(failures.map((result) => result.name)).toContain('SKU this orders');
  expect(failures.map((result) => result.name)).toContain(
    'OOS gross order decline',
  );
});
