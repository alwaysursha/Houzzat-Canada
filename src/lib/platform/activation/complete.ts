/**
 * Stage 6.10A — public activation lookup + password completion.
 * Opaque failures for invalid/expired/used tokens.
 */

import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  OWNER_ACTIVATION_AUDIT,
  OWNER_ACTIVATION_ENTITY_TYPE,
  OWNER_ACTIVATION_MIN_PASSWORD_LENGTH,
} from "./constants";
import { OwnerActivationError } from "./errors";
import { markAccountActivatedOnboarding } from "./onboarding-state";
import { hashOwnerActivationToken } from "./token";

const OPAQUE_INVALID = "This activation link is invalid or no longer available.";

export type PublicActivationView = {
  workspaceName: string;
  ownerEmailMasked: string;
  expiresAt: string;
};

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}

async function loadUsableActivation(
  db: PrismaClient,
  rawToken: string,
): Promise<{
  id: string;
  workspaceId: string;
  userId: string;
  expiresAt: Date;
  status: string;
  workspaceName: string;
  ownerEmail: string;
  ownerPassword: string | null;
  ownerDisabledAt: Date | null;
  ownerRole: string;
} | null> {
  const tokenHash = hashOwnerActivationToken(rawToken);
  const row = await db.workspaceOwnerActivation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      expiresAt: true,
      status: true,
      workspace: { select: { name: true, status: true } },
      user: {
        select: {
          email: true,
          password: true,
          disabledAt: true,
          role: true,
        },
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    expiresAt: row.expiresAt,
    status: row.status,
    workspaceName: row.workspace.name,
    ownerEmail: row.user.email,
    ownerPassword: row.user.password,
    ownerDisabledAt: row.user.disabledAt,
    ownerRole: row.user.role,
  };
}

export async function resolvePublicOwnerActivation(input: {
  rawToken: string;
  prisma?: PrismaClient;
}): Promise<PublicActivationView> {
  const db = input.prisma ?? defaultPrisma;
  const row = await loadUsableActivation(db, input.rawToken);
  if (!row) {
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  if (row.status === "USED" || row.status === "REVOKED" || row.status === "EXPIRED") {
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.workspaceOwnerActivation.update({
      where: { id: row.id },
      data: { status: "EXPIRED" },
    });
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  if (row.status !== "PENDING" && row.status !== "SENT") {
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  if (row.ownerPassword || row.ownerDisabledAt) {
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  return {
    workspaceName: row.workspaceName,
    ownerEmailMasked: maskEmail(row.ownerEmail),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function completeOwnerActivation(input: {
  rawToken: string;
  password: string;
  confirmPassword: string;
  prisma?: PrismaClient;
}): Promise<{ workspaceId: string; userId: string }> {
  const db = input.prisma ?? defaultPrisma;

  if (
    typeof input.password !== "string" ||
    input.password.length < OWNER_ACTIVATION_MIN_PASSWORD_LENGTH
  ) {
    throw new OwnerActivationError(
      `Password must be at least ${OWNER_ACTIVATION_MIN_PASSWORD_LENGTH} characters`,
      "WEAK_PASSWORD",
      400,
    );
  }

  if (input.password !== input.confirmPassword) {
    throw new OwnerActivationError(
      "Password confirmation does not match",
      "PASSWORD_MISMATCH",
      400,
    );
  }

  const row = await loadUsableActivation(db, input.rawToken);
  if (!row) {
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  if (row.status === "USED" || row.status === "REVOKED" || row.status === "EXPIRED") {
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.workspaceOwnerActivation.update({
      where: { id: row.id },
      data: { status: "EXPIRED" },
    });
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  if (row.status !== "PENDING" && row.status !== "SENT") {
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  if (row.ownerPassword) {
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  if (row.ownerDisabledAt) {
    throw new OwnerActivationError(OPAQUE_INVALID, "INVALID_TOKEN", 404);
  }

  // Never promote User.role to ADMIN.
  if (row.ownerRole === "ADMIN") {
    // Leave role unchanged; still allow password set for edge cases.
  }

  const hashed = await bcrypt.hash(input.password, 10);
  const now = new Date();

  await db.user.update({
    where: { id: row.userId },
    data: {
      password: hashed,
      emailVerified: now,
    },
  });

  await db.workspaceOwnerActivation.update({
    where: { id: row.id },
    data: {
      status: "USED",
      usedAt: now,
    },
  });

  await markAccountActivatedOnboarding(db, row.workspaceId);

  await writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: OWNER_ACTIVATION_AUDIT.ACCOUNT_ACTIVATED,
      entityType: OWNER_ACTIVATION_ENTITY_TYPE,
      entityId: row.id,
      summary: "Owner account activated with password",
      metadata: {
        workspaceId: row.workspaceId,
        userId: row.userId,
        activationId: row.id,
        userRole: row.ownerRole,
      },
    },
    db,
  );

  return { workspaceId: row.workspaceId, userId: row.userId };
}
