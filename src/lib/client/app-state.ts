import { initialVoiceState } from '@/lib/client/voice-state';
import type { VoiceState } from '@/lib/client/voice-state';
import { dashboardSnapshotSchema } from '@/lib/client/dashboard-contracts';
import type { DashboardSnapshot } from '@/lib/client/dashboard-contracts';
import type { AgentState, SessionResponse } from '@/lib/agent/contracts';
import type { CommittedPlan } from '@/lib/domain/plan';
import type { EchoEvent } from '@/lib/voice/events';
import type { ErrorCode } from '@/lib/errors';
import { upsertTranscript } from '@/lib/client/transcript';

export interface ToolActivity {
  id: string;
  name: string;
  label: string;
}
export interface AppState extends VoiceState {
  sessionId: string | null;
  snapshot: DashboardSnapshot | null;
  snapshotError: string | null;
  toolActivity: ToolActivity[];
  currentTurn: number | null;
  currentQuestion: string | null;
  confirmation: 'accept' | 'decline' | null;
  committedPlan: CommittedPlan | null;
  ledgerLoading: boolean;
  ledgerError: string | null;
  errorCode: ErrorCode | null;
  prefix: string | null;
  segments: Record<number, string>;
  stableAgent: AgentState | null;
  activitySequence: number;
  turnPending: boolean;
  planNotice: string | null;
}
export type AppAction =
  | { type: 'voice'; state: VoiceState }
  | { type: 'session'; session: SessionResponse }
  | { type: 'turn'; prefix: string }
  | { type: 'event'; prefix: string; event: EchoEvent }
  | { type: 'error'; code: ErrorCode }
  | {
      type: 'confirmation';
      decision: 'accept' | 'decline';
      status: 'pending' | 'complete' | 'failed';
      state?: AgentState;
    }
  | { type: 'ledger:loading'; sessionId: string }
  | { type: 'ledger'; sessionId: string; record: CommittedPlan | null }
  | { type: 'ledger:error'; sessionId: string };
export function initialAppState(): AppState {
  return {
    ...initialVoiceState(),
    sessionId: null,
    snapshot: null,
    snapshotError: null,
    toolActivity: [],
    currentTurn: null,
    currentQuestion: null,
    confirmation: null,
    committedPlan: null,
    ledgerLoading: false,
    ledgerError: null,
    errorCode: null,
    prefix: null,
    segments: {},
    stableAgent: null,
    activitySequence: 0,
    turnPending: false,
    planNotice: null,
  };
}
function agentUpdate(state: AppState, agent: AgentState): AppState {
  if (state.agent?.committed && !agent.committed) return state;
  return {
    ...state,
    agent,
    confirmation: null,
    planNotice: agent.plan ? null : state.planNotice,
  };
}
function failed(state: AppState, code: ErrorCode): AppState {
  return {
    ...state,
    errorCode: code,
    agent:
      state.agent?.committed || state.confirmation || !state.turnPending
        ? state.agent
        : state.stableAgent,
    confirmation: null,
    turnPending: false,
  };
}
function eventUpdate(
  state: AppState,
  prefix: string,
  event: EchoEvent,
): AppState {
  if (!state.active) return state;
  if (state.prefix !== prefix)
    state = { ...state, prefix, segments: {}, currentQuestion: null };
  switch (event.event) {
    case 'transcript':
      return {
        ...state,
        messages: upsertTranscript(
          state.messages,
          `${prefix}-seller`,
          'seller',
          event.data.text,
        ),
      };
    case 'sentence': {
      const segments = { ...state.segments, [event.data.idx]: event.data.text };
      const ordered = Object.entries(segments)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([, text]) => text);
      return {
        ...state,
        segments,
        currentQuestion:
          [...ordered].reverse().find((text) => text.trim().endsWith('?')) ??
          null,
        messages: upsertTranscript(
          state.messages,
          `${prefix}-assistant`,
          'assistant',
          ordered.join(' '),
        ),
      };
    }
    case 'tool':
      return {
        ...state,
        toolActivity: [
          ...state.toolActivity,
          {
            id: `${prefix}-${String(state.activitySequence)}`,
            ...event.data,
          },
        ].slice(-50),
        tools: [...state.tools, event.data.label].slice(-4),
        activitySequence: state.activitySequence + 1,
      };
    case 'state':
      return agentUpdate(state, event.data);
    case 'fallback':
      return { ...state, notice: event.data.message };
    case 'error':
      return { ...failed(state, event.data.code), error: event.data.message };
    case 'done':
      return {
        ...state,
        currentTurn: event.data.turn,
        serverTimings: event.data.timings,
        stableAgent: state.agent,
        turnPending: false,
      };
    case 'audio':
      return state; // Playback remains owned by the existing audio queue.
  }
}
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'voice': {
      const voice = action.state;
      if (voice.active && !state.active) state = initialAppState();
      return {
        ...state,
        active: voice.active,
        language: voice.language,
        initializing: voice.initializing,
        phase: voice.phase,
        textFallback: voice.textFallback,
        error: voice.error,
        firstAudioMs: voice.firstAudioMs,
        measurements: voice.measurements,
      };
    }
    case 'session': {
      const snapshot = dashboardSnapshotSchema.safeParse(
        action.session.snapshot,
      );
      return {
        ...initialAppState(),
        active: true,
        initializing: state.initializing,
        phase: state.phase,
        textFallback: state.textFallback,
        sessionId: action.session.sessionId,
        language: action.session.lang ?? state.language,
        agent: action.session.initialState ?? null,
        stableAgent: action.session.initialState ?? null,
        maxQuestions: action.session.config.maxQuestions,
        snapshot: snapshot.success ? snapshot.data : null,
        snapshotError: snapshot.success
          ? null
          : 'The business snapshot is not available. You can continue the call.',
        messages: [
          {
            id: `${action.session.sessionId}-greeting`,
            role: 'assistant',
            text: action.session.greeting.text,
          },
        ],
      };
    }
    case 'turn':
      return {
        ...state,
        prefix: action.prefix,
        segments: {},
        currentQuestion: null,
        error: null,
        notice: null,
        errorCode: null,
        serverTimings: null,
        firstAudioMs: null,
        turnPending: true,
      };
    case 'event':
      return eventUpdate(state, action.prefix, action.event);
    case 'error':
      return failed(state, action.code);
    case 'confirmation':
      if (action.status === 'pending')
        return { ...state, confirmation: action.decision, error: null };
      return action.state
        ? {
            ...agentUpdate(state, action.state),
            stableAgent: action.state,
            turnPending: false,
            planNotice:
              action.decision === 'decline'
                ? 'Plan not saved. Tell your KAM what you would like to change.'
                : null,
          }
        : { ...state, confirmation: null, turnPending: false };
    case 'ledger:loading':
      return action.sessionId === state.sessionId
        ? { ...state, ledgerLoading: true, ledgerError: null }
        : state;
    case 'ledger:error':
      return action.sessionId === state.sessionId
        ? {
            ...state,
            ledgerLoading: false,
            ledgerError:
              'The commitment is confirmed, but its saved details are not available.',
          }
        : state;
    case 'ledger':
      if (action.sessionId !== state.sessionId) return state;
      if (
        !action.record ||
        !state.agent?.committed ||
        action.record.plan.id !== state.agent.plan?.id
      )
        return {
          ...state,
          ...(action.sessionId === state.sessionId
            ? {
                ledgerLoading: false,
                ledgerError: 'The saved plan details are not available.',
              }
            : {}),
        };
      return {
        ...state,
        committedPlan: action.record,
        ledgerLoading: false,
        ledgerError: null,
      };
  }
}
