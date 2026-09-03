/**
 * Stage 6.5A — platform workspace suspend / reactivate (manual only).
 * Sequential Prisma writes only — no $transaction().
 */

import type {
  PrismaClient,
  WorkspaceStatus,
  WorkspaceStatusReasonCode,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  WORKSPACE_REACTIVATE_REASON_MAX,
  WORKSPACE_SUSPEND_REASON_MAX,
  WORKSPACE_SUSPEND_REASON_MIN,
} from "./status-constants";

export {
  WORKSPACE_REACTIVATE_REASON_MAX,
  WORKSPACE_SUSPEND_REASON_MAX,
  WORKSPACE_SUSPEND_REASON_MIN,
};

export class WorkspaceStatusActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "WorkspaceStatusActionError";
    this.status = status;
    this.code = code;
  }
}

export type WorkspaceStatusActionResult =
  | {
      outcome: "changed";
      workspaceId: string;
      fromStatus: WorkspaceStatus;
      toStatus: WorkspaceStatus;
      statusEventId: string;
      auditEventId: string;
    }
  | {
      outcome: "no_op";
      workspaceId: string;
      status: WorkspaceStatus;
    };

export function validateSuspendReason(raw: string): string {
  const reason = raw.trim();
  if (reason.length < WORKSPACE_SUSPEND_REASON_MIN) {
    throw new WorkspaceStatusActionError(
      `Suspend reason must be at least ${WORKSPACE_SUSPEND_REASON_MIN} characters`,
      "INVALID_SUSPEND_REASON",
      400,
    );
  }
  if (reason.length > WORKSPACE_SUSPEND_REASON_MAX) {
    throw new WorkspaceStatusActionError(
      `Suspend reason must be at most ${WORKSPACE_SUSPEND_REASON_MAX} characters`,
      "INVALID_SUSPEND_REASON",
      400,
    );
  }
  return reason;
}

export function validateReactivateReason(raw?: string | null): string | null {
  if (raw == null) return null;
  const reason = raw.trim();
  if (!reason) return null;
  if (reason.length > WORKSPACE_REACTIVATE_REASON_MAX) {
    throw new WorkspaceStatusActionError(
      `Reactivate reason must be at most ${WORKSPACE_REACTIVATE_REASON_MAX} characters`,
      "INVALID_REACTIVATE_REASON",
      400,
    );
  }
  return reason;
}

export function isBillingControlledSuspension(
  reasonCode: WorkspaceStatusReasonCode | null | undefined,
): boolean {
  return reasonCode === "BILLING_PAST_DUE" || reasonCode === "CANCELLATION";
}

export function resolveManualReactivationEligibility(input: {
  status: WorkspaceStatus;
  latestSuspensionReasonCode: WorkspaceStatusReasonCode | null;
}): { allowed: boolean; blockedReason: string | null } {
  if (input.status === "CANCELLED") {
    return {
      allowed: false,
      blockedReason: "Cancelled workspaces cannot be reactivated.",
    };
  }
  if (input.status !== "SUSPENDED") {
    return { allowed: false, blockedReason: null };
  }
  if (isBillingControlledSuspension(input.latestSuspensionReasonCode)) {
    return {
      allowed: false,
      blockedReason:
        "This workspace was suspended for billing or cancellation reasons. Billing authority must resolve the suspension before manual reactivation.",
    };
  }
  return { allowed: true, blockedReason: null };
}

async function getLatestSuspensionReasonCode(
  workspaceId: string,
  db: PrismaClient,
): Promise<WorkspaceStatusReasonCode | null> {
  const event = await db.workspaceStatusEvent.findFirst({
    where: { workspaceId, toStatus: "SUSPENDED" },
    orderBy: { createdAt: "desc" },
    select: { reasonCode: true },
  });
  return event?.reasonCode ?? null;
}

export async function suspendWorkspace(input: {
  workspaceId: string;
  reason: string;
  operatorId: string;
  prisma?: PrismaClient;
}): Promise<WorkspaceStatusActionResult> {
  const db = input.prisma ?? defaultPrisma;
  const reason = validateSuspendReason(input.reason);

  const workspace = await db.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true, status: true, slug: true },
  });
  if (!workspace) {
    throw new WorkspaceStatusActionError(
      "Workspace not found",
      "NOT_FOUND",
      404,
    );
  }

  if (workspace.status === "SUSPENDED") {
    return {
      outcome: "no_op",
      workspaceId: workspace.id,
      status: "SUSPENDED",
    };
  }

  if (workspace.status === "CANCELLED") {
    throw new WorkspaceStatusActionError(
      "Cancelled workspaces cannot be suspended",
      "WORKSPACE_CANCELLED",
      409,
    );
  }

  if (workspace.status !== "ACTIVE" && workspace.status !== "TRIAL") {
    throw new WorkspaceStatusActionError(
      `Cannot suspend workspace in status ${workspace.status}`,
      "INVALID_WORKSPACE_STATUS",
      409,
    );
  }

  const fromStatus = workspace.status;

  await db.workspace.update({
    where: { id: workspace.id },
    data: { status: "SUSPENDED" },
  });

  try {
    const statusEvent = await db.workspaceStatusEvent.create({
      data: {
        workspaceId: workspace.id,
        fromStatus,
        toStatus: "SUSPENDED",
        reasonCode: "MANUAL",
        reasonDetail: reason,
        actorType: "PLATFORM_OPERATOR",
        actorOperatorId: input.operatorId,
      },
      select: { id: true },
    });

    const auditEvent = await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: "WORKSPACE_SUSPENDED",
        entityType: "Workspace",
        entityId: workspace.id,
        summary: `Workspace ${workspace.slug} suspended (${fromStatus} → SUSPENDED)`,
        metadata: {
          workspaceId: workspace.id,
          operatorId: input.operatorId,
          fromStatus,
          toStatus: "SUSPENDED",
          reasonSummary: reason.slice(0, 200),
        },
      },
      db,
    );

    return {
      outcome: "changed",
      workspaceId: workspace.id,
      fromStatus,
      toStatus: "SUSPENDED",
      statusEventId: statusEvent.id,
      auditEventId: auditEvent.id,
    };
  } catch (error) {
    await db.workspace
      .update({
        where: { id: workspace.id, status: "SUSPENDED" },
        data: { status: fromStatus },
      })
      .catch((revertError) => {
        console.error(
          "[platform] failed to revert workspace after suspend error",
          revertError,
        );
      });
    throw error;
  }
}

export async function reactivateWorkspace(input: {
  workspaceId: string;
  reason?: string | null;
  operatorId: string;
  prisma?: PrismaClient;
}): Promise<WorkspaceStatusActionResult> {
  const db = input.prisma ?? defaultPrisma;
  const reason = validateReactivateReason(input.reason);

  const workspace = await db.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true, status: true, slug: true },
  });
  if (!workspace) {
    throw new WorkspaceStatusActionError(
      "Workspace not found",
      "NOT_FOUND",
      404,
    );
  }

  if (workspace.status === "ACTIVE") {
    return {
      outcome: "no_op",
      workspaceId: workspace.id,
      status: "ACTIVE",
    };
  }

  if (workspace.status === "TRIAL") {
    throw new WorkspaceStatusActionError(
      "Trial workspaces are not suspended and cannot be reactivated",
      "WORKSPACE_NOT_SUSPENDED",
      409,
    );
  }

  if (workspace.status === "CANCELLED") {
    throw new WorkspaceStatusActionError(
      "Cancelled workspaces cannot be reactivated",
      "WORKSPACE_CANCELLED",
      409,
    );
  }

  if (workspace.status !== "SUSPENDED") {
    throw new WorkspaceStatusActionError(
      `Cannot reactivate workspace in status ${workspace.status}`,
      "INVALID_WORKSPACE_STATUS",
      409,
    );
  }

  const latestSuspensionReason = await getLatestSuspensionReasonCode(
    workspace.id,
    db,
  );
  const eligibility = resolveManualReactivationEligibility({
    status: workspace.status,
    latestSuspensionReasonCode: latestSuspensionReason,
  });
  if (!eligibility.allowed) {
    throw new WorkspaceStatusActionError(
      eligibility.blockedReason ??
        "Manual reactivation is not permitted for this workspace",
      "BILLING_CONTROLLED_SUSPENSION",
      409,
    );
  }

  const fromStatus = workspace.status;

  await db.workspace.update({
    where: { id: workspace.id },
    data: { status: "ACTIVE" },
  });

  try {
    const statusEvent = await db.workspaceStatusEvent.create({
      data: {
        workspaceId: workspace.id,
        fromStatus,
        toStatus: "ACTIVE",
        reasonCode: "REACTIVATION",
        reasonDetail: reason,
        actorType: "PLATFORM_OPERATOR",
        actorOperatorId: input.operatorId,
      },
      select: { id: true },
    });

    const auditEvent = await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: "WORKSPACE_REACTIVATED",
        entityType: "Workspace",
        entityId: workspace.id,
        summary: `Workspace ${workspace.slug} reactivated (SUSPENDED → ACTIVE)`,
        metadata: {
          workspaceId: workspace.id,
          operatorId: input.operatorId,
          fromStatus,
          toStatus: "ACTIVE",
          reasonSummary: reason ? reason.slice(0, 200) : null,
        },
      },
      db,
    );

    return {
      outcome: "changed",
      workspaceId: workspace.id,
      fromStatus,
      toStatus: "ACTIVE",
      statusEventId: statusEvent.id,
      auditEventId: auditEvent.id,
    };
  } catch (error) {
    await db.workspace
      .update({
        where: { id: workspace.id, status: "ACTIVE" },
        data: { status: fromStatus },
      })
      .catch((revertError) => {
        console.error(
          "[platform] failed to revert workspace after reactivate error",
          revertError,
        );
      });
    throw error;
  }
}

export async function getLatestSuspensionReasonCodeForWorkspace(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<WorkspaceStatusReasonCode | null> {
  return getLatestSuspensionReasonCode(workspaceId, db);
}
