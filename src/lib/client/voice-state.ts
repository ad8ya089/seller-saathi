import type { EchoEvent, EchoTimings } from '@/lib/voice/events';
import type { EchoSubmission } from '@/lib/client/sse';
import type { AudioQueue } from '@/lib/client/audio-queue';
import type { AgentState, SessionResponse } from '@/lib/agent/contracts';
import type { ErrorCode } from '@/lib/errors';

export type VoicePhase = 'idle' | 'listening' | 'processing' | 'speaking';
export interface TranscriptMessage {
  id: string;
  role: 'seller' | 'assistant';
  text: string;
}
export interface TurnMeasurement {
  turn: number;
  source: 'voice' | 'text';
  firstAudioMs: number | null;
  server: EchoTimings | null;
  failed: boolean;
}
export interface VoiceState {
  active: boolean;
  initializing: boolean;
  phase: VoicePhase;
  textFallback: boolean;
  error: string | null;
  notice: string | null;
  agent: AgentState | null;
  maxQuestions: number | null;
  tools: string[];
  messages: TranscriptMessage[];
  firstAudioMs: number | null;
  serverTimings: EchoTimings | null;
  measurements: TurnMeasurement[];
}
export function initialVoiceState(): VoiceState {
  return {
    active: false,
    initializing: false,
    phase: 'idle',
    textFallback: false,
    error: null,
    notice: null,
    agent: null,
    maxQuestions: null,
    tools: [],
    messages: [],
    firstAudioMs: null,
    serverTimings: null,
    measurements: [],
  };
}
export interface MicrophoneCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
  onVoiceFrame: () => void;
  onMisfire: () => void;
}
export interface MicrophoneHandle {
  pause: () => Promise<void>;
  start: () => Promise<void>;
  destroy: () => Promise<void>;
}
export interface AudioResources {
  createQueue: () => AudioQueue;
  resume: () => Promise<void>;
  suspend: () => Promise<void>;
  close: () => Promise<void>;
  speakFallback: (text: string, signal: AbortSignal) => Promise<void>;
  openMicrophone: (
    callbacks: MicrophoneCallbacks,
    signal: AbortSignal,
  ) => Promise<MicrophoneHandle>;
}
export interface VoiceDependencies {
  observe?: {
    session: (session: SessionResponse) => void;
    turn: (prefix: string) => void;
    event: (prefix: string, event: EchoEvent) => void;
    error: (code: ErrorCode) => void;
    confirmation: (
      decision: 'accept' | 'decline',
      status: 'pending' | 'complete' | 'failed',
      state?: AgentState,
    ) => void;
  };
  createAudio: () => AudioResources;
  createId: () => string;
  now: () => number;
  openSession: (signal: AbortSignal) => Promise<SessionResponse>;
  endSession: (sessionId: string) => Promise<void>;
  confirmPlan: (
    sessionId: string,
    planId: string,
    decision: 'accept' | 'decline',
    signal: AbortSignal,
  ) => Promise<AgentState>;
  send: (
    input: EchoSubmission,
    onEvent: (event: EchoEvent) => Promise<void>,
    signal: AbortSignal,
  ) => Promise<void>;
  cooldown: (signal: AbortSignal) => Promise<void>;
}
