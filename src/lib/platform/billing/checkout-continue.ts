/**
 * Secure post-payment continue handoff into owner activation or Pro sign-in.
 * Gated by webhook-authoritative checkout session state — never by browser alone.
 */

import type { PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  OWNER_ACTIVATION_AUDIT,
  OWNER_ACTIVATION_ENTITY_TYPE,
  OWNER_ACTIVATION_PATH_PREFIX,
  OWNER_ACTIVATION_TTL_MS,
} from "@/lib/platform/activation/constants";
import {
  buildOwnerOnboardingProSignInUrl,
} from "@/lib/platform/activation/onboarding-pro-auth";
import { ensureWorkspaceOnboardingState } from "@/lib/platform/activation/onboarding-state";
import {
  createOwnerActivationRawToken,
  hashOwnerActivationToken,
} from "@/lib/platform/activation/token";
import { resolveCheckoutPaymentStatus } from "@/lib/platform/billing/checkout-payment-status";
import { HOUZZATPRO_APP_BOOTSTRAP_ORIGIN } from "@/lib/mobile/platform-bootstrap";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type CheckoutContinueResult =
  | {
      ok: true;
      kind: "activate" | "sign_in";
      url: string;
      workspaceId: string;
    }
  | {
      ok: false;
      code:
        | "NOT_READY"
        | "UNKNOWN_SESSION"
        | "FAILED"
        | "NO_OWNER"
        | "OWNER_DISABLED";
      message: string;
    };

/**
 * Mint a fresh activation URL for browser continue without revoking email tokens.
 * Email activation remains a parallel recovery path.
 */
async function mintOwnerActivationContinueUrl(input: {
  db: PrismaClient;
  workspaceId: string;
  userId: string;
  stripeCheckoutSessionId: string;
}): Promise<string> {
  await ensureWorkspaceOnboardingState(input.db, input.workspaceId);

  const rawToken = createOwnerActivationRawToken();
  const tokenHash = hashOwnerActivationToken(rawToken);
  const expiresAt = new Date(Date.now() + OWNER_ACTIVATION_TTL_MS);

  const activation = await input.db.workspaceOwnerActivation.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      tokenHash,
      status: "PENDING",
      expiresAt,
      createdByType: "SYSTEM",
      createdByOperatorId: null,
    },
    select: { id: true },
  });

  await writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: OWNER_ACTIVATION_AUDIT.CREATED,
      entityType: OWNER_ACTIVATION_ENTITY_TYPE,
      entityId: activation.id,
      summary: "Owner activation continue token minted after payment success",
      metadata: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        activationId: activation.id,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        continueHandoff: true,
      },
    },
    input.db,
  );

  return `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}${OWNER_ACTIVATION_PATH_PREFIX}/${rawToken}`;
}

export async function continueAfterCheckoutPayment(input: {
  stripeCheckoutSessionId: string;
  prisma?: PrismaClient;
}): Promise<CheckoutContinueResult> {
  const db = input.prisma ?? defaultPrisma;
  const status = await resolveCheckoutPaymentStatus({
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    prisma: db,
  });

  if (status.phase === "unknown") {
    return {
      ok: false,
      code: "UNKNOWN_SESSION",
      message: "Payment status is not available for this session.",
    };
  }

  if (status.phase === "failed") {
    return {
      ok: false,
      code: "FAILED",
      message: "Payment was not completed. Contact HouzzatPRO support if you were charged.",
    };
  }

  if (status.phase !== "ready" || !status.workspaceId) {
    return {
      ok: false,
      code: "NOT_READY",
      message: "Your workspace is still being prepared. Please wait a moment.",
    };
  }

  const workspaceId = status.workspaceId;

  if (status.activationComplete) {
    return {
      ok: true,
      kind: "sign_in",
      workspaceId,
      url: buildOwnerOnboardingProSignInUrl({ workspaceId }),
    };
  }

  if (!status.activationRequired) {
    return {
      ok: false,
      code: "NO_OWNER",
      message: "Owner activation is not available yet. Contact HouzzatPRO support.",
    };
  }

  const owner = await db.workspaceMember.findFirst({
    where: {
      workspaceId,
      role: "OWNER",
      status: "ACTIVE",
    },
    select: {
      userId: true,
      user: {
        select: {
          password: true,
          disabledAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!owner) {
    return {
      ok: false,
      code: "NO_OWNER",
      message: "Owner activation is not available yet. Contact HouzzatPRO support.",
    };
  }

  if (owner.user.disabledAt) {
    return {
      ok: false,
      code: "OWNER_DISABLED",
      message: "This account cannot be activated. Contact HouzzatPRO support.",
    };
  }

  if (owner.user.password) {
    return {
      ok: true,
      kind: "sign_in",
      workspaceId,
      url: buildOwnerOnboardingProSignInUrl({ workspaceId }),
    };
  }

  const url = await mintOwnerActivationContinueUrl({
    db,
    workspaceId,
    userId: owner.userId,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId.trim(),
  });

  return {
    ok: true,
    kind: "activate",
    workspaceId,
    url,
  };
}
