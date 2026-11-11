import 'server-only';
import { randomUUID } from 'node:crypto';
import type { AgentServices } from '@/lib/server/agent-api';
import type { SessionRequest } from '@/lib/agent/contracts';
import type { FollowupContext } from '@/lib/domain/followup-types';
import type { SellerData } from '@/lib/domain/data-schemas';
import { committedPlanSchema } from '@/lib/domain/plan';
import { followupAuditSchema } from '@/lib/domain/followup-types';
import { auditActions } from '@/lib/domain/followup-audit';
import { businessDate } from '@/lib/server/business-date';
import { calendarDate } from '@/lib/domain/dates';
import { AppError } from '@/lib/errors';

export async function prepareFollowup(
  input: SessionRequest,
  services: AgentServices,
  data: SellerData,
): Promise<FollowupContext | undefined> {
  if (input.mode !== 'followup') return undefined;
  const planId = input.planId;
  if (!planId)
    throw new AppError(
      'INVALID_INPUT',
      'Choose a committed plan for the simulated review',
    );
  const found = services.lookupPlan
    ? await services.lookupPlan(planId)
    : (await services.ledger()).find((record) => record.plan.id === planId);
  const parsed = committedPlanSchema.safeParse(found);
  if (
    !parsed.success ||
    parsed.data.plan.id !== planId ||
    parsed.data.plan.sellerId !== data.seller.sellerId
  )
    throw new AppError(
      'COMMIT_REJECTED',
      'This committed plan is unavailable for this seller',
    );
  const original = parsed.data;
  const base = original.plan.review
    ? new Date(`${original.plan.review.simulatedDate}T00:00:00Z`)
    : businessDate(new Date(original.committedAt));
  const simulatedDate = calendarDate(base, data.followup.windowDays);
  const runId = input.followupRunId ?? randomUUID();
  const existing = await services.readAudit?.(planId, runId);
  if (existing) {
    const audit = followupAuditSchema.parse(existing);
    const accepted = original.acceptedActionIds;
    if (
      audit.planId !== planId ||
      audit.runId !== runId ||
      audit.simulatedDate !== simulatedDate ||
      audit.rows.length !== accepted.length ||
      !audit.rows.every((row) => accepted.includes(row.id))
    )
      throw new AppError(
        'COMMIT_REJECTED',
        'The recorded audit does not belong to this commitment',
      );
    const completed = services.lookupPlan
      ? await services.lookupPlan(`review-${runId}`)
      : (await services.ledger()).find(
          (record) => record.plan.id === `review-${runId}`,
        );
    if (
      completed &&
      (completed.plan.review?.runId !== runId ||
        completed.plan.review.parentPlanId !== planId)
    )
      throw new AppError(
        'COMMIT_REJECTED',
        'This review commitment belongs to another run',
      );
    return {
      original,
      runId,
      simulatedDate,
      phase: completed ? 'DONE' : 'NEXT_STEPS',
      phaseTrace: completed
        ? [...audit.phaseTrace, 'DONE']
        : [...audit.phaseTrace],
      ...(completed ? { completedRecord: completed } : {}),
      rows: audit.rows,
      audit,
      auditQuestions: 1,
      awaitingAcceptance: false,
    };
  }
  return {
    original,
    runId,
    simulatedDate,
    phase: 'FOLLOWUP_INTRO',
    phaseTrace: ['FOLLOWUP_INTRO'],
    rows: auditActions(original, data.followup),
    auditQuestions: 0,
    awaitingAcceptance: false,
  };
}
