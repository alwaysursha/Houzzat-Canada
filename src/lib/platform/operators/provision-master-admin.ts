/**
 * Stage 6.2A — first PlatformOperator (MASTER_ADMIN) provisioning.
 *
 * - Looks up existing User by email
 * - Creates PlatformOperator only if absent
 * - Does NOT create WorkspaceMember
 * - Does NOT modify User.role
 * - Does NOT grant CRM access
 * - Idempotent + audit event
 */

import type { PlatformOperator, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { writePlatformAuditEvent } from "@/lib/platform/audit";

export type ProvisionMasterAdminResult =
  | {
      status: "created";
      operatorId: string;
      userId: string;
      email: string;
      role: "MASTER_ADMIN";
      memberCreated: false;
      userRoleChanged: false;
    }
  | {
      status: "already_exists";
      operatorId: string;
      userId: string;
      email: string;
      role: PlatformOperator["role"];
      memberCreated: false;
      userRoleChanged: false;
    };

export type ProvisionMasterAdminInput = {
  email: string;
  prisma?: PrismaClient;
  createdByOperatorId?: string | null;
  dryRun?: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function provisionPlatformMasterAdmin(
  input: ProvisionMasterAdminInput,
): Promise<ProvisionMasterAdminResult> {
  const db = input.prisma ?? defaultPrisma;
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new Error("email is required");
  }
  if (input.dryRun) {
    throw new Error("dryRun requested — refusing writes");
  }

  // Platform operators are NULL-workspace Users only — never tenant identities.
  const user = await db.user.findFirst({
    where: { email, workspaceId: null },
    select: { id: true, email: true, role: true },
  });
  if (!user || !user.email) {
    throw new Error(`NULL-workspace User not found for email=${email}`);
  }

  const existing = await db.platformOperator.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
    },
  });

  if (existing) {
    await writePlatformAuditEvent(
      {
        actorOperatorId: input.createdByOperatorId ?? existing.id,
        actorType: "SYSTEM",
        action: "PLATFORM_OPERATOR_PROVISION_IDEMPOTENT",
        entityType: "PlatformOperator",
        entityId: existing.id,
        summary: "PlatformOperator already exists; no WorkspaceMember created",
        metadata: {
          userId: user.id,
          role: existing.role,
          status: existing.status,
          memberCreated: false,
          userRoleChanged: false,
        },
      },
      db,
    );
    return {
      status: "already_exists",
      operatorId: existing.id,
      userId: existing.userId,
      email: user.email,
      role: existing.role,
      memberCreated: false,
      userRoleChanged: false,
    };
  }

  const memberCountBefore = await db.workspaceMember.count({
    where: { userId: user.id },
  });

  const operator = await db.platformOperator.create({
    data: {
      userId: user.id,
      role: "MASTER_ADMIN",
      status: "ACTIVE",
      createdByOperatorId: input.createdByOperatorId ?? null,
    },
    select: {
      id: true,
      userId: true,
      role: true,
    },
  });

  const memberCountAfter = await db.workspaceMember.count({
    where: { userId: user.id },
  });
  if (memberCountAfter !== memberCountBefore) {
    throw new Error(
      "Invariant violated: PlatformOperator provisioning must not create WorkspaceMember",
    );
  }

  const userAfter = await db.user.findFirst({
    where: { id: user.id },
    select: { role: true },
  });
  if (userAfter?.role !== user.role) {
    throw new Error(
      "Invariant violated: PlatformOperator provisioning must not modify User.role",
    );
  }

  await writePlatformAuditEvent(
    {
      actorOperatorId: input.createdByOperatorId ?? operator.id,
      actorType: "SYSTEM",
      action: "PLATFORM_OPERATOR_CREATED",
      entityType: "PlatformOperator",
      entityId: operator.id,
      summary: "Created MASTER_ADMIN PlatformOperator (no CRM membership grant)",
      metadata: {
        userId: user.id,
        role: operator.role,
        memberCreated: false,
        userRoleChanged: false,
      },
    },
    db,
  );

  return {
    status: "created",
    operatorId: operator.id,
    userId: operator.userId,
    email: user.email,
    role: "MASTER_ADMIN",
    memberCreated: false,
    userRoleChanged: false,
  };
}
