import { compactToolHistory } from '@/lib/agent/history';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { SentenceChunker } from '@/lib/agent/chunker';
import { SpeechPipeline } from '@/lib/agent/speech-pipeline';
import { SpeechGuard } from '@/lib/agent/speech-guard';
import { callCopy, questionText } from '@/lib/domain/call-language';
import { beginTurn, requiredStep } from '@/lib/agent/turn-policy';
import { systemPrompt } from '@/lib/agent/prompts/system';
import { turnContext } from '@/lib/agent/context';
import {
  askQuestion,
  findingsComplete,
  toolAllowed,
  transition,
} from '@/lib/agent/phases';
import { executeTool, finalizeCommit } from '@/lib/agent/tools';
import type { ToolEnvironment } from '@/lib/agent/tools';
import { TOOL_LABELS, toolNameSchema } from '@/lib/agent/tool-contracts';
import { domainState, trimHistory } from '@/lib/agent/session';
import type { Session, HistoryTurn } from '@/lib/agent/session';
import { diagnosisFor } from '@/lib/agent/snapshot';
import { sessionState } from '@/lib/agent/contracts';
import { lintSpeech } from '@/lib/domain/speech';
import type { Phase } from '@/lib/domain/types';
import type { ToolResult } from '@/lib/agent/tool-contracts';
import type {
  FunctionRequest,
  LlmProvider,
  ToolResponse,
} from '@/lib/llm/provider';
import type { SttProvider, TtsProvider } from '@/lib/voice/providers';
import type { EchoInput } from '@/lib/server/turn-input';
import type { EmitEchoEvent } from '@/lib/voice/events';
import { throwIfAborted } from '@/lib/voice/abort';
import type { Language } from '@/lib/voice/language';
import { runFollowupTurn } from '@/lib/agent/followup-turn';

export interface TurnMetrics {
  language?: Language;
  sttMs: number;
  llmFirstMs: number;
  llmTotalMs: number;
  ttsFirstMs: number;
  firstAudioMs: number;
  totalMs: number;
  historyBytes?: { before: number; after: number };
  providerModels?: { stt: string; tts: string };
  usageComplete?: boolean;
  ttsChars?: number;
  fallbacks?: number;
  providerFallbacks?: { stt: number; tts: number; llm: number };
  tools: string[];
  models: string[];
  tokens: { input: number; output: number; thoughts: number };
}
export interface TurnEnvironment {
  llm: LlmProvider;
  stt?: SttProvider;
  tts?: TtsProvider;
  tools: ToolEnvironment;
  signal: AbortSignal;
  maxToolRounds?: number;
  compactToolHistory?: boolean;
  onCommitPoint?: () => void;
  onMetrics?: (metrics: TurnMetrics) => void;
  onTool?: (call: FunctionRequest, result: ToolResult) => void;
  now?: () => number;
}
export async function runTurn(
  session: Session,
  input: EchoInput,
  emit: EmitEchoEvent,
  env: TurnEnvironment,
): Promise<TurnMetrics> {
  const lifetime = new AbortController();
  env = { ...env, signal: AbortSignal.any([env.signal, lifetime.signal]) };
  const now = env.now ?? performance.now.bind(performance);
  const started = now();
  const metrics: TurnMetrics = {
    language: session.lang,
    usageComplete: true,
    sttMs: 0,
    llmFirstMs: 0,
    llmTotalMs: 0,
    ttsFirstMs: 0,
    firstAudioMs: 0,
    totalMs: 0,
    providerFallbacks: { stt: 0, tts: 0, llm: 0 },
    tools: [],
    models: [],
    tokens: { input: 0, output: 0, thoughts: 0 },
  };
  throwIfAborted(env.signal);
  const wasFindings = !findingsComplete(session);
  let transcript: { text: string; ms: number };
  if (input.kind === 'audio') {
    if (!env.stt)
      throw new AppError(
        'PROVIDER_CONFIG',
        'Speech recognition is not configured',
      );
    session.counters.sttCalls += 1;
    try {
      transcript = await env.stt.transcribe(
        input.wav,
        session.lang,
        env.signal,
      );
    } catch (error: unknown) {
      if (metrics.providerFallbacks && error instanceof AppError)
        metrics.providerFallbacks.stt += Math.max(
          0,
          (error.providerAttempts ?? 1) - 1,
        );
      metrics.fallbacks = metrics.providerFallbacks?.stt ?? 0;
      metrics.sttMs = now() - started;
      metrics.totalMs = now() - started;
      metrics.usageComplete = false;
      env.onMetrics?.(metrics);
      throw error;
    }
  } else transcript = { text: input.text, ms: 0 };
  const parsed = z
    .strictObject({
      text: z.string().trim().min(1).max(8000),
      ms: z.number().nonnegative(),
      attempts: z.number().int().positive().optional(),
    })
    .safeParse(transcript);
  if (!parsed.success) {
    metrics.sttMs = transcript.ms;
    metrics.totalMs = now() - started;
    env.onMetrics?.(metrics);
    throw new AppError('NO_SPEECH', 'No usable seller speech was recognized');
  }
  if (metrics.providerFallbacks)
    metrics.providerFallbacks.stt = Math.max(
      0,
      (parsed.data.attempts ?? 1) - 1,
    );
  session.lastUserText = parsed.data.text;
  metrics.sttMs = parsed.data.ms;
  emit({
    event: 'transcript',
    data: { text: session.lastUserText, sttMs: metrics.sttMs },
  });
  if (session.mode === 'followup')
    return runFollowupTurn(session, emit, env, metrics, started, now);
  beginTurn(session);
  const history: HistoryTurn = {
    turn: session.turn,
    messages: [{ kind: 'user', text: session.lastUserText }],
  };
  session.history.push(history);
  const pipeline = new SpeechPipeline(
    env.tts,
    emit,
    env.signal,
    started,
    now,
    session.lang,
  );
  const copy = callCopy(session.lang);
  let guard: SpeechGuard | undefined;
  let reservedQuestion = '';
  let questionId = null as ReturnType<
    typeof diagnosisFor
  >['suggestedNextQuestion'];
  let responsePhase: Phase = session.phase;
  const createGuard = (): SpeechGuard => {
    const diagnosis = diagnosisFor(session, env.tools.data, env.tools.settings);
    responsePhase =
      session.phase === 'investigate' && wasFindings
        ? 'findings'
        : session.phase;
    questionId =
      session.phase === 'investigate' ? diagnosis.suggestedNextQuestion : null;
    reservedQuestion = questionId
      ? questionText(questionId, session.lang, env.tools.data)
      : session.phase === 'recommend' || session.phase === 'confirm'
        ? copy.saveQuestion
        : session.phase === 'intake'
          ? copy.intakeQuestion
          : '';
    return new SpeechGuard(
      session,
      env.tools.data,
      responsePhase,
      session.pendingCommit ? copy.savedReceipt : reservedQuestion,
    );
  };
  const speak = async (text: string): Promise<void> => {
    guard ??= createGuard();
    const approved = guard.accept(text);
    if (approved) await pipeline.push(approved);
  };
  try {
    let rounds = 0;
    const maxRounds = Math.min(4, env.maxToolRounds ?? 4);
    for (;;) {
      throwIfAborted(env.signal);
      const step = requiredStep(session, env.tools);
      if (rounds >= maxRounds && step.force)
        throw new AppError(
          'LLM_LOOP_LIMIT',
          'The agent could not complete its required tool steps. Please try again.',
          true,
        );
      const chunker = new SentenceChunker();
      const modelStarted = now();
      let result: Awaited<ReturnType<LlmProvider['stream']>>;
      try {
        result = await env.llm.stream(
          {
            system: `${systemPrompt(env.tools.data.seller.name, session.lang)}\n\n${turnContext(session, env.tools.data, step.note, env.tools.settings)}`,
            history: session.history.flatMap((turn) => turn.messages),
            tools: rounds >= maxRounds ? [] : step.tools,
            forceTools: step.force,
          },
          async (delta): Promise<void> => {
            if (!metrics.llmFirstMs) metrics.llmFirstMs = now() - started;
            if (step.force) return;
            for (const chunk of chunker.push(delta)) await speak(chunk);
          },
          env.signal,
        );
      } catch (error: unknown) {
        if (metrics.providerFallbacks && error instanceof AppError)
          metrics.providerFallbacks.llm += Math.max(
            0,
            (error.providerAttempts ?? 1) - 1,
          );
        throw error;
      } finally {
        metrics.llmTotalMs += now() - modelStarted;
      }
      session.counters.llmCalls += 1;
      metrics.models.push(result.model);
      metrics.usageComplete =
        metrics.usageComplete === true && result.usageComplete === true;
      if (metrics.providerFallbacks)
        metrics.providerFallbacks.llm += Math.max(
          0,
          (result.attempts ?? 1) - 1,
        );
      for (const key of ['input', 'output', 'thoughts'] as const) {
        metrics.tokens[key] += result.usage[key];
        session.counters.tokens[key] += result.usage[key];
      }
      history.messages.push(result.message);
      if (!result.calls.length) {
        if (step.force)
          throw new AppError(
            'PROVIDER_RESPONSE_INVALID',
            'Gemini did not perform the required tool operation',
          );
        for (const chunk of chunker.flush()) await speak(chunk);
        break;
      }
      if (rounds >= maxRounds)
        throw new AppError(
          'LLM_LOOP_LIMIT',
          'The agent tool limit was reached. Please try again.',
          true,
        );
      rounds += 1;
      const responses: ToolResponse[] = [];
      for (const call of result.calls) {
        throwIfAborted(env.signal);
        const name = toolNameSchema.safeParse(call.name);
        if (
          name.success &&
          toolAllowed(session, name.data) &&
          name.data !== 'commit_action_plan'
        ) {
          emit({
            event: 'tool',
            data: { name: name.data, label: TOOL_LABELS[name.data] },
          });
          metrics.tools.push(name.data);
        }
        const response = await executeTool(session, call, env.tools);
        env.onTool?.(call, response);
        if (name.success && name.data === 'commit_action_plan' && response.ok) {
          emit({
            event: 'tool',
            data: { name: name.data, label: TOOL_LABELS[name.data] },
          });
          metrics.tools.push(name.data);
        }
        responses.push({
          name: call.name,
          ...(call.id ? { id: call.id } : {}),
          response,
        });
        emit({ event: 'state', data: sessionState(session) });
      }
      history.messages.push({ kind: 'tools', results: responses });
    }
    guard ??= createGuard();
    for (const text of guard.complete()) await pipeline.push(text);
    if (reservedQuestion) {
      if (questionId) {
        history.questionId = questionId;
        askQuestion(session, questionId, domainState(session, env.tools.data));
      }
      await pipeline.push(reservedQuestion);
    }
    const finalText = [
      ...guard.chunks,
      reservedQuestion,
      session.pendingCommit ? copy.savedReceipt : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (
      !lintSpeech(
        finalText,
        responsePhase === 'commit' ? 'summary' : responsePhase,
      ).ok
    )
      throw new AppError(
        'SPEECH_INVALID',
        'The agent response did not meet the speaking rules',
      );
    await pipeline.finish();
    if (session.phase === 'recommend' && session.proposedPlan)
      transition(session, 'confirm');
    if (session.pendingCommit) {
      // Prepare the short receipt before the irreversible append. No provider
      // work remains between the commit point and its final state/receipt.
      const receipt = env.tts
        ? await pipeline.prepare(copy.savedReceipt)
        : undefined;
      await finalizeCommit(session, env.tools, env.signal);
      transition(session, 'done');
      env.onCommitPoint?.();
      pipeline.publishReceipt(copy.savedReceipt, receipt);
    }
    history.spoken = finalText;
    session.counters.ttsChars += pipeline.ttsChars;
    if (env.compactToolHistory)
      metrics.historyBytes = compactToolHistory(session);
    trimHistory(session);
    // The raw provider history stays intact. Appended, validated speech and
    // question IDs are carried in the next system context, not forged content.
    emit({ event: 'state', data: sessionState(session) });
    metrics.ttsFirstMs = pipeline.firstTtsMs;
    metrics.firstAudioMs = pipeline.firstAudioMs;
    metrics.totalMs = now() - started;
    emit({
      event: 'done',
      data: {
        timings: {
          sttMs: metrics.sttMs,
          llmFirstMs: metrics.llmFirstMs,
          ttsFirstMs: metrics.ttsFirstMs,
          totalMs: metrics.totalMs,
        },
        turn: session.turn,
      },
    });
    return metrics;
  } catch (error: unknown) {
    lifetime.abort();
    await pipeline.cancel();
    throw error;
  } finally {
    metrics.totalMs = now() - started;
    metrics.ttsChars = pipeline.ttsChars;
    if (metrics.providerFallbacks)
      metrics.providerFallbacks.tts = pipeline.fallbacks + pipeline.retries;
    metrics.fallbacks = Object.values(metrics.providerFallbacks ?? {}).reduce(
      (total, value) => total + value,
      0,
    );
    metrics.ttsFirstMs = pipeline.firstTtsMs;
    metrics.firstAudioMs = pipeline.firstAudioMs;
    env.onMetrics?.(metrics);
  }
}
