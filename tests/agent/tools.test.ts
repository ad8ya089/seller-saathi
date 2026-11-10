import { describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@/lib/server/session-store';
import { executeTool, finalizeCommit } from '@/lib/agent/tools';
import type { ToolEnvironment } from '@/lib/agent/tools';
import { fixture } from '../fixtures';
import { buildPlan } from '@/lib/domain/actions';
import { domainState } from '@/lib/agent/session';

function ready(): {
  session: ReturnType<SessionStore['create']>;
  env: ToolEnvironment;
} {
  const session = new SessionStore().create();
  session.phase = 'recommend';
  session.turn = 3;
  session.toolsCalled = new Set([
    'get_seller_snapshot',
    'get_sku_breakdown',
    'get_cancellation_breakdown',
  ]);
  session.questionsAsked = ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA'];
  session.facts = {
    oos_confirmed: {
      factId: 'oos_confirmed',
      value: 'yes',
      quote: 'yes',
      turn: 2,
    },
    restock_eta_days: {
      factId: 'restock_eta_days',
      value: 10,
      quote: 'ten days',
      turn: 3,
    },
  };
  const env: ToolEnvironment = {
    data: fixture,
    today: new Date('2026-11-10T00:00:00Z'),
    now: () => new Date('2026-11-10T12:00:00Z'),
    createPlanId: () => 'plan-test',
    append: vi.fn<ToolEnvironment['append']>().mockResolvedValue(undefined),
  };
  return { session, env };
}
describe('guarded recovery tools', () => {
  it('returns useful correction errors for malformed, unknown and phase-forbidden tools', async () => {
    const { session, env } = ready();
    session.phase = 'intake';
    session.toolsCalled.clear();
    expect(
      await executeTool(session, { name: 'commit_action_plan', args: {} }, env),
    ).toMatchObject({ ok: false });
    expect(
      await executeTool(session, { name: 'invented', args: {} }, env),
    ).toMatchObject({ ok: false });
    session.toolsCalled.add('get_seller_snapshot');
    session.phase = 'findings';
    expect(
      await executeTool(
        session,
        { name: 'get_sku_breakdown', args: { limit: 11 } },
        env,
      ),
    ).toMatchObject({ ok: false });
    const funnel = await executeTool(
      session,
      { name: 'get_listing_funnel', args: {} },
      env,
    );
    expect(funnel).toEqual({
      ok: true,
      available: false,
      reason: 'Listing funnel data is not available in this demo.',
    });
  });
  it('proposes only two or three eligible unique IDs, without writing a ledger', async () => {
    const { session, env } = ready();
    expect(
      await executeTool(
        session,
        {
          name: 'propose_action_plan',
          args: { actionIds: ['A_STOCK_SYNC', 'A_PRICE_CHECK'] },
        },
        env,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await executeTool(
        session,
        {
          name: 'propose_action_plan',
          args: { actionIds: ['A_STOCK_SYNC', 'A_PUSH_INSTOCK'] },
        },
        env,
      ),
    ).toMatchObject({ ok: true, planId: 'plan-test' });
    expect(session.proposedPlan?.proposedAtTurn).toBe(3);
    expect(env.append).not.toHaveBeenCalled();
  });
  it('requires an earlier proposed plan, whole-utterance acceptance and a nonempty subset', async () => {
    const { session, env } = ready();
    session.proposedPlan = {
      plan: buildPlan(domainState(session, fixture), env.today, 'p'),
      proposedAtTurn: 3,
    };
    session.phase = 'confirm';
    const args = {
      planId: 'p',
      acceptedActionIds: ['A_STOCK_SYNC'],
      confirmationQuote: 'Yes',
    };
    session.lastUserText = 'Yes';
    expect(
      await executeTool(session, { name: 'commit_action_plan', args }, env),
    ).toMatchObject({ ok: false });
    session.turn = 4;
    session.lastUserText = "Yes, but don't save it";
    expect(
      await executeTool(session, { name: 'commit_action_plan', args }, env),
    ).toMatchObject({ ok: false });
    session.lastUserText = 'Yes';
    expect(
      await executeTool(
        session,
        {
          name: 'commit_action_plan',
          args: { ...args, acceptedActionIds: ['A_PRICE_CHECK'] },
        },
        env,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await executeTool(
        session,
        {
          name: 'commit_action_plan',
          args: { ...args, acceptedActionIds: [] },
        },
        env,
      ),
    ).toMatchObject({ ok: false });
    expect(env.append).not.toHaveBeenCalled();
  });
  it('stages verified commitment, finalizes once, and never appends after cancellation', async () => {
    const { session, env } = ready();
    session.proposedPlan = {
      plan: buildPlan(domainState(session, fixture), env.today, 'p'),
      proposedAtTurn: 2,
    };
    session.phase = 'confirm';
    session.lastUserText = 'Yes, please save it.';
    const args = {
      planId: 'p',
      acceptedActionIds: ['A_STOCK_SYNC'],
      confirmationQuote: session.lastUserText,
    };
    expect(
      await executeTool(session, { name: 'commit_action_plan', args }, env),
    ).toMatchObject({ ok: true, pending: true });
    expect(env.append).not.toHaveBeenCalled();
    const abort = new AbortController();
    abort.abort();
    await expect(
      finalizeCommit(session, env, abort.signal),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    expect(env.append).not.toHaveBeenCalled();
    await finalizeCommit(session, env, new AbortController().signal);
    await finalizeCommit(session, env, new AbortController().signal);
    expect(env.append).toHaveBeenCalledOnce();
    expect(session.committedPlan?.plan.followUpDate).toBe('2026-11-17');
  });
  it('rejects fabricated fact values and unsupported quotes before mutating state', async () => {
    const { session, env } = ready();
    session.phase = 'investigate';
    session.lastUserText = 'Maybe ten days.';
    expect(
      await executeTool(
        session,
        {
          name: 'record_seller_fact',
          args: {
            factId: 'restock_eta_days',
            value: 2,
            quote: 'Maybe ten days',
          },
        },
        env,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await executeTool(
        session,
        {
          name: 'record_seller_fact',
          args: {
            factId: 'views_dropped',
            value: 'yes',
            quote: 'Views are down',
          },
        },
        env,
      ),
    ).toMatchObject({ ok: false });
    expect(session.facts.views_dropped).toBeUndefined();
  });
});
