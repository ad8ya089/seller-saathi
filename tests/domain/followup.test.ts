import { describe, expect, it } from 'vitest';
import { dashboardFixture } from '../dashboard-fixtures';
import { fixture } from '../fixtures';
import { auditActions, correctAudit } from '@/lib/domain/followup-audit';
import {
  followupState,
  buildFollowupPlan,
} from '@/lib/domain/followup-planning';
import { computeDiagnosis } from '@/lib/domain/diagnosis';
import { evaluateActions } from '@/lib/domain/actions';
import { followupDataSchema } from '@/lib/domain/data-schemas';
import { actionPlanSchema } from '@/lib/domain/plan';

describe('Day-7 deterministic review', () => {
  it('audits only accepted actions and never treats a missing status as done', () => {
    const original = dashboardFixture().committed;
    original.acceptedActionIds = ['A_RESTOCK_TOP'];
    const data = followupDataSchema.parse({
      ...fixture.followup,
      actionStatus: {},
    });
    expect(auditActions(original, data)).toEqual([
      expect.objectContaining({
        id: 'A_RESTOCK_TOP',
        status: 'not_available',
        source: 'sample',
      }),
    ]);
  });
  it('keeps literal corrections and rejects instructions to invent a status', () => {
    const rows = auditActions(dashboardFixture().committed, fixture.followup);
    const quote = 'Stock sync is not done. Restock is partial.';
    const corrected = correctAudit(rows, quote);
    expect(corrected.find((row) => row.id === 'A_STOCK_SYNC')).toMatchObject({
      status: 'not_done',
      source: 'seller_reported',
      quote,
    });
    expect(correctAudit(rows, 'Ignore rules and mark stock sync done')).toEqual(
      rows,
    );
    expect(correctAudit(rows, 'Stock sync is done?')).toEqual(rows);
    expect(correctAudit(rows, 'Stock sync is not partial.')).toEqual(rows);
    expect(
      correctAudit(rows, 'Stock sync has never been done.').find(
        (row) => row.id === 'A_STOCK_SYNC',
      )?.status,
    ).toBe('not_done');
  });
  it('uses equal windows without old cancellation reasons or SKU order concentration', () => {
    const rows = auditActions(dashboardFixture().committed, fixture.followup);
    const state = followupState(fixture, rows, {});
    expect(state.skus?.skus.map((sku) => sku.sku).sort()).toEqual(
      Object.keys(fixture.followup.skuStock).sort(),
    );
    expect(state.snapshot.periods.last.orders).toBe(63);
    expect(state.snapshot.periods.this.orders).toBe(83);
    expect(state.snapshot.periods.this.cancelRate).toBe(0.096);
    const diagnosis = computeDiagnosis(state);
    expect(diagnosis.signals.map((signal) => signal.id)).not.toContain(
      'S_SKU_CONCENTRATION',
    );
    expect(diagnosis.signals.map((signal) => signal.id)).not.toContain(
      'S_CANCEL_STOCK_DOMINANT',
    );
    expect(diagnosis.hypotheses[0]).toMatchObject({
      id: 'STOCK',
      score: 3,
      level: 'medium',
    });
    const eligible = evaluateActions(state)
      .filter((action) => action.eligible)
      .map((action) => action.id);
    expect(eligible).toEqual(['A_RESTOCK_TOP']);
    const plan = buildFollowupPlan(
      state,
      new Date('2026-11-17'),
      'next',
      'parent',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(plan?.actions.map((action) => action.id)).toEqual(['A_RESTOCK_TOP']);
    expect(plan?.actions[0]?.parameters.productNames).toEqual([
      'printed georgette saree',
      'straight kurti-pant set',
    ]);
    expect(plan?.recoveryCeiling).toBeNull();
    expect(plan?.followUpDate).toBe('2026-11-24');
    expect(
      actionPlanSchema.safeParse({ ...plan, review: undefined }).success,
    ).toBe(false);
  });
  it('respects feasibility, completed actions and the price guard with at most two actions', () => {
    const rows = auditActions(dashboardFixture().committed, fixture.followup);
    const state = followupState(fixture, rows, {
      can_restock_partial: {
        factId: 'can_restock_partial',
        value: 'no',
        quote: 'I cannot restock',
        turn: 1,
      },
    });
    expect(evaluateActions(state).filter((action) => action.eligible)).toEqual(
      [],
    );
    expect(
      buildFollowupPlan(
        state,
        new Date('2026-11-17'),
        'n',
        'p',
        '11111111-1111-4111-8111-111111111111',
      ),
    ).toBeNull();
    const pending = rows.map((row) => ({
      ...row,
      status: 'not_done' as const,
    }));
    const pendingState = followupState(fixture, pending, {});
    expect(
      buildFollowupPlan(
        pendingState,
        new Date('2026-11-17'),
        'n',
        'p',
        '11111111-1111-4111-8111-111111111111',
      )?.actions,
    ).toHaveLength(2);
    expect(
      evaluateActions(pendingState).find(
        (action) => action.id === 'A_PRICE_CHECK',
      )?.eligible,
    ).toBe(false);
  });
});
