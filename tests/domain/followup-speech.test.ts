import { expect, it } from 'vitest';
import {
  followupDashboardFixture,
  dashboardFixture,
} from '../dashboard-fixtures';
import { ACTION_CATALOG } from '@/lib/domain/action-catalog';
import { followupSpeech, followupGreeting } from '@/lib/domain/followup-speech';
import { lintSpeech } from '@/lib/domain/speech';

it('keeps review speech within the same limits for every catalog pair in both languages', () => {
  const review = followupDashboardFixture(
    dashboardFixture().committed,
    '11111111-1111-4111-8111-111111111111',
  );
  const view = review.proposed.followup;
  const plan = review.proposed.plan;
  const sampleAction = plan?.actions[0];
  if (!view || !plan || !sampleAction) throw new Error('fixture');
  for (const lang of ['en-IN', 'hi-IN'] as const) {
    expect(
      lintSpeech(followupGreeting(view.windowDays, lang), 'greeting').errors,
    ).toEqual([]);
    expect(
      lintSpeech(followupSpeech(view, undefined, lang).join(' '), 'recommend')
        .errors,
    ).toEqual([]);
    for (const first of ACTION_CATALOG)
      for (const second of ACTION_CATALOG) {
        if (first.id === second.id) continue;
        const actions = [first, second].map((spec) => ({
          ...sampleAction,
          id: spec.id,
          title: spec.title,
        }));
        const text = followupSpeech(view, { ...plan, actions }, lang).join(' ');
        expect(lintSpeech(text, 'recommend').errors, text).toEqual([]);
      }
  }
});
