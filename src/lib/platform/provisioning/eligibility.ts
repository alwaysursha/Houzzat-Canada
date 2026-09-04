/**
 * Stage 6.9 — provisioning eligibility.
 * Stripe-webhook-confirmed Subscription status is authority — not browser redirect.
 */

import type {
  PlanCode,
  PrismaClient,
  ProvisioningRunStatus,
  SubscriptionStatus,
} from "@prisma/client";

export type ProvisioningEligibilityReason =
  | "ELIGIBLE"
  | "ALREADY_SUCCEEDED"
  | "NOT_STRIPE"
  | "STATUS_NOT_PAID"
  | "MISSING_OFFER"
  | "MISSING_ACCEPTANCE"
  | "MISSING_BILLING_CUSTOMER"
  | "INVALID_COMMERCIAL_SNAPSHOT"
  | "WORKSPACE_ALREADY_LINKED_WITHOUT_RUN"
  | "IN_PROGRESS";

export type ProvisioningEligibility = {
  eligible: boolean;
  reason: ProvisioningEligibilityReason;
  subscriptionId: string;
  offerId: string | null;
  workspaceId: string | null;
  runId: string | null;
  runStatus: ProvisioningRunStatus | null;
  canRetry: boolean;
};

const PAID_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "ACTIVE",
  "TRIALING",
]);

const PLAN_CODES: ReadonlySet<PlanCode> = new Set([
  "SOLO",
  "TEAM",
  "BROKERAGE",
]);

export function isPaidProvisioningStatus(
  status: SubscriptionStatus,
): boolean {
  return PAID_STATUSES.has(status);
}

function commercialSnapshotLooksValid(input: {
  planCode: PlanCode | null;
  includedSeats: number;
  commercialSnapshotJson: unknown;
}): boolean {
  if (!input.planCode || !PLAN_CODES.has(input.planCode)) return false;
  if (!Number.isInteger(input.includedSeats) || input.includedSeats < 1) {
    return false;
  }
  if (
    input.commercialSnapshotJson == null ||
    typeof input.commercialSnapshotJson !== "object"
  ) {
    return false;
  }
  return true;
}

/**
 * Evaluate whether a Subscription may start or retry paid provisioning.
 *
 * Note: workspaceId may already be set after a partial LINK step — retry remains
 * allowed when no SUCCEEDED run exists.
 */
export async function evaluatePaidSubscriptionProvisioningEligibility(input: {
  prisma: PrismaClient;
  subscriptionId: string;
}): Promise<ProvisioningEligibility> {
  const subscription = await input.prisma.subscription.findUnique({
    where: { id: input.subscriptionId },
    include: {
      billingCustomer: { select: { id: true } },
      offer: {
        select: {
          id: true,
          status: true,
          acceptance: { select: { id: true } },
        },
      },
      provisioningRun: {
        select: { id: true, status: true, workspaceId: true },
      },
    },
  });

  if (!subscription) {
    return {
      eligible: false,
      reason: "MISSING_OFFER",
      subscriptionId: input.subscriptionId,
      offerId: null,
      workspaceId: null,
      runId: null,
      runStatus: null,
      canRetry: false,
    };
  }

  const run = subscription.provisioningRun;
  if (run?.status === "SUCCEEDED") {
    return {
      eligible: false,
      reason: "ALREADY_SUCCEEDED",
      subscriptionId: subscription.id,
      offerId: subscription.offerId,
      workspaceId: subscription.workspaceId ?? run.workspaceId,
      runId: run.id,
      runStatus: run.status,
      canRetry: false,
    };
  }

  if (subscription.source !== "STRIPE") {
    return {
      eligible: false,
      reason: "NOT_STRIPE",
      subscriptionId: subscription.id,
      offerId: subscription.offerId,
      workspaceId: subscription.workspaceId,
      runId: run?.id ?? null,
      runStatus: run?.status ?? null,
      canRetry: false,
    };
  }

  if (!isPaidProvisioningStatus(subscription.status)) {
    return {
      eligible: false,
      reason: "STATUS_NOT_PAID",
      subscriptionId: subscription.id,
      offerId: subscription.offerId,
      workspaceId: subscription.workspaceId,
      runId: run?.id ?? null,
      runStatus: run?.status ?? null,
      canRetry: false,
    };
  }

  if (!subscription.offerId || !subscription.offer) {
    return {
      eligible: false,
      reason: "MISSING_OFFER",
      subscriptionId: subscription.id,
      offerId: subscription.offerId,
      workspaceId: subscription.workspaceId,
      runId: run?.id ?? null,
      runStatus: run?.status ?? null,
      canRetry: false,
    };
  }

  if (!subscription.offer.acceptance) {
    return {
      eligible: false,
      reason: "MISSING_ACCEPTANCE",
      subscriptionId: subscription.id,
      offerId: subscription.offerId,
      workspaceId: subscription.workspaceId,
      runId: run?.id ?? null,
      runStatus: run?.status ?? null,
      canRetry: false,
    };
  }

  if (!subscription.billingCustomer) {
    return {
      eligible: false,
      reason: "MISSING_BILLING_CUSTOMER",
      subscriptionId: subscription.id,
      offerId: subscription.offerId,
      workspaceId: subscription.workspaceId,
      runId: run?.id ?? null,
      runStatus: run?.status ?? null,
      canRetry: false,
    };
  }

  if (
    !commercialSnapshotLooksValid({
      planCode: subscription.planCode,
      includedSeats: subscription.includedSeats,
      commercialSnapshotJson: subscription.commercialSnapshotJson,
    })
  ) {
    return {
      eligible: false,
      reason: "INVALID_COMMERCIAL_SNAPSHOT",
      subscriptionId: subscription.id,
      offerId: subscription.offerId,
      workspaceId: subscription.workspaceId,
      runId: run?.id ?? null,
      runStatus: run?.status ?? null,
      canRetry: false,
    };
  }

  // Linked workspace without any run is an architecture conflict — do not invent a second workspace.
  if (subscription.workspaceId && !run) {
    return {
      eligible: false,
      reason: "WORKSPACE_ALREADY_LINKED_WITHOUT_RUN",
      subscriptionId: subscription.id,
      offerId: subscription.offerId,
      workspaceId: subscription.workspaceId,
      runId: null,
      runStatus: null,
      canRetry: false,
    };
  }

  // Incomplete runs (PENDING / RUNNING / FAILED / CANCELLED) remain retryable.
  // Callers that must avoid concurrent double-runs (webhook) should skip RUNNING.
  if (run?.status === "RUNNING") {
    return {
      eligible: true,
      reason: "IN_PROGRESS",
      subscriptionId: subscription.id,
      offerId: subscription.offerId,
      workspaceId: subscription.workspaceId ?? run.workspaceId,
      runId: run.id,
      runStatus: run.status,
      canRetry: true,
    };
  }

  const canRetry =
    !run ||
    run.status === "FAILED" ||
    run.status === "PENDING" ||
    run.status === "CANCELLED";

  return {
    eligible: true,
    reason: "ELIGIBLE",
    subscriptionId: subscription.id,
    offerId: subscription.offerId,
    workspaceId: subscription.workspaceId ?? run?.workspaceId ?? null,
    runId: run?.id ?? null,
    runStatus: run?.status ?? null,
    canRetry,
  };
}
