import 'server-only';
import { z } from 'zod';
import { assertAccess, peerKey } from '@/lib/server/access';
import type { TokenBucket, DailyBudget } from '@/lib/server/rate-limit';
import { AppError } from '@/lib/errors';
import type { AppConfig } from '@/lib/server/config';
import type { SellerData } from '@/lib/domain/data-schemas';
import type { CommittedPlan } from '@/lib/domain/plan';
import { committedPlanSchema } from '@/lib/domain/plan';
import {
  confirmRequestSchema,
  sessionRequestSchema,
  sessionResponseSchema,
  sessionState,
} from '@/lib/agent/contracts';
import { cloneSession, replaceSession } from '@/lib/agent/session';
import { sellerSnapshot } from '@/lib/agent/snapshot';
import { transition } from '@/lib/agent/phases';
import { finalizeCommit, stageUiConfirmation } from '@/lib/agent/tools';
import type { ToolEnvironment } from '@/lib/agent/tools';
import type { SessionStore } from '@/lib/server/session-store';
import type { TurnService } from '@/lib/server/turn-service';
import type { GreetingCache } from '@/lib/server/greeting';
import { assertSameOrigin } from '@/lib/server/same-origin';
import { parseEchoInput, readJsonInput } from '@/lib/server/turn-input';
import { publicVoiceError } from '@/lib/server/voice-errors';
import { echoSseResponse } from '@/lib/server/sse';
import { throwIfAborted } from '@/lib/voice/abort';
import type { Language } from '@/lib/voice/language';
import { HINDI_GREETING } from '@/lib/server/greeting';
import type { Session } from '@/lib/agent/session';
import type { FollowupAudit } from '@/lib/domain/followup-types';
import { prepareFollowup } from '@/lib/server/followup-start';
import {
  advanceFollowup,
  captureFollowupView,
} from '@/lib/agent/followup-state';
import { followupGreeting } from '@/lib/domain/followup-speech';

export interface AgentServices {
  warmClips?: (language?: Language) => void;
  limiter?: TokenBucket;
  budget?: DailyBudget;
  sessions: SessionStore;
  turns: TurnService;
  greeting: GreetingCache;
  config: AppConfig;
  data: () => Promise<SellerData>;
  toolEnvironment: (session?: Session) => Promise<ToolEnvironment>;
  ledger: () => Promise<CommittedPlan[]>;
  lookupPlan?: (planId: string) => Promise<CommittedPlan | null>;
  readAudit?: (planId: string, runId: string) => Promise<FollowupAudit | null>;
}
export function apiFailure(error: unknown): Response {
  const actual =
    error instanceof z.ZodError
      ? new AppError('INVALID_INPUT', 'Request fields are invalid')
      : error;
  const body = publicVoiceError(actual);
  const status =
    body.code === 'ACCESS_DENIED'
      ? 401
      : body.code === 'RATE_LIMIT' || body.code === 'DAILY_LIMIT'
        ? 429
        : body.code === 'UPLOAD_TOO_LARGE'
          ? 413
          : body.code === 'INVALID_INPUT' || body.code === 'INVALID_AUDIO'
            ? 400
            : body.code === 'SESSION_NOT_FOUND'
              ? 404
              : body.code === 'SESSION_EXPIRED'
                ? 410
                : body.code === 'SESSION_LIMIT'
                  ? 429
                  : [
                        'SESSION_BUSY',
                        'TURN_CONFLICT',
                        'COMMIT_REJECTED',
                        'TOOL_NOT_ALLOWED',
                      ].includes(body.code)
                    ? 409
                    : 503;
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(body.code === 'RATE_LIMIT' ? { 'Retry-After': '15' } : {}),
    },
  });
}
export function createSessionHandler(
  services: AgentServices,
): (request: Request) => Promise<Response> {
  return async (request): Promise<Response> => {
    try {
      assertSameOrigin(request, services.config);
      assertAccess(request, services.config);
      const input = sessionRequestSchema.parse(await readJsonInput(request));
      if (input.lang === 'hi-IN' && !services.config.hinglishEnabled)
        throw new AppError(
          'INVALID_INPUT',
          'Hindi/Hinglish speech has not been enabled after provider verification',
        );
      if (
        services.budget &&
        services.budget.snapshot().accepted >= services.budget.snapshot().cap
      )
        throw new AppError('DAILY_LIMIT', 'Daily budget exhausted');
      if (
        (services.limiter?.take(
          `session:${peerKey(request, services.config)}`,
        ) ?? 0) > 0
      )
        throw new AppError('RATE_LIMIT', 'Too many calls', true);
      if (!services.config.providers.gemini)
        throw new AppError('PROVIDER_CONFIG', 'Gemini is not configured');
      const data = await services.data();
      // Resolve exact durable ownership before any provider work or session creation.
      const followup = await prepareFollowup(input, services, data);
      const greetingText = followup
        ? followupGreeting(
            data.followup.windowDays,
            input.lang,
            Boolean(followup.audit),
          )
        : undefined;
      const greeting = await services.greeting
        .get(request.signal, input.lang, greetingText)
        .catch((error: unknown) => {
          throwIfAborted(request.signal);
          if (input.lang !== 'hi-IN') throw error;
          return {
            text: greetingText ?? HINDI_GREETING,
            audioB64: null,
            mime: 'audio/wav' as const,
          };
        });
      throwIfAborted(request.signal);
      services.warmClips?.(input.lang);
      const session = services.sessions.create({
        lang: input.lang,
        ...(followup ? { followup } : {}),
      });
      if (session.followup) {
        if (session.followup.phase === 'FOLLOWUP_INTRO') {
          advanceFollowup(session, 'AUDIT');
          session.followup.auditQuestions = 1;
        }
        session.facts = {
          ...(session.followup.audit?.facts ??
            session.followup.original.sellerFacts ??
            {}),
        };
        // An old delivery estimate is not a fresh seven-day-review promise.
        if (!session.followup.audit) delete session.facts.restock_eta_days;
        captureFollowupView(session, data);
        if (session.followup.completedRecord) {
          session.committedPlan = session.followup.completedRecord;
          session.proposedPlan = {
            plan: session.committedPlan.plan,
            proposedAtTurn: 0,
          };
          session.phase = 'done';
        }
      }
      return Response.json(
        sessionResponseSchema.parse({
          sessionId: session.id,
          lang: session.lang,
          ...(session.followup ? { initialState: sessionState(session) } : {}),
          greeting,
          snapshot: sellerSnapshot(session, data, services.config),
          config: {
            maxUtteranceMs: Math.min(28000, services.config.maxUtteranceMs),
            maxQuestions: services.config.investigation.maxQuestions,
            bargeIn: true,
          },
        }),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error: unknown) {
      return apiFailure(error);
    }
  };
}
export function createTurnHandler(
  services: AgentServices,
): (request: Request) => Promise<Response> {
  return async (request): Promise<Response> => {
    try {
      assertSameOrigin(request, services.config);
      assertAccess(request, services.config);
      const retryAfter =
        services.limiter?.take(peerKey(request, services.config)) ?? 0;
      if (retryAfter)
        return Response.json(
          publicVoiceError(
            new AppError('RATE_LIMIT', 'Too many requests', true),
          ),
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'Cache-Control': 'no-store',
            },
          },
        );
      const input = await parseEchoInput(request, {
        ...(services.config.domain ? { domain: services.config.domain } : {}),
        maxBytes: Math.min(1048576, services.config.maxUtteranceBytes),
        maxDurationMs: Math.min(28000, services.config.maxUtteranceMs),
      });
      if (!input.turnId)
        throw new AppError('INVALID_INPUT', 'Supply a UUID turnId');
      services.sessions.get(input.sessionId);
      const turnId = input.turnId;
      return echoSseResponse(async (emit, signal): Promise<void> => {
        await services.turns.run({ ...input, turnId }, emit, signal);
      }, request.signal);
    } catch (error: unknown) {
      return apiFailure(error);
    }
  };
}
export function createConfirmHandler(
  services: AgentServices,
): (request: Request) => Promise<Response> {
  return async (request): Promise<Response> => {
    try {
      assertSameOrigin(request, services.config);
      assertAccess(request, services.config);
      const input = confirmRequestSchema.parse(await readJsonInput(request));
      const signal = AbortSignal.any([
        request.signal,
        services.sessions.signal(input.sessionId),
      ]);
      const state = await services.sessions.exclusive(
        input.sessionId,
        async (base) => {
          if (
            base.committedPlan?.plan.id === input.planId &&
            input.decision === 'accept'
          )
            return sessionState(base);
          services.sessions.assertCanTurn(base);
          if (
            base.phase !== 'confirm' ||
            base.proposedPlan?.plan.id !== input.planId
          )
            throw new AppError(
              'COMMIT_REJECTED',
              'Review the current session plan before confirming it',
            );
          services.budget?.accept();
          const draft = cloneSession(base);
          draft.turn += 1;
          draft.lastUserText = '';
          if (input.decision === 'decline') {
            if (draft.followup) {
              advanceFollowup(draft, 'DONE');
              draft.followup.awaitingAcceptance = false;
              draft.phase = 'done';
            } else transition(draft, 'recommend');
            delete draft.proposedPlan;
          } else {
            const environment = await services.toolEnvironment(draft);
            stageUiConfirmation(draft, input.planId, environment);
            await finalizeCommit(draft, environment, signal);
            transition(draft, 'done');
            if (draft.followup) {
              advanceFollowup(draft, 'DONE');
              draft.followup.awaitingAcceptance = false;
            }
          }
          replaceSession(base, draft);
          return sessionState(base);
        },
      );
      return Response.json(state, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error: unknown) {
      return apiFailure(error);
    }
  };
}
export function createLedgerHandler(
  services: AgentServices,
): () => Promise<Response> {
  return async (): Promise<Response> => {
    try {
      return Response.json(
        z
          .array(committedPlanSchema)
          .max(20)
          .parse(await services.ledger()),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error: unknown) {
      return apiFailure(error);
    }
  };
}
