/**
 * Stage 6.10A — Master Admin send owner activation email.
 * No auto-send after provisioning in this stage.
 */

import type { PrismaClient } from "@prisma/client";
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

  await revokeUsableActivations({
    db,
    workspaceId: eligibility.workspaceId,
    userId: eligibility.userId,
  });

  await ensureWorkspaceOnboardingState(db, eligibility.workspaceId);

  const rawToken = createOwnerActivationRawToken();
  const tokenHash = hashOwnerActivationToken(rawToken);
  const expiresAt = new Date(Date.now() + OWNER_ACTIVATION_TTL_MS);

  const activation = await db.workspaceOwnerActivation.create({
    data: {
      workspaceId: eligibility.workspaceId,
      userId: eligibility.userId,
      tokenHash,
      status: "PENDING",
      expiresAt,
      createdByType: "OPERATOR",
      createdByOperatorId: input.operatorId,
    },
    select: { id: true },
  });

  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: OWNER_ACTIVATION_AUDIT.CREATED,
      entityType: OWNER_ACTIVATION_ENTITY_TYPE,
      entityId: activation.id,
      summary: "Owner activation token created",
      metadata: {
        workspaceId: eligibility.workspaceId,
        userId: eligibility.userId,
        activationId: activation.id,
        expiresAt: expiresAt.toISOString(),
      },
    },
    db,
  );

  const url = activationUrl(rawToken);
  const rendered = renderOwnerActivationEmail({
    ownerName: eligibility.ownerName,
    workspaceName: eligibility.workspaceName ?? "Workspace",
    activationUrl: url,
    expiresAt,
  });

  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  const result = await send({
    to: eligibility.ownerEmail,
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
    await db.workspaceOwnerActivation.update({
      where: { id: activation.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: OWNER_ACTIVATION_AUDIT.EMAIL_SENT,
        entityType: OWNER_ACTIVATION_ENTITY_TYPE,
        entityId: activation.id,
        summary: `Owner activation email ${emailStatus}`,
        metadata: {
          workspaceId: eligibility.workspaceId,
          userId: eligibility.userId,
          activationId: activation.id,
          emailStatus,
        },
      },
      db,
    );
  } else {
    await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: OWNER_ACTIVATION_AUDIT.EMAIL_FAILED,
        entityType: OWNER_ACTIVATION_ENTITY_TYPE,
        entityId: activation.id,
        summary: "Owner activation email failed",
        metadata: {
          workspaceId: eligibility.workspaceId,
          userId: eligibility.userId,
          activationId: activation.id,
          emailStatus: "failed",
        },
      },
      db,
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
    workspaceId: eligibility.workspaceId,
    userId: eligibility.userId,
    expiresAt: expiresAt.toISOString(),
    emailStatus,
  };
}
