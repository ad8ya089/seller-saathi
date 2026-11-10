import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SnapshotPanel } from '@/components/SnapshotPanel';
import { dashboardReference } from '@/lib/server/dashboard-reference';
import { dashboardSnapshotSchema } from '@/lib/client/dashboard-contracts';
import { dashboardFixture } from '../dashboard-fixtures';

describe('snapshot panel', () => {
  it('renders the actual backend values with Indian grouping and the real sales bridge', () => {
    const fixture = dashboardFixture();
    const html = renderToStaticMarkup(
      createElement(SnapshotPanel, {
        snapshot: dashboardSnapshotSchema.parse(fixture.session.snapshot),
        reference: dashboardReference(fixture.data),
      }),
    );
    for (const value of [
      '₹2,00,000',
      '₹1,35,000',
      '−₹65,000',
      '₹0',
      '14.0%',
      '400',
      '270',
    ])
      expect(html).toContain(value);
    expect(html).toContain('synthetic');
    expect(html).toContain('including cancelled orders');
  });
  it('does not render placeholder metrics before a session exists', () => {
    const html = renderToStaticMarkup(
      createElement(SnapshotPanel, { snapshot: null, reference: null }),
    );
    expect(html).toContain('Start a call');
    expect(html).not.toContain('₹');
  });
});
