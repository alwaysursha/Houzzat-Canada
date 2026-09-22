/**
 * Phase 3 — Lead.customerId may only reference a User whose home workspace
 * matches the Lead workspace. NULL-workspace Users (platform / orphans /
 * pre-split) must never become tenant customers via automatic attachment.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export class CrossWorkspaceCustomerIdentityError extends Error {
  readonly code = "CROSS_WORKSPACE_CUSTOMER_IDENTITY" as const;
  constructor(
    message = "User.workspaceId must equal Lead workspaceId to attach as customer",
  ) {
    super(message);
    this.name = "CrossWorkspaceCustomerIdentityError";
  }
}

export function isCrossWorkspaceCustomerIdentityError(
  error: unknown,
): error is CrossWorkspaceCustomerIdentityError {
  return (
    error instanceof CrossWorkspaceCustomerIdentityError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: unknown }).code === "CROSS_WORKSPACE_CUSTOMER_IDENTITY")
  );
}

/**
 * Fail closed unless the User's home workspace equals the target workspace.
 * PlatformOperator / orphans (workspaceId NULL) always fail.
 */
export async function assertUserMayBeLeadCustomer(input: {
  userId: string;
  workspaceId: string;
  db?: Pick<PrismaClient, "user">;
}): Promise<{ id: string; workspaceId: string }> {
  const db = input.db ?? defaultPrisma;
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new CrossWorkspaceCustomerIdentityError("workspaceId required");
  }
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, workspaceId: true },
  });
  if (!user) {
    throw new CrossWorkspaceCustomerIdentityError("User not found");
  }
  if (!user.workspaceId || user.workspaceId !== workspaceId) {
    throw new CrossWorkspaceCustomerIdentityError(
      `User ${user.id} workspaceId=${user.workspaceId ?? "NULL"} cannot be Lead.customerId in workspace ${workspaceId}`,
    );
  }
  return { id: user.id, workspaceId: user.workspaceId };
}
