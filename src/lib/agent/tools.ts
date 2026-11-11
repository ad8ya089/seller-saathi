import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { buildPlan, evaluateActions } from '@/lib/domain/actions';
import { calendarDate } from '@/lib/domain/dates';
import { ACTION_POLICY } from '@/lib/domain/action-context';
import {
  cancellationMetrics,
  inventoryMetrics,
} from '@/lib/domain/data-calculations';
import { sellerFactsSchema, sellerFactSchema } from '@/lib/domain/types';
import { committedPlanSchema } from '@/lib/domain/plan';
import type { CommittedPlan } from '@/lib/domain/plan';
import type { SellerData } from '@/lib/domain/data-schemas';
import type { FunctionRequest } from '@/lib/llm/provider';
import { TOOL_ARGS, toolNameSchema } from '@/lib/agent/tool-contracts';
import type { ToolResult } from '@/lib/agent/tool-contracts';
import { domainState } from '@/lib/agent/session';
import type { Session } from '@/lib/agent/session';
import {
  diagnosisFor,
  sellerSnapshot,
  spokenEvidence,
} from '@/lib/agent/snapshot';
import type { DomainSettings } from '@/lib/agent/snapshot';
import { supportsFact, verifiedAcceptance } from '@/lib/agent/guards';
import { findingsComplete, toolAllowed, transition } from '@/lib/agent/phases';
import { throwIfAborted } from '@/lib/voice/abort';
import { share } from '@/lib/domain/numbers';

export interface ToolEnvironment {
  data: SellerData;
  settings?: DomainSettings;
  today: Date;
  now: () => Date;
  createPlanId: () => string;
  append: (record: CommittedPlan, signal: AbortSignal) => Promise<void>;
}
function rejected(message: string): never {
  throw new AppError('COMMIT_REJECTED', message);
}
function stageCommit(
  session: Session,
  planId: string,
  acceptedActionIds: string[],
  env: ToolEnvironment,
): ToolResult {
  const proposed = session.proposedPlan;
  if (!proposed || proposed.plan.id !== planId)
    rejected('This plan does not belong to the session');
  if (session.phase !== 'confirm' || proposed.proposedAtTurn >= session.turn)
    rejected('A plan must be spoken in an earlier turn before acceptance');
  if (
    !acceptedActionIds.length ||
    new Set(acceptedActionIds).size !== acceptedActionIds.length ||
    !acceptedActionIds.every((id) =>
      proposed.plan.actions.some((action) => action.id === id),
    )
  )
    rejected('Accepted actions must be a nonempty unique subset of this plan');
  const eligible = evaluateActions(domainState(session, env.data), env.settings)
    .filter((action) => action.eligible)
    .map((action) => action.id);
  if (!proposed.plan.actions.every((action) => eligible.includes(action.id)))
    rejected(
      'The plan is no longer eligible. Replan before requesting acceptance',
    );
  const followUpDate = calendarDate(env.today, ACTION_POLICY.followUpDays);
  const record = committedPlanSchema.parse({
    schemaVersion: 1,
    event: 'plan_committed',
    plan: {
      ...proposed.plan,
      followUpDate,
      checkpoint: { ...proposed.plan.checkpoint, dueDate: followUpDate },
    },
    committedAt: env.now().toISOString(),
    acceptedActionIds,
  });
  session.pendingCommit = record;
  transition(session, 'commit');
  return {
    ok: true,
    pending: true,
    planId,
    followUpDate,
    checkpoints: record.plan.checkpoint,
    message:
      'Acceptance verified. The ledger write is pending successful completion of this turn. Do not claim it is saved yet.',
  };
}
function execute(
  session: Session,
  call: FunctionRequest,
  env: ToolEnvironment,
): ToolResult {
  const name = toolNameSchema.parse(call.name);
  if (!toolAllowed(session, name))
    throw new AppError(
      'TOOL_NOT_ALLOWED',
      'Tool is not allowed in this phase. Follow the server context.',
    );
  const parsed = TOOL_ARGS[name].safeParse(call.args);
  if (!parsed.success)
    throw new AppError(
      'INVALID_INPUT',
      `Arguments do not match the schema for ${name}`,
    );
  switch (name) {
    case 'get_seller_snapshot': {
      session.toolsCalled.add(name);
      if (session.phase === 'intake') transition(session, 'findings');
      return { ok: true, ...sellerSnapshot(session, env.data, env.settings) };
    }
    case 'get_sku_breakdown': {
      const args = TOOL_ARGS[name].parse(call.args);
      session.toolsCalled.add(name);
      if (session.phase === 'findings' && findingsComplete(session))
        transition(session, 'investigate');
      const products = [...env.data.skus.skus]
        .sort((left, right) =>
          left.ordersLast - left.ordersThis ===
          right.ordersLast - right.ordersThis
            ? right.ordersLast - left.ordersLast
            : right.ordersLast -
              right.ordersThis -
              (left.ordersLast - left.ordersThis),
        )
        .slice(0, args.limit ?? 10)
        .map((sku) => ({
          spokenName: sku.spokenName,
          ordersLast: sku.ordersLast,
          ordersThis: sku.ordersThis,
          stock: sku.stock,
          outOfStock: sku.stock === 0,
          oosSinceDay: sku.oosSinceDay,
        }));
      return {
        ok: true,
        synthetic: true,
        products,
        concentration: inventoryMetrics(env.data.seller, env.data.skus),
        spokenEvidence: spokenEvidence(session, env.data),
        diagnosis: diagnosisFor(session, env.data, env.settings),
      };
    }
    case 'get_cancellation_breakdown': {
      session.toolsCalled.add(name);
      if (session.phase === 'findings' && findingsComplete(session))
        transition(session, 'investigate');
      const metrics = cancellationMetrics(env.data.cancellations);
      return {
        ok: true,
        synthetic: true,
        reasons: env.data.cancellations.reasons.map((row) => ({
          ...row,
          shareLast: share(row.last, metrics.totalLast),
          shareThis: share(row.this, metrics.totalThis),
        })),
        metrics,
        spokenEvidence: spokenEvidence(session, env.data),
        diagnosis: diagnosisFor(session, env.data, env.settings),
      };
    }
    case 'get_listing_funnel':
      session.toolsCalled.add(name);
      return {
        ok: true,
        available: false,
        reason: 'Listing funnel data is not available in this demo.',
      };
    case 'record_seller_fact': {
      const fact = sellerFactSchema.parse({
        ...TOOL_ARGS[name].parse(call.args),
        turn: session.turn,
      });
      if (
        !supportsFact(
          fact,
          session.lastUserText,
          session.questionsAsked.at(-1),
          session.lang,
        )
      )
        rejected(
          'The fact value and exact quote must be supported by the latest seller answer',
        );
      session.facts = sellerFactsSchema.parse({
        ...session.facts,
        [fact.factId]: fact,
      });
      session.toolsCalled.add(name);
      const diagnosis = diagnosisFor(session, env.data, env.settings);
      // Allow all facts from this answer to be recorded before moving on.
      return {
        ok: true,
        recorded: fact,
        ...diagnosis,
        eligibleActions: evaluateActions(
          domainState(session, env.data),
          env.settings,
        ).filter((action) => action.eligible),
      };
    }
    case 'propose_action_plan': {
      const args = TOOL_ARGS[name].parse(call.args);
      if (
        !findingsComplete(session) ||
        !diagnosisFor(session, env.data, env.settings).readyToRecommend
      )
        rejected('Complete the required findings and investigation first');
      if (new Set(args.actionIds).size !== args.actionIds.length)
        rejected('Choose unique action IDs');
      const plan = buildPlan(
        domainState(session, env.data),
        env.today,
        env.createPlanId(),
        { ...env.settings, actionIds: args.actionIds },
      );
      session.proposedPlan = { plan, proposedAtTurn: session.turn };
      session.toolsCalled.add(name);
      return { ok: true, planId: plan.id, plan };
    }
    case 'commit_action_plan': {
      const args = TOOL_ARGS[name].parse(call.args);
      if (
        !verifiedAcceptance(
          args.confirmationQuote,
          session.lastUserText,
          session.lang,
        )
      )
        rejected(
          'Acceptance must be explicit, unambiguous and supported by the latest seller utterance',
        );
      return stageCommit(session, args.planId, args.acceptedActionIds, env);
    }
  }
}
export function executeTool(
  session: Session,
  call: FunctionRequest,
  env: ToolEnvironment,
): Promise<ToolResult> {
  return Promise.resolve().then((): ToolResult => {
    try {
      return execute(session, call, env);
    } catch (error: unknown) {
      if (error instanceof AppError) return { ok: false, error: error.message };
      if (error instanceof z.ZodError)
        return {
          ok: false,
          error:
            'Invalid tool name or arguments. Use the declared schema and latest seller quote.',
        };
      return {
        ok: false,
        error:
          'This operation could not be completed. Please correct the request.',
      };
    }
  });
}
export function stageUiConfirmation(
  session: Session,
  planId: string,
  env: ToolEnvironment,
): ToolResult {
  // This entry point is used only by the validated UI route, never by a tool
  // argument, marker in a transcript, or model-controlled confirmation source.
  if (session.committedPlan?.plan.id === planId)
    return { ok: true, committed: true, planId };
  return stageCommit(
    session,
    planId,
    session.proposedPlan?.plan.actions.map((action) => action.id) ?? [],
    env,
  );
}
export async function finalizeCommit(
  session: Session,
  env: ToolEnvironment,
  signal: AbortSignal,
): Promise<void> {
  if (session.committedPlan || !session.pendingCommit) return;
  throwIfAborted(signal);
  const record = session.pendingCommit;
  await env.append(record, signal);
  // The durable append is the commit point. After it begins it cannot be
  // revoked by a later disconnect; keep memory consistent with the ledger.
  session.committedPlan = record;
  delete session.pendingCommit;
  transition(session, 'summary');
}
