import type { ActionPlan, CommittedPlan } from '@/lib/domain/plan';
import type {
  DomainState,
  HypothesisScore,
  Phase,
  QuestionId,
  SellerFacts,
} from '@/lib/domain/types';
import type { SellerData } from '@/lib/domain/data-schemas';
import type { LlmMessage, TokenUsage } from '@/lib/llm/provider';
import type { ToolName } from '@/lib/agent/tool-contracts';
import type { Language } from '@/lib/voice/language';
import { AppError } from '@/lib/errors';
import type { FollowupContext } from '@/lib/domain/followup-types';
import { followupState } from '@/lib/domain/followup-planning';

export interface HistoryTurn {
  turn: number;
  messages: LlmMessage[];
  spoken?: string;
  sentences?: string[];
  interrupted?: boolean;
  questionId?: QuestionId;
}
export interface PlaybackResponse {
  turn: number;
  sentences: string[];
  spoken: string;
  interrupted: boolean;
  questionId?: QuestionId;
}
export interface Session {
  id: string;
  createdAt: number;
  readonly lang: Language;
  readonly mode: 'call' | 'followup';
  followup?: FollowupContext;
  phase: Phase;
  turn: number;
  reprompts?: number;
  questionsAsked: QuestionId[];
  facts: SellerFacts;
  toolsCalled: Set<ToolName>;
  hypotheses: HypothesisScore[];
  proposedPlan?: { plan: ActionPlan; proposedAtTurn: number };
  committedPlan?: CommittedPlan;
  pendingCommit?: CommittedPlan;
  history: HistoryTurn[];
  playback?: PlaybackResponse;
  lastUserText: string;
  counters: {
    sttCalls: number;
    ttsChars: number;
    llmCalls: number;
    tokens: TokenUsage;
  };
}
export function domainState(session: Session, data: SellerData): DomainState {
  if (session.mode === 'followup' && session.followup)
    return followupState(data, session.followup.rows, session.facts);
  return {
    snapshot: data.seller,
    skus: data.skus,
    cancellations: data.cancellations,
    facts: session.facts,
    questionsAsked: session.questionsAsked,
    toolsCalled: new Set(
      [...session.toolsCalled].filter(
        (name) =>
          name === 'get_seller_snapshot' ||
          name === 'get_sku_breakdown' ||
          name === 'get_cancellation_breakdown' ||
          name === 'get_listing_funnel',
      ),
    ),
  };
}
export function cloneSession(session: Session): Session {
  return {
    ...session,
    ...(session.followup
      ? { followup: structuredClone(session.followup) }
      : {}),
    facts: { ...session.facts },
    questionsAsked: [...session.questionsAsked],
    toolsCalled: new Set(session.toolsCalled),
    hypotheses: [...session.hypotheses],
    history: session.history.map((turn) => ({
      ...turn,
      messages: [...turn.messages],
    })),
    counters: { ...session.counters, tokens: { ...session.counters.tokens } },
  };
}
export function trimHistory(session: Session, maxMessages = 12): void {
  // Trim complete older seller turns, never half a signed tool exchange.
  while (
    session.history.length > 1 &&
    session.history.reduce((count, turn) => count + turn.messages.length, 0) >
      maxMessages
  )
    session.history.shift();
}
export function replaceSession(base: Session, draft: Session): void {
  if (base.lang !== draft.lang || base.mode !== draft.mode)
    throw new AppError(
      'INVALID_INPUT',
      'Start a fresh session to change language or call mode',
    );
  delete base.proposedPlan;
  delete base.pendingCommit;
  delete base.committedPlan;
  Object.assign(base, draft);
}
