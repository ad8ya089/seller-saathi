import { describe, expect, it } from 'vitest';
import { dashboardReference } from '@/lib/server/dashboard-reference';
import { dashboardSnapshotSchema } from '@/lib/client/dashboard-contracts';
import { appReducer, initialAppState } from '@/lib/client/app-state';
import {
  hypothesisEvidence,
  referenceFor,
  scoreGeometry,
} from '@/lib/client/dashboard-view';
import { dashboardFixture } from '../dashboard-fixtures';

describe('server-derived dashboard evidence', () => {
  it('does not expose detailed evidence before the server completes findings and links seller evidence from actual facts', () => {
    const fixture = dashboardFixture();
    const reference = dashboardReference(fixture.data);
    let state = appReducer(initialAppState(), {
      type: 'session',
      session: fixture.session,
    });
    expect(
      hypothesisEvidence(state, reference, 'STOCK').some((item) =>
        item.text.includes('zero-stock'),
      ),
    ).toBe(false);
    state = appReducer(state, {
      type: 'event',
      prefix: 'a',
      event: { event: 'state', data: fixture.proposed },
    });
    const evidence = hypothesisEvidence(state, reference, 'STOCK');
    expect(evidence.some((item) => item.text.includes('zero-stock'))).toBe(
      true,
    );
    expect(evidence.find((item) => item.source === 'Seller said')?.text).toBe(
      'Yes, both.',
    );
    expect(reference.deltas.oos).toBe(13);
    expect(reference.deltas.cancelPoints).toBeCloseTo(6);
    const changed = dashboardSnapshotSchema.parse(fixture.session.snapshot);
    changed.seller.periods.this.sales = 1;
    expect(referenceFor(changed, reference)).toBeNull();
  });
  it('scales score bars only to the displayed scores and safely handles zero scores', () => {
    expect(scoreGeometry([-2, 6]).min).toBe(-2);
    expect(scoreGeometry([-2, 6]).max).toBe(6);
    expect(scoreGeometry([0, 0]).bars).toEqual([
      { left: 0, width: 0 },
      { left: 0, width: 0 },
    ]);
  });
});
