/**
 * Stage 6.9 — paid Subscription → Workspace provisioning orchestrator.
 *
 * Durable authority: ProvisioningRun + ProvisioningStep.
 * Billing boundary: Stripe webhook reconciles Subscription to ACTIVE/TRIALING,
 * then invokes tryProvisionAfterBillingActivation. Failures never corrupt
 * Subscription status; runs become FAILED and are Master-Admin retryable.
 */

import type {
  PlatformAuditActorType,
  PrismaClient,
  ProvisioningRun,
} from "@prisma/client";
import { tryAutoSendOwnerActivationAfterProvision } from "@/lib/platform/activation";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  PROVISIONING_AUDIT,
  PROVISIONING_STEP_KEYS,
  provisioningIdempotencyKey,
} from "./constants";
import { evaluatePaidSubscriptionProvisioningEligibility } from "./eligibility";
import { ProvisioningActionError } from "./errors";
import {
  getOrCreateStep,
  isUniqueConstraintError,
  markStepFailed,
  markStepSucceeded,
  safeErrorMessage,
  writeSafeAudit,
  STEP_HANDLERS,
  type LoadedSubscription,
  type StepContext,
} from "./steps";

export type ProvisionPaidSubscriptionResult = {
  outcome:
    | "succeeded"
    | "already_succeeded"
    | "failed"
    | "in_progress"
    | "not_eligible";
  runId: string | null;
  workspaceId: string | null;
  reason?: string;
  lastError?: string | null;
};

/**
 * V1: after ACTIVE provision success, auto-send owner activation (idempotent).
 * Never throws; never affects Subscription / ProvisioningRun outcome.
 */
async function maybeAutoSendOwnerActivation(input: {
  result: ProvisionPaidSubscriptionResult;
  subscriptionId: string;
  actorType: PlatformAuditActorType;
  prisma: PrismaClient;
}): Promise<ProvisionPaidSubscriptionResult> {
  const { result } = input;
  if (
    (result.outcome !== "succeeded" &&
      result.outcome !== "already_succeeded") ||
    !result.workspaceId
  ) {
    return result;
  }

  const activationActor: "SYSTEM" | "WEBHOOK" =
    input.actorType === "WEBHOOK" ? "WEBHOOK" : "SYSTEM";

  await tryAutoSendOwnerActivationAfterProvision({
    workspaceId: result.workspaceId,
    subscriptionId: input.subscriptionId,
    prisma: input.prisma,
    actorType: activationActor,
  }).catch((error) => {
    console.error(
      "[platform] post-provision owner activation auto-send error",
      input.subscriptionId,
      result.workspaceId,
      error,
    );
  });

  return result;
}

async function loadSubscription(
  db: PrismaClient,
  subscriptionId: string,
): Promise<LoadedSubscription | null> {
  return db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      billingCustomer: {
        select: { id: true, email: true, workspaceId: true },
      },
      offer: {
        select: {
          id: true,
          status: true,
          workspaceId: true,
          planCode: true,
          includedSeats: true,
          additionalSeats: true,
          lineItems: {
            select: { kind: true, code: true, quantity: true },
            orderBy: { sortOrder: "asc" },
          },
          acceptance: { select: { id: true, acceptedEmail: true } },
          prospect: {
            select: {
              email: true,
              contactName: true,
              businessName: true,
              brokerageName: true,
              phone: true,
              region: true,
            },
          },
        },
      },
      provisioningRun: true,
    },
  }) as Promise<LoadedSubscription | null>;
}

async function ensureRun(input: {
  db: PrismaClient;
  subscription: LoadedSubscription;
}): Promise<ProvisioningRun> {
  const existing = input.subscription.provisioningRun;
  if (existing) {
    if (existing.status === "SUCCEEDED") return existing;
    return input.db.provisioningRun.update({
      where: { id: existing.id },
      data: {
        status: "RUNNING",
        attemptCount: existing.attemptCount + 1,
        lastError: null,
        startedAt: existing.startedAt ?? new Date(),
        completedAt: null,
      },
    });
  }

  const offerId = input.subscription.offerId;
  if (!offerId) {
    throw new Error("Subscription missing offerId");
  }

  try {
    return await input.db.provisioningRun.create({
      data: {
        offerId,
        subscriptionId: input.subscription.id,
        workspaceId: input.subscription.workspaceId,
        status: "RUNNING",
        idempotencyKey: provisioningIdempotencyKey(input.subscription.id),
        attemptCount: 1,
        startedAt: new Date(),
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await input.db.provisioningRun.findUnique({
      where: { subscriptionId: input.subscription.id },
    });
    if (!raced) throw error;
    if (raced.status === "SUCCEEDED") return raced;
    return input.db.provisioningRun.update({
      where: { id: raced.id },
      data: {
        status: "RUNNING",
        attemptCount: raced.attemptCount + 1,
        lastError: null,
        startedAt: raced.startedAt ?? new Date(),
        completedAt: null,
      },
    });
  }
}

async function runSteps(ctx: StepContext): Promise<void> {
  for (const stepKey of PROVISIONING_STEP_KEYS) {
    const step = await getOrCreateStep(ctx.db, ctx.run.id, stepKey);
    if (step.status === "SUCCEEDED") {
      if (stepKey === "CREATE_WORKSPACE" && ctx.run.workspaceId) {
        ctx.workspaceId = ctx.run.workspaceId;
      }
      continue;
    }

    try {
      await STEP_HANDLERS[stepKey](ctx);
      await markStepSucceeded(
        ctx.db,
        step,
        stepKey === "CREATE_WORKSPACE" ? ctx.workspaceId : null,
      );
    } catch (error) {
      const message = safeErrorMessage(error);
      await markStepFailed(ctx.db, step, message);
      throw error;
    }
  }
}

/**
 * Provision a paid Stripe Subscription into a Workspace.
 * Idempotent and retry-safe. Does not mutate Houzzat / Tenant Canary.
 */
export async function provisionPaidSubscription(input: {
  subscriptionId: string;
  prisma?: PrismaClient;
  actorType?: PlatformAuditActorType;
  actorOperatorId?: string | null;
  /** When false (default for webhook), skip an already-RUNNING run. */
  allowInProgressRetry?: boolean;
}): Promise<ProvisionPaidSubscriptionResult> {
  const db = input.prisma ?? defaultPrisma;
  const actorType = input.actorType ?? "SYSTEM";
  const actorOperatorId = input.actorOperatorId ?? null;
  const allowInProgressRetry = input.allowInProgressRetry ?? false;

  const eligibility = await evaluatePaidSubscriptionProvisioningEligibility({
    prisma: db,
    subscriptionId: input.subscriptionId,
  });

  if (eligibility.reason === "ALREADY_SUCCEEDED") {
    return maybeAutoSendOwnerActivation({
      result: {
        outcome: "already_succeeded",
        runId: eligibility.runId,
        workspaceId: eligibility.workspaceId,
        reason: eligibility.reason,
      },
      subscriptionId: input.subscriptionId,
      actorType,
      prisma: db,
    });
  }

  if (eligibility.reason === "IN_PROGRESS" && !allowInProgressRetry) {
    return {
      outcome: "in_progress",
      runId: eligibility.runId,
      workspaceId: eligibility.workspaceId,
      reason: eligibility.reason,
    };
  }

  if (!eligibility.eligible) {
    return {
      outcome: "not_eligible",
      runId: eligibility.runId,
      workspaceId: eligibility.workspaceId,
      reason: eligibility.reason,
    };
  }

  const subscription = await loadSubscription(db, input.subscriptionId);
  if (!subscription) {
    return {
      outcome: "not_eligible",
      runId: null,
      workspaceId: null,
      reason: "MISSING_OFFER",
    };
  }

  const run = await ensureRun({ db, subscription });
  if (run.status === "SUCCEEDED") {
    return maybeAutoSendOwnerActivation({
      result: {
        outcome: "already_succeeded",
        runId: run.id,
        workspaceId: run.workspaceId,
      },
      subscriptionId: input.subscriptionId,
      actorType,
      prisma: db,
    });
  }

  const ctx: StepContext = {
    db,
    run,
    subscription,
    workspaceId: run.workspaceId ?? subscription.workspaceId,
    ownerUserId: null,
    actorType,
    actorOperatorId,
    audited: new Set(),
  };

  await writeSafeAudit(
    ctx,
    PROVISIONING_AUDIT.STARTED,
    "Paid subscription provisioning started",
    { attemptCount: run.attemptCount },
  );

  try {
    await runSteps(ctx);
    return maybeAutoSendOwnerActivation({
      result: {
        outcome: "succeeded",
        runId: run.id,
        workspaceId: ctx.workspaceId,
      },
      subscriptionId: input.subscriptionId,
      actorType,
      prisma: db,
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    await db.provisioningRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        lastError: message,
        completedAt: new Date(),
        workspaceId: ctx.workspaceId ?? run.workspaceId,
      },
    });

    await writeSafeAudit(
      ctx,
      PROVISIONING_AUDIT.FAILED,
      "Paid subscription provisioning failed",
      {
        workspaceId: ctx.workspaceId,
        errorCode: "PROVISIONING_STEP_FAILED",
      },
    ).catch(() => {
      /* audit best-effort after failure */
    });

    return {
      outcome: "failed",
      runId: run.id,
      workspaceId: ctx.workspaceId,
      lastError: message,
    };
  }
}

/**
 * Webhook-safe invocation: never throws; never demotes Subscription.
 */
export async function tryProvisionAfterBillingActivation(input: {
  subscriptionId: string;
  prisma?: PrismaClient;
}): Promise<ProvisionPaidSubscriptionResult | null> {
  try {
    return await provisionPaidSubscription({
      subscriptionId: input.subscriptionId,
      prisma: input.prisma,
      actorType: "WEBHOOK",
      actorOperatorId: null,
    });
  } catch (error) {
    console.error(
      "[platform] provisioning after billing activation failed",
      input.subscriptionId,
      error,
    );
    return null;
  }
}

/**
 * Master Admin retry / start for an eligible paid Subscription.
 */
export async function retryPaidSubscriptionProvisioning(input: {
  subscriptionId: string;
  operatorId: string;
  prisma?: PrismaClient;
}): Promise<ProvisionPaidSubscriptionResult> {
  const db = input.prisma ?? defaultPrisma;
  const eligibility = await evaluatePaidSubscriptionProvisioningEligibility({
    prisma: db,
    subscriptionId: input.subscriptionId,
  });

  if (eligibility.reason === "ALREADY_SUCCEEDED") {
    throw new ProvisioningActionError(
      "Provisioning already succeeded for this subscription",
      "ALREADY_PROVISIONED",
      409,
    );
  }

  if (!eligibility.eligible && eligibility.reason !== "IN_PROGRESS") {
    throw new ProvisioningActionError(
      `Subscription is not eligible for provisioning (${eligibility.reason})`,
      "NOT_ELIGIBLE",
      409,
    );
  }

  const result = await provisionPaidSubscription({
    subscriptionId: input.subscriptionId,
    prisma: db,
    actorType: "OPERATOR",
    actorOperatorId: input.operatorId,
    allowInProgressRetry: true,
  });

  if (result.outcome === "failed") {
    throw new ProvisioningActionError(
      result.lastError ?? "Provisioning failed",
      "PROVISIONING_FAILED",
      500,
    );
  }

  return result;
}
