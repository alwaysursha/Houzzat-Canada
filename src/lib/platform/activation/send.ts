/**
 * Stage 6.10A / V1 launch — Master Admin send + post-provision auto-send.
 *
 * Manual send always rotates tokens.
 * Auto-send after ACTIVE provisioning is idempotent (no spam on webhook retry).
 */

import type { PlatformAuditActorType, PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { emailFromHouzzatPro } from "@/lib/email/config";
import { sendRenderedEmail } from "@/lib/email/send";
import { HOUZZATPRO_APP_BOOTSTRAP_ORIGIN } from "@/lib/tenancy/platform-hostname";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  OWNER_ACTIVATION_AUDIT,
  OWNER_ACTIVATION_ENTITY_TYPE,
  OWNER_ACTIVATION_PATH_PREFIX,
  OWNER_ACTIVATION_TTL_MS,
} from "./constants";
import { evaluateOwnerActivationEligibility } from "./eligibility";
import { renderOwnerActivationEmail } from "./email-template";
import { OwnerActivationError } from "./errors";
import { ensureWorkspaceOnboardingState } from "./onboarding-state";
import {
  createOwnerActivationRawToken,
  hashOwnerActivationToken,
} from "./token";

export type SendOwnerActivationResult = {
  outcome: "sent" | "skipped_email" | "failed_email";
  activationId: string;
  workspaceId: string;
  userId: string;
  expiresAt: string;
  emailStatus: "sent" | "skipped" | "failed";
};

export type AutoSendOwnerActivationResult =
  | {
      outcome: "sent" | "skipped_email" | "failed_email";
      activationId: string;
      workspaceId: string;
      userId: string;
      expiresAt: string;
      emailStatus: "sent" | "skipped" | "failed";
      skipReason?: undefined;
    }
  | {
      outcome: "skipped";
      skipReason:
        | "missing_workspace"
        | "subscription_not_active"
        | "workspace_not_active"
        | "missing_platform_domain"
        | "not_eligible"
        | "owner_password_set"
        | "usable_activation_exists";
      workspaceId: string | null;
      activationId: string | null;
    };

function activationUrl(rawToken: string): string {
  return `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}${OWNER_ACTIVATION_PATH_PREFIX}/${rawToken}`;
}

async function revokeUsableActivations(input: {
  db: PrismaClient;
  workspaceId: string;
  userId: string;
}): Promise<number> {
  const usable = await input.db.workspaceOwnerActivation.findMany({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      status: { in: ["PENDING", "SENT"] },
    },
    select: { id: true },
  });

  let revoked = 0;
  const now = new Date();
  for (const row of usable) {
    await input.db.workspaceOwnerActivation.update({
      where: { id: row.id },
      data: {
        status: "REVOKED",
        revokedAt: now,
      },
    });
    revoked += 1;
  }
  return revoked;
}

async function findUsableUnexpiredPendingOrSent(input: {
  db: PrismaClient;
  workspaceId: string;
  userId: string;
}): Promise<{ id: string; status: string; expiresAt: Date } | null> {
  const now = new Date();
  const row = await input.db.workspaceOwnerActivation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      // V1 AUTO: unexpired PENDING (incl. email-failed) OR SENT blocks further auto-send.
      status: { in: ["PENDING", "SENT"] },
      expiresAt: { gt: now },
      revokedAt: null,
      usedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, expiresAt: true },
  });
  return row;
}

/** Mark past-expiry PENDING/SENT rows EXPIRED so auto may issue one replacement. */
async function expirePastDuePendingOrSent(input: {
  db: PrismaClient;
  workspaceId: string;
  userId: string;
}): Promise<number> {
  const now = new Date();
  const expired = await input.db.workspaceOwnerActivation.findMany({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      status: { in: ["PENDING", "SENT"] },
      expiresAt: { lte: now },
    },
    select: { id: true },
  });
  let n = 0;
  for (const row of expired) {
    await input.db.workspaceOwnerActivation.update({
      where: { id: row.id },
      data: { status: "EXPIRED" },
    });
    n += 1;
  }
  return n;
}

async function issueAndSendOwnerActivation(input: {
  db: PrismaClient;
  send: typeof sendRenderedEmail;
  workspaceId: string;
  userId: string;
  ownerEmail: string;
  ownerName: string | null;
  workspaceName: string | null;
  createdByType: PlatformAuditActorType;
  createdByOperatorId: string | null;
  /**
   * Manual resend rotates prior PENDING/SENT tokens.
   * Auto-send never rotates unexpired rows (skip instead).
   */
  rotateUsable: boolean;
}): Promise<SendOwnerActivationResult> {
  if (input.rotateUsable) {
    await revokeUsableActivations({
      db: input.db,
      workspaceId: input.workspaceId,
      userId: input.userId,
    });
  }

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
      createdByType: input.createdByType,
      createdByOperatorId: input.createdByOperatorId,
    },
    select: { id: true },
  });

  await writePlatformAuditEvent(
    {
      actorOperatorId: input.createdByOperatorId,
      actorType: input.createdByType,
      action: OWNER_ACTIVATION_AUDIT.CREATED,
      entityType: OWNER_ACTIVATION_ENTITY_TYPE,
      entityId: activation.id,
      summary: "Owner activation token created",
      metadata: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        activationId: activation.id,
        expiresAt: expiresAt.toISOString(),
        autoSend: !input.rotateUsable,
      },
    },
    input.db,
  );

  const url = activationUrl(rawToken);
  const rendered = renderOwnerActivationEmail({
    ownerName: input.ownerName,
    workspaceName: input.workspaceName ?? "Workspace",
    activationUrl: url,
    expiresAt,
  });

  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  const result = await input.send({
    to: input.ownerEmail,
    rendered,
    stream: "notify",
    from: emailFromHouzzatPro(),
  });
  emailStatus =
    result.status === "sent"
      ? "sent"
      : result.status === "skipped"
        ? "skipped"
        : "failed";

  if (emailStatus === "sent" || emailStatus === "skipped") {
    await input.db.workspaceOwnerActivation.update({
      where: { id: activation.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    await writePlatformAuditEvent(
      {
        actorOperatorId: input.createdByOperatorId,
        actorType: input.createdByType,
        action: OWNER_ACTIVATION_AUDIT.EMAIL_SENT,
        entityType: OWNER_ACTIVATION_ENTITY_TYPE,
        entityId: activation.id,
        summary: `Owner activation email ${emailStatus}`,
        metadata: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          activationId: activation.id,
          emailStatus,
          autoSend: !input.rotateUsable,
        },
      },
      input.db,
    );
  } else {
    await writePlatformAuditEvent(
      {
        actorOperatorId: input.createdByOperatorId,
        actorType: input.createdByType,
        action: OWNER_ACTIVATION_AUDIT.EMAIL_FAILED,
        entityType: OWNER_ACTIVATION_ENTITY_TYPE,
        entityId: activation.id,
        summary: "Owner activation email failed",
        metadata: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          activationId: activation.id,
          emailStatus: "failed",
          autoSend: !input.rotateUsable,
        },
      },
      input.db,
    );
  }

  return {
    outcome:
      emailStatus === "sent"
        ? "sent"
        : emailStatus === "skipped"
          ? "skipped_email"
          : "failed_email",
    activationId: activation.id,
    workspaceId: input.workspaceId,
    userId: input.userId,
    expiresAt: expiresAt.toISOString(),
    emailStatus,
  };
}

/**
 * MASTER_ADMIN: issue (or rotate) activation + send HouzzatPRO email.
 * Only when User.password is null.
 */
export async function sendOwnerActivationEmail(input: {
  workspaceId: string;
  operatorId: string;
  prisma?: PrismaClient;
  send?: typeof sendRenderedEmail;
}): Promise<SendOwnerActivationResult> {
  const db = input.prisma ?? defaultPrisma;
  const send = input.send ?? sendRenderedEmail;

  const eligibility = await evaluateOwnerActivationEligibility({
    prisma: db,
    workspaceId: input.workspaceId,
  });

  if (!eligibility.eligible) {
    if (eligibility.reason === "OWNER_PASSWORD_SET") {
      throw new OwnerActivationError(
        "Owner already has a password. Use password reset when available — activation does not apply.",
        "OWNER_PASSWORD_SET",
        409,
      );
    }
    throw new OwnerActivationError(
      `Workspace is not eligible for owner activation (${eligibility.reason})`,
      "NOT_ELIGIBLE",
      409,
    );
  }

  if (!eligibility.userId || !eligibility.ownerEmail) {
    throw new OwnerActivationError(
      "Owner identity missing",
      "NO_OWNER_MEMBER",
      409,
    );
  }

  return issueAndSendOwnerActivation({
    db,
    send,
    workspaceId: eligibility.workspaceId,
    userId: eligibility.userId,
    ownerEmail: eligibility.ownerEmail,
    ownerName: eligibility.ownerName,
    workspaceName: eligibility.workspaceName,
    createdByType: "OPERATOR",
    createdByOperatorId: input.operatorId,
    rotateUsable: true,
  });
}

/**
 * V1 launch — after successful ACTIVE paid provisioning, auto-send owner activation.
 *
 * Never throws (provisioning must stay intact).
 *
 * AUTO rules (launch freeze):
 * - unexpired PENDING → skip (includes email-failed; no webhook auto-retry)
 * - unexpired SENT → skip
 * - expired PENDING/SENT → expire old row, allow one replacement attempt
 * - password set / USED → skip
 * - Subscription ACTIVE or TRIALING (paid acceptance / trial) may auto-send
 * - Workspace ACTIVE or TRIAL may auto-send
 * - never revoke unexpired PENDING (in-flight or failed) on auto path
 *
 * MANUAL Master Admin send rotates/resends (support recovery).
 */
export async function tryAutoSendOwnerActivationAfterProvision(input: {
  workspaceId: string;
  subscriptionId: string;
  prisma?: PrismaClient;
  send?: typeof sendRenderedEmail;
  actorType?: Extract<PlatformAuditActorType, "SYSTEM" | "WEBHOOK">;
}): Promise<AutoSendOwnerActivationResult> {
  const db = input.prisma ?? defaultPrisma;
  const send = input.send ?? sendRenderedEmail;
  const actorType = input.actorType ?? "SYSTEM";

  try {
    const subscription = await db.subscription.findUnique({
      where: { id: input.subscriptionId },
      select: {
        id: true,
        status: true,
        workspaceId: true,
      },
    });

    if (
      !subscription ||
      (subscription.status !== "ACTIVE" && subscription.status !== "TRIALING")
    ) {
      return {
        outcome: "skipped",
        skipReason: "subscription_not_active",
        workspaceId: input.workspaceId,
        activationId: null,
      };
    }

    const workspace = await db.workspace.findUnique({
      where: { id: input.workspaceId },
      select: {
        id: true,
        status: true,
        domains: {
          where: { kind: "PLATFORM", status: "ACTIVE" },
          select: { id: true },
          take: 1,
        },
        members: {
          where: { role: "OWNER", status: "ACTIVE" },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!workspace) {
      return {
        outcome: "skipped",
        skipReason: "missing_workspace",
        workspaceId: input.workspaceId,
        activationId: null,
      };
    }

    // V1: auto-send for ACTIVE and TRIAL workspaces (TRIALING subscription).
    if (workspace.status !== "ACTIVE" && workspace.status !== "TRIAL") {
      return {
        outcome: "skipped",
        skipReason: "workspace_not_active",
        workspaceId: workspace.id,
        activationId: null,
      };
    }

    if (!workspace.members?.length) {
      return {
        outcome: "skipped",
        skipReason: "not_eligible",
        workspaceId: workspace.id,
        activationId: null,
      };
    }

    if (!workspace.domains?.length) {
      return {
        outcome: "skipped",
        skipReason: "missing_platform_domain",
        workspaceId: workspace.id,
        activationId: null,
      };
    }

    const eligibility = await evaluateOwnerActivationEligibility({
      prisma: db,
      workspaceId: workspace.id,
    });

    if (!eligibility.eligible) {
      const skipReason =
        eligibility.reason === "OWNER_PASSWORD_SET"
          ? ("owner_password_set" as const)
          : ("not_eligible" as const);
      await writePlatformAuditEvent(
        {
          actorOperatorId: null,
          actorType,
          action: OWNER_ACTIVATION_AUDIT.AUTO_SKIPPED,
          entityType: "Workspace",
          entityId: workspace.id,
          summary: `Owner activation auto-send skipped (${skipReason})`,
          metadata: {
            workspaceId: workspace.id,
            subscriptionId: input.subscriptionId,
            skipReason,
            eligibilityReason: eligibility.reason,
          },
        },
        db,
      ).catch(() => {
        /* best-effort */
      });
      return {
        outcome: "skipped",
        skipReason,
        workspaceId: workspace.id,
        activationId: null,
      };
    }

    if (!eligibility.userId || !eligibility.ownerEmail) {
      return {
        outcome: "skipped",
        skipReason: "not_eligible",
        workspaceId: workspace.id,
        activationId: null,
      };
    }

    // Expire past-due PENDING/SENT so one replacement may be issued.
    await expirePastDuePendingOrSent({
      db,
      workspaceId: eligibility.workspaceId,
      userId: eligibility.userId,
    });

    const existing = await findUsableUnexpiredPendingOrSent({
      db,
      workspaceId: eligibility.workspaceId,
      userId: eligibility.userId,
    });
    if (existing) {
      await writePlatformAuditEvent(
        {
          actorOperatorId: null,
          actorType,
          action: OWNER_ACTIVATION_AUDIT.AUTO_SKIPPED,
          entityType: OWNER_ACTIVATION_ENTITY_TYPE,
          entityId: existing.id,
          summary:
            "Owner activation auto-send skipped (unexpired PENDING or SENT)",
          metadata: {
            workspaceId: eligibility.workspaceId,
            subscriptionId: input.subscriptionId,
            skipReason: "usable_activation_exists",
            activationId: existing.id,
            activationStatus: existing.status,
          },
        },
        db,
      ).catch(() => {
        /* best-effort */
      });
      return {
        outcome: "skipped",
        skipReason: "usable_activation_exists",
        workspaceId: eligibility.workspaceId,
        activationId: existing.id,
      };
    }

    // Concurrency guard: re-check immediately before create (no $transaction).
    const raced = await findUsableUnexpiredPendingOrSent({
      db,
      workspaceId: eligibility.workspaceId,
      userId: eligibility.userId,
    });
    if (raced) {
      return {
        outcome: "skipped",
        skipReason: "usable_activation_exists",
        workspaceId: eligibility.workspaceId,
        activationId: raced.id,
      };
    }

    const sent = await issueAndSendOwnerActivation({
      db,
      send,
      workspaceId: eligibility.workspaceId,
      userId: eligibility.userId,
      ownerEmail: eligibility.ownerEmail,
      ownerName: eligibility.ownerName,
      workspaceName: eligibility.workspaceName,
      createdByType: actorType,
      createdByOperatorId: null,
      rotateUsable: false,
    });

    return { ...sent };
  } catch (error) {
    console.error(
      "[platform] auto owner activation after provision failed",
      input.workspaceId,
      input.subscriptionId,
      error,
    );
    return {
      outcome: "skipped",
      skipReason: "not_eligible",
      workspaceId: input.workspaceId,
      activationId: null,
    };
  }
}
