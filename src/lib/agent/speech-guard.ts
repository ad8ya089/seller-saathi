import { lintSpeech } from '@/lib/domain/speech';
import { spokenActionTitles, planSummary } from '@/lib/domain/plan-speech';
import { spokenEvidence } from '@/lib/agent/snapshot';
import { normalizeEvidence } from '@/lib/agent/guards';
import type { Phase } from '@/lib/domain/types';
import type { Session } from '@/lib/agent/session';
import type { SellerData } from '@/lib/domain/data-schemas';
import { callCopy } from '@/lib/domain/call-language';

export const SAVE_QUESTION = 'Shall I save this plan?';
export const SAVED_RECEIPT = 'Saved to the demo ledger.';
const NUMBERS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore|percent|rupees)\b|\d/i;
const HINDI_NUMBERS =
  /\p{N}|\b(?:shunya|ek|do|teen|chaar|char|paanch|panch|chhe|saat|aath|nau|das|dus|gyarah|barah|terah|chaudah|pandrah|solah|satrah|atharah|unnis|bees|tees|chalis|pachas|saath|sattar|assi|nabbe|sau|hazaar|hazar|rupaye|rupe|pratishat)\b|(?:^|[^\p{L}\p{M}])(?:एक|दो|तीन|चार|पाँच|पांच|छह|सात|आठ|नौ|दस|बीस|तीस|चालीस|पचास|साठ|सत्तर|अस्सी|नब्बे|सौ|हजार|हज़ार|लाख|करोड़|रुपये|प्रतिशत)(?=$|[^\p{L}\p{M}])/iu;
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
      ? spokenActionTitles(session.proposedPlan.plan, session.lang)
      : [];
  }
  accept(text: string): string | null {
    const clean = text.trim();
    if (!clean || /\?/.test(clean) || UNSAFE.test(clean)) return null;
    if (
      this.session.lang === 'hi-IN' &&
      (/\b(save|committed|guarantee|pakka|discount|AI assistant)\b/i.test(
        clean,
      ) ||
        !/[\u0900-\u097F]|\b(hai|hain|aap|kijiye|mein|kar|ki|ka|ke|liye|se|hui|gaya)\b/iu.test(
          clean,
        ))
    )
      return null;
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
            this.session.lang,
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
      (NUMBERS.test(clean) ||
        (this.session.lang === 'hi-IN' && HINDI_NUMBERS.test(clean))) &&
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
          this.session.lang,
        )
      : this.phase === 'findings'
        ? (spokenEvidence(this.session, this.data).at(-1) ??
          callCopy(this.session.lang).findingsFallback)
        : this.phase === 'intake'
          ? callCopy(this.session.lang).intakeFallback
          : callCopy(this.session.lang).investigateFallback;
    const result = this.add(fallback);
    return result ? [result] : [];
  }
}
