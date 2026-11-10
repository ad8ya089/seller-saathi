import { lintSpeech } from '@/lib/domain/speech';
import { spokenActionTitles, planSummary } from '@/lib/domain/plan-speech';
import { spokenEvidence } from '@/lib/agent/snapshot';
import { normalizeEvidence } from '@/lib/agent/guards';
import type { Phase } from '@/lib/domain/types';
import type { Session } from '@/lib/agent/session';
import type { SellerData } from '@/lib/domain/data-schemas';

export const SAVE_QUESTION = 'Shall I save this plan?';
export const SAVED_RECEIPT = 'Saved to the demo ledger.';
const NUMBERS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore|percent|rupees)\b|\d/i;
const UNSAFE =
  /\b(guarantee|guaranteed|discount|ignore.*rules|saved|saving|committed)\b|\b(changed|updated|modified)\b.*\bsnapdeal\b|\bsnapdeal\b.*\b(changed|updated|modified)\b/i;

export class SpeechGuard {
  readonly chunks: string[] = [];
  private readonly titles: string[];
  private readonly spokenTitles = new Set<string>();
  constructor(
    private readonly session: Session,
    private readonly data: SellerData,
    readonly phase: Phase,
    readonly reserved: string,
  ) {
    this.titles = session.proposedPlan
      ? spokenActionTitles(session.proposedPlan.plan)
      : [];
  }
  accept(text: string): string | null {
    const clean = text.trim();
    if (!clean || /\?/.test(clean) || UNSAFE.test(clean)) return null;
    if (
      this.phase === 'findings' &&
      normalizeEvidence(clean) !==
        normalizeEvidence(spokenEvidence(this.session, this.data).at(-1) ?? '')
    )
      return null;
    if (this.phase === 'recommend') {
      const candidate = normalizeEvidence(
        clean.replace(/^(first|second|third|next|finally)[,:]?\s+/i, ''),
      );
      const title = this.titles.find(
        (value) => normalizeEvidence(value) === candidate,
      );
      return title ? this.acceptTitle(title) : null;
    }
    const approved = this.session.pendingCommit
      ? [
          planSummary(
            this.session.pendingCommit.plan,
            this.session.hypotheses[0]?.id,
            this.session.pendingCommit.acceptedActionIds,
          ),
        ]
      : spokenEvidence(this.session, this.data);
    if (
      this.session.pendingCommit &&
      !approved.some(
        (value) => normalizeEvidence(value) === normalizeEvidence(clean),
      )
    )
      return null;
    if (
      NUMBERS.test(clean) &&
      !approved.some(
        (value) => normalizeEvidence(value) === normalizeEvidence(clean),
      )
    )
      return null;
    if (this.chunks.length) return null;
    return this.add(clean);
  }
  private add(text: string): string | null {
    const combined = [...this.chunks, text, this.reserved].join(' ');
    if (
      !lintSpeech(combined, this.phase === 'commit' ? 'summary' : this.phase).ok
    )
      return null;
    this.chunks.push(text);
    return text;
  }
  private acceptTitle(title: string): string | null {
    if (this.spokenTitles.has(title)) return null;
    const added = this.add(`${title}.`);
    if (added) this.spokenTitles.add(title);
    return added;
  }
  complete(): string[] {
    if (this.phase === 'recommend')
      return this.titles
        .map((title) => this.acceptTitle(title))
        .filter((value): value is string => value !== null);
    if (this.chunks.length) return [];
    const fallback = this.session.pendingCommit
      ? planSummary(
          this.session.pendingCommit.plan,
          this.session.hypotheses[0]?.id,
          this.session.pendingCommit.acceptedActionIds,
        )
      : this.phase === 'findings'
        ? (spokenEvidence(this.session, this.data).at(-1) ??
          'I have checked the available seller data.')
        : this.phase === 'intake'
          ? 'I can help review sales using the available demo data.'
          : 'Understood, let us focus on the most useful next step.';
    const result = this.add(fallback);
    return result ? [result] : [];
  }
}
