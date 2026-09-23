/**
 * Webhook-authoritative checkout payment status for the Stripe return page.
 * Browser session_id is an identifier only — never activates Subscription.
 */

import type { PrismaClient, SubscriptionStatus } from "@prisma/client";
import { isPaidSubscriptionStatus } from "@/lib/platform/billing/checkout-eligibility";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type CheckoutPaymentUiPhase =
  | "pending"
  | "paid_provisioning"
  | "ready"
  | "failed"
  | "unknown";

export type CheckoutPaymentNextAction = "activate" | "sign_in" | "wait" | null;

export type CheckoutPaymentStatusView = {
  phase: CheckoutPaymentUiPhase;
  nextAction: CheckoutPaymentNextAction;
  workspaceId: string | null;
  /** True when Subscription is ACTIVE or TRIALING (webhook-reconciled). */
  paymentConfirmed: boolean;
  /** True when ProvisioningRun status is SUCCEEDED. */
  provisioningComplete: boolean;
  /** Owner still needs password activation. */
  activationRequired: boolean;
  /** Owner already has a password. */
  activationComplete: boolean;
  /** Recoverable delay — provisioning failed or stuck; support may retry. */
  provisioningRecoverable: boolean;
};

const CHECKOUT_SESSION_ID_RE = /^cs_[a-zA-Z0-9_]+$/;

export function isPlausibleStripeCheckoutSessionId(
  raw: string | null | undefined,
): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  return trimmed.length >= 10 && trimmed.length <= 256 && CHECKOUT_SESSION_ID_RE.test(trimmed);
}

function failedSubscriptionStatus(status: SubscriptionStatus): boolean {
  switch (status) {
    case "CANCELLED":
    case "INCOMPLETE":
    case "PAST_DUE":
      return true;
    case "ACTIVE":
    case "TRIALING":
    case "PENDING_PAYMENT":
      return false;
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return false;
    }
  }
}

/**
 * Resolve minimal UI status from authoritative DB state for a Checkout Session id.
 */
export async function resolveCheckoutPaymentStatus(input: {
  stripeCheckoutSessionId: string;
  prisma?: PrismaClient;
}): Promise<CheckoutPaymentStatusView> {
  const db = input.prisma ?? defaultPrisma;
  const sessionId = input.stripeCheckoutSessionId.trim();

  if (!isPlausibleStripeCheckoutSessionId(sessionId)) {
    return {
      phase: "unknown",
      nextAction: null,
      workspaceId: null,
      paymentConfirmed: false,
      provisioningComplete: false,
      activationRequired: false,
      activationComplete: false,
      provisioningRecoverable: false,
    };
  }

  const subscription = await db.subscription.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: {
      id: true,
      status: true,
      workspaceId: true,
      provisioningRun: {
        select: {
          status: true,
          workspaceId: true,
        },
      },
    },
  });

  if (!subscription) {
    return {
      phase: "unknown",
      nextAction: null,
      workspaceId: null,
      paymentConfirmed: false,
      provisioningComplete: false,
      activationRequired: false,
      activationComplete: false,
      provisioningRecoverable: false,
    };
  }

  if (failedSubscriptionStatus(subscription.status)) {
    return {
      phase: "failed",
      nextAction: null,
      workspaceId: subscription.workspaceId,
      paymentConfirmed: false,
      provisioningComplete: false,
      activationRequired: false,
      activationComplete: false,
      provisioningRecoverable: false,
    };
  }

  const paymentConfirmed = isPaidSubscriptionStatus(subscription.status);
  const run = subscription.provisioningRun;
  const provisioningComplete = run?.status === "SUCCEEDED";
  const provisioningRecoverable =
    paymentConfirmed &&
    (run?.status === "FAILED" ||
      (run != null &&
        run.status !== "SUCCEEDED" &&
        run.status !== "PENDING" &&
        run.status !== "RUNNING"));

  const workspaceId =
    subscription.workspaceId ?? run?.workspaceId ?? null;

  if (!paymentConfirmed) {
    return {
      phase: "pending",
      nextAction: "wait",
      workspaceId,
      paymentConfirmed: false,
      provisioningComplete: false,
      activationRequired: false,
      activationComplete: false,
      provisioningRecoverable: false,
    };
  }

  if (!provisioningComplete || !workspaceId) {
    return {
      phase: "paid_provisioning",
      nextAction: "wait",
      workspaceId,
      paymentConfirmed: true,
      provisioningComplete: false,
      activationRequired: false,
      activationComplete: false,
      provisioningRecoverable:
        Boolean(provisioningRecoverable) || run?.status === "FAILED",
    };
  }

  const owner = await db.workspaceMember.findFirst({
    where: {
      workspaceId,
      role: "OWNER",
      status: "ACTIVE",
    },
    select: {
      user: {
        select: {
          password: true,
          disabledAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const activationComplete = Boolean(owner?.user.password && !owner.user.disabledAt);
  const activationRequired = Boolean(
    owner && !owner.user.disabledAt && !owner.user.password,
  );

  return {
    phase: "ready",
    nextAction: activationRequired
      ? "activate"
      : activationComplete
        ? "sign_in"
        : "wait",
    workspaceId,
    paymentConfirmed: true,
    provisioningComplete: true,
    activationRequired,
    activationComplete,
    provisioningRecoverable: false,
  };
}
