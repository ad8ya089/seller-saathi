import { describe, expect, it } from 'vitest';
import { buildPlan, evaluateActions } from '@/lib/domain/actions';
import { actionPlanSchema } from '@/lib/domain/plan';
import type { DomainState } from '@/lib/domain/types';
import { fixture } from '../fixtures';

function state(): DomainState {
  return {
    snapshot: structuredClone(fixture.seller),
    skus: structuredClone(fixture.skus),
    cancellations: structuredClone(fixture.cancellations),
    toolsCalled: new Set([
      'get_seller_snapshot',
      'get_sku_breakdown',
      'get_cancellation_breakdown',
    ]),
    questionsAsked: ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA'],
    facts: {
      oos_confirmed: {
        factId: 'oos_confirmed',
        value: 'yes',
        quote: 'yes',
        turn: 1,
      },
      restock_eta_days: {
        factId: 'restock_eta_days',
        value: 10,
        quote: 'ten days',
        turn: 2,
      },
    },
  };
}
const today = new Date('2026-11-10T12:00:00Z');

describe('recovery planning', () => {
  it('fills an explicit eligible selection and rejects ineligible or duplicate selections', () => {
    const plan = buildPlan(state(), today, 'selected', {
      actionIds: ['A_STOCK_SYNC', 'A_PUSH_INSTOCK'],
    });
    expect(plan.actions.map((action) => action.id)).toEqual([
      'A_STOCK_SYNC',
      'A_PUSH_INSTOCK',
    ]);
    expect(() =>
      buildPlan(state(), today, 'invalid', {
        actionIds: ['A_PRICE_CHECK', 'A_STOCK_SYNC'],
      }),
    ).toThrow();
    expect(() =>
      buildPlan(state(), today, 'duplicate', {
        actionIds: ['A_STOCK_SYNC', 'A_STOCK_SYNC'],
      }),
    ).toThrow();
  });
  it('builds S1 with the three catalog actions and a separate KAM checkpoint', () => {
    const plan = buildPlan(state(), today);
    expect(plan.actions.map((action) => action.id)).toEqual([
      'A_RESTOCK_TOP',
      'A_STOCK_SYNC',
      'A_PUSH_INSTOCK',
    ]);
    expect(plan.actions.map((action) => action.owner)).toEqual([
      'Seller',
      'Seller',
      'Seller',
    ]);
    expect(plan.checkpoint).toMatchObject({
      id: 'A_FOLLOWUP',
      owner: 'Virtual KAM',
      dueDate: '2026-11-17',
    });
    expect(plan.followUpDate).toBe('2026-11-17');
    expect(plan.impact).toContain('up to ₹61,500 if fully recovered');
    expect(plan.actions[0]).toMatchObject({
      dueDate: '2026-11-12',
      expectedStockDate: '2026-11-20',
      parameters: { ordersLast: 190, ordersThis: 67, recoverableOrders: 123 },
    });
    expect(actionPlanSchema.safeParse(plan).success).toBe(true);
  });
  it('derives recovery figures when the dataset changes', () => {
    const changed = state();
    const sku = changed.skus?.skus[0];
    if (!sku) throw new Error('Missing SKU fixture');
    sku.ordersThis += 10;
    const plan = buildPlan(changed, today);
    expect(plan.recoveryCeiling).toBe(56500);
    expect(plan.impact).toContain('₹56,500');
  });
  it('excludes restocking when the seller says even a partial batch is impossible', () => {
    const unable = state();
    unable.facts.can_restock_partial = {
      factId: 'can_restock_partial',
      value: 'no',
      quote: 'cannot restock',
      turn: 3,
    };
    const plan = buildPlan(unable, today);
    expect(plan.actions.map((action) => action.id)).toEqual([
      'A_STOCK_SYNC',
      'A_PUSH_INSTOCK',
    ]);
    expect(plan.impact).not.toContain('₹61,500');
    expect(
      evaluateActions(unable).find((action) => action.id === 'A_RESTOCK_TOP'),
    ).toMatchObject({ eligible: false, feasibility: 0 });
  });
  it.each(['no', 'sometimes'] as const)(
    'includes dispatch repair for a stock-denying seller reporting dispatch=%s',
    (value) => {
      const denied = state();
      denied.facts.oos_confirmed = {
        factId: 'oos_confirmed',
        value: 'no',
        quote: 'stock is fine',
        turn: 1,
      };
      denied.facts.dispatch_on_time = {
        factId: 'dispatch_on_time',
        value,
        quote: value,
        turn: 2,
      };
      expect(
        buildPlan(denied, today).actions.map((action) => action.id),
      ).toEqual(
        expect.arrayContaining([
          'A_RESTOCK_TOP',
          'A_STOCK_SYNC',
          'A_DISPATCH_SLA',
        ]),
      );
    },
  );
  it('includes a visibility audit when the seller reports falling views', () => {
    const visibility = state();
    visibility.facts.views_dropped = {
      factId: 'views_dropped',
      value: 'yes',
      quote: 'views fell',
      turn: 1,
    };
    expect(
      buildPlan(visibility, today).actions.map((action) => action.id),
    ).toContain('A_VISIBILITY_AUDIT');
  });
  it('never makes a price comparison eligible without explicit competitor undercut evidence', () => {
    const candidate = state();
    expect(
      evaluateActions(candidate).find((action) => action.id === 'A_PRICE_CHECK')
        ?.eligible,
    ).toBe(false);
    candidate.facts.competitor_undercut = {
      factId: 'competitor_undercut',
      value: 'unknown',
      quote: 'not sure',
      turn: 1,
    };
    expect(
      evaluateActions(candidate).find((action) => action.id === 'A_PRICE_CHECK')
        ?.eligible,
    ).toBe(false);
    candidate.facts.competitor_undercut = {
      factId: 'competitor_undercut',
      value: 'yes',
      quote: 'yes',
      turn: 2,
    };
    expect(
      evaluateActions(candidate).find((action) => action.id === 'A_PRICE_CHECK')
        ?.eligible,
    ).toBe(true);
    expect(
      evaluateActions(candidate).find((action) => action.id === 'A_PRICE_CHECK')
        ?.title,
    ).toContain('before touching price');
  });
  it('does not recommend healthy-stock promotion when no healthy hero is available', () => {
    const noStock = state();
    if (!noStock.skus) throw new Error('Missing SKU fixture');
    noStock.skus.skus = noStock.skus.skus.map((sku) => ({ ...sku, stock: 0 }));
    expect(
      evaluateActions(noStock).find((action) => action.id === 'A_PUSH_INSTOCK')
        ?.eligible,
    ).toBe(false);
  });
  it('returns a typed error rather than inventing two eligible actions', () => {
    const insufficient: DomainState = {
      snapshot: fixture.seller,
      facts: {},
      questionsAsked: [],
      toolsCalled: new Set(),
    };
    expect(() => buildPlan(insufficient, today)).toThrow(
      /at least two eligible/,
    );
  });
  it('calculates calendar dates across years and leaves the injected clock untouched', () => {
    const date = new Date('2026-12-30T23:30:00Z');
    const plan = buildPlan(state(), date);
    expect(plan.actions[0]?.dueDate).toBe('2027-01-01');
    expect(plan.followUpDate).toBe('2027-01-06');
    expect(date.toISOString()).toBe('2026-12-30T23:30:00.000Z');
    expect(() => buildPlan(state(), new Date('invalid'))).toThrow(/Invalid/);
  });
  it('preserves the input and gives deterministic plans and rankings', () => {
    const input = state();
    const before = structuredClone(input);
    expect(buildPlan(input, today)).toEqual(buildPlan(input, today));
    expect(input).toEqual(before);
  });
  it('rejects invented action ids, duplicate actions and invalid checkpoint ownership', () => {
    const plan = buildPlan(state(), today);
    expect(
      actionPlanSchema.safeParse({
        ...plan,
        actions: [{ ...plan.actions[0], id: 'A_DISCOUNT' }],
      }).success,
    ).toBe(false);
    expect(
      actionPlanSchema.safeParse({
        ...plan,
        actions: [plan.actions[0], plan.actions[0]],
      }).success,
    ).toBe(false);
    expect(
      actionPlanSchema.safeParse({
        ...plan,
        checkpoint: { ...plan.checkpoint, owner: 'Seller' },
      }).success,
    ).toBe(false);
  });
});
