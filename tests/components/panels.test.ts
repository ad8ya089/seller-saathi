import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { appReducer, initialAppState } from '@/lib/client/app-state';
import type { AppState } from '@/lib/client/app-state';
import { dashboardReference } from '@/lib/server/dashboard-reference';
import { DiagnosisPanel } from '@/components/DiagnosisPanel';
import { PlanPanel } from '@/components/PlanPanel';
import { dashboardFixture } from '../dashboard-fixtures';

const fixture = dashboardFixture();
function proposed(): AppState {
  return {
    ...appReducer(
      appReducer(initialAppState(), {
        type: 'session',
        session: fixture.session,
      }),
      {
        type: 'event',
        prefix: 'a',
        event: { event: 'state', data: fixture.proposed },
      },
    ),
    phase: 'listening',
  };
}
const confirm = (): Promise<void> => Promise.resolve();
describe('diagnosis and recovery presentation', () => {
  it('preserves the backend ranking, confidence and source-labelled evidence', () => {
    const html = renderToStaticMarkup(
      createElement(DiagnosisPanel, {
        state: proposed(),
        reference: dashboardReference(fixture.data),
      }),
    );
    expect(html.indexOf('Stock availability')).toBeLessThan(
      html.indexOf('Listing visibility'),
    );
    for (const text of [
      'High',
      'Data',
      'Seller said',
      'Yes, both.',
      '2 / 3 questions',
      'not a probability',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('confidence percentage');
  });
  it('renders a proposal as awaiting acceptance with owners, due dates and a cautious ceiling', () => {
    const html = renderToStaticMarkup(
      createElement(PlanPanel, { state: proposed(), onConfirm: confirm }),
    );
    for (const text of [
      'Awaiting acceptance',
      'Confirm Plan',
      'Not Now',
      'Seller',
      '17 Nov 2026',
      'ceiling',
      'Success metric',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('Saved to demo ledger');
    expect(html).toContain(fixture.committed.plan.checkpoint.impact);
  });
  it('disables confirmation while pending and never claims success after a failure', () => {
    let state = appReducer(proposed(), {
      type: 'confirmation',
      decision: 'accept',
      status: 'pending',
    });
    const pending = renderToStaticMarkup(
      createElement(PlanPanel, { state, onConfirm: confirm }),
    );
    expect(pending).toContain('Saving…');
    expect(pending).toContain('aria-busy="true"');
    expect(pending).toContain('disabled');
    state = {
      ...appReducer(state, {
        type: 'confirmation',
        decision: 'accept',
        status: 'failed',
      }),
      error: 'Please retry.',
    };
    const failed = renderToStaticMarkup(
      createElement(PlanPanel, { state, onConfirm: confirm }),
    );
    expect(failed).toContain('Save was not confirmed');
    expect(failed).not.toContain('Saved to demo ledger');
  });
  it('renders only ledger-accepted actions after confirmed commitment and clears a declined proposal', () => {
    let state = appReducer(proposed(), {
      type: 'confirmation',
      decision: 'accept',
      status: 'complete',
      state: fixture.saved,
    });
    const accepted = {
      ...fixture.committed,
      acceptedActionIds: fixture.committed.acceptedActionIds.slice(0, 1),
    };
    state = appReducer(state, {
      type: 'ledger',
      sessionId: fixture.session.sessionId,
      record: accepted,
    });
    const html = renderToStaticMarkup(
      createElement(PlanPanel, { state, onConfirm: confirm }),
    );
    expect(html).toContain('Saved to demo ledger');
    expect(html).toContain('Follow-up: 17 Nov 2026');
    expect(html.match(/<article\b/g)).toHaveLength(1);
    expect(html).not.toContain('Match panel stock to physical stock today');
    const decline = appReducer(proposed(), {
      type: 'confirmation',
      decision: 'decline',
      status: 'complete',
      state: fixture.declined,
    });
    expect(
      renderToStaticMarkup(
        createElement(PlanPanel, { state: decline, onConfirm: confirm }),
      ),
    ).toContain('Plan not saved');
  });
});
