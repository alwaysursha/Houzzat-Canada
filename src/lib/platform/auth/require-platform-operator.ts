/**
 * Stage 6.2A — PlatformOperator authorization foundation.
 *
 * Separate from User.role=ADMIN and tenant CRM membership.
 * Does NOT grant Lead / Customer / CRM access.
 *
 * Rules:
 * - session required
 * - active PlatformOperator row required
 * - MASTER_ADMIN only for v1
 * - DISABLED operator denied
 * - no User.role=ADMIN fallback
 * - no WorkspaceMember fallback
 * - no agent/admin CRM helper imports
 */

import type {
  PlatformOperatorRole,
  PlatformOperatorStatus,
  PrismaClient,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type PlatformOperatorContext = {
  operatorId: string;
  userId: string;
  email: string;
  role: PlatformOperatorRole;
  status: PlatformOperatorStatus;
};

export class PlatformOperatorAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 403, code = "PLATFORM_FORBIDDEN") {
    super(message);
    this.name = "PlatformOperatorAuthError";
    this.status = status;
    this.code = code;
  }
}

export type PlatformOperatorRow = {
  id: string;
  userId: string;
  role: PlatformOperatorRole;
  status: PlatformOperatorStatus;
};

/**
 * Pure authorization decision for an already-loaded operator row.
 * Used by requirePlatformOperator and selftests.
 */
export function assertActiveMasterAdminOperator(
  operator: PlatformOperatorRow | null | undefined,
  email: string,
): PlatformOperatorContext {
  if (!operator) {
    throw new PlatformOperatorAuthError(
      "Platform operator access required",
      403,
      "PLATFORM_OPERATOR_REQUIRED",
    );
  }

  switch (operator.status) {
    case "DISABLED":
      throw new PlatformOperatorAuthError(
        "Platform operator disabled",
        403,
        "PLATFORM_OPERATOR_DISABLED",
      );
    case "ACTIVE":
      break;
    default: {
      const _exhaustive: never = operator.status;
      void _exhaustive;
      throw new PlatformOperatorAuthError(
        "Platform operator access required",
        403,
        "PLATFORM_OPERATOR_REQUIRED",
      );
    }
  }

  // v1: only MASTER_ADMIN is productized — no SALES/BILLING yet.
  if (operator.role !== "MASTER_ADMIN") {
    throw new PlatformOperatorAuthError(
      "Platform role not enabled",
      403,
      "PLATFORM_ROLE_DISABLED",
    );
  }

  return {
    operatorId: operator.id,
    userId: operator.userId,
    email,
    role: operator.role,
    status: operator.status,
  };
}

/**
 * Resolve platform operator for a known user id (no session).
 * Does not consult User.role or WorkspaceMember.
 */
export async function resolvePlatformOperatorForUser(
  userId: string,
  email: string,
  db: PrismaClient = defaultPrisma,
): Promise<PlatformOperatorContext> {
  const operator = await db.platformOperator.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
    },
  });
  return assertActiveMasterAdminOperator(operator, email);
}

/**
 * Resolve an ACTIVE PlatformOperator for the current session user.
 * v1 product: MASTER_ADMIN only (other roles may exist in enum but are denied).
 *
 * Does not call agent CRM context helpers or CRM read-scope loaders.
 * Does not fall back to User.role=ADMIN or WorkspaceMember.
 */
export async function requirePlatformOperator(
  db: PrismaClient = defaultPrisma,
): Promise<PlatformOperatorContext> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId || !email) {
    throw new PlatformOperatorAuthError(
      "Authentication required",
      401,
      "AUTH_REQUIRED",
    );
  }

  return resolvePlatformOperatorForUser(userId, email, db);
}
