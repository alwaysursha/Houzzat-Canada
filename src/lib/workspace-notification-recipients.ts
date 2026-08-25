/**
 * Stage 3H — workspace-scoped staff notification recipient resolution.
 */
import type { WorkspaceMemberRole } from "@prisma/client";
import { isWorkspaceNotificationScope } from "@/lib/workspace-scope-flags";
import { prisma } from "@/lib/prisma";

export type WorkspaceStaffRecipient = {
  id: string;
  email: string | null;
  phone: string | null;
};

const DESK_ROLES: WorkspaceMemberRole[] = ["OWNER", "ADMIN"];

export async function resolveWorkspaceDeskRecipients(
  workspaceId: string,
  options?: { limit?: number },
): Promise<WorkspaceStaffRecipient[]> {
  const limit = options?.limit ?? 8;
  const rows = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      status: "ACTIVE",
      role: { in: DESK_ROLES },
      user: { disabledAt: null },
    },
    take: limit,
    select: {
      user: { select: { id: true, email: true, phone: true } },
    },
  });
  return rows.map((r) => r.user);
}

export async function resolveWorkspaceNotificationRecipients(input: {
  workspaceId: string;
  assigneeId?: string | null;
  includeDesk?: boolean;
}): Promise<WorkspaceStaffRecipient[]> {
  const ids = new Set<string>();
  const recipients: WorkspaceStaffRecipient[] = [];

  if (input.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: {
        id: input.assigneeId,
        disabledAt: null,
      },
      select: { id: true, email: true, phone: true },
    });
    if (assignee) {
      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: input.workspaceId,
          userId: assignee.id,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (member) {
        ids.add(assignee.id);
        recipients.push(assignee);
      }
    }
  }

  if (input.includeDesk !== false) {
    const desk = await resolveWorkspaceDeskRecipients(input.workspaceId);
    for (const row of desk) {
      if (!ids.has(row.id)) {
        ids.add(row.id);
        recipients.push(row);
      }
    }
  }

  return recipients;
}

export function isWorkspaceNotificationScopeEnabled(): boolean {
  return isWorkspaceNotificationScope();
}

export type DeskNotifierRow = {
  user: WorkspaceStaffRecipient & { name?: string | null };
};

/**
 * Desk notifier list for new-lead staff push/email.
 * Legacy: Organization OWNER/ADMIN. Workspace scope: Workspace OWNER/ADMIN.
 */
export async function resolveLeadDeskNotifiers(input: {
  organizationId: string | null;
  workspaceId?: string | null;
}): Promise<DeskNotifierRow[]> {
  if (isWorkspaceNotificationScope() && input.workspaceId) {
    const desk = await resolveWorkspaceDeskRecipients(input.workspaceId);
    return desk.map((user) => ({ user }));
  }

  if (!input.organizationId) return [];

  return prisma.organizationMembership.findMany({
    where: {
      organizationId: input.organizationId,
      role: { in: ["OWNER", "ADMIN"] },
      user: { disabledAt: null },
    },
    select: {
      user: { select: { id: true, email: true, phone: true, name: true } },
    },
    take: 8,
  });
}

/**
 * Filter push/email recipients to ACTIVE members of the event workspace.
 */
export async function filterRecipientsInWorkspace(
  workspaceId: string,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      userId: { in: userIds },
      status: "ACTIVE",
    },
    select: { userId: true },
  });
  const allowed = new Set(members.map((m) => m.userId));
  return userIds.filter((id) => allowed.has(id));
}

/**
 * Resolve trusted workspaceId for a lead-backed staff event.
 * Never infer from recipient user or brokerage.
 */
export async function resolveLeadEventWorkspaceId(
  leadId: string,
): Promise<string | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { workspaceId: true },
  });
  return lead?.workspaceId ?? null;
}

/**
 * Authorize a single staff push/email recipient for a lead-backed event.
 * Legacy scope: always allow (caller remains responsible).
 * Workspace scope: ACTIVE WorkspaceMember in lead.workspaceId required.
 */
export async function authorizeStaffRecipientForLead(input: {
  userId: string;
  leadId: string;
  event?: string;
}): Promise<boolean> {
  if (!isWorkspaceNotificationScope()) return true;

  const workspaceId = await resolveLeadEventWorkspaceId(input.leadId);
  if (!workspaceId) {
    console.warn("[staff-notify] skip: lead missing workspaceId", {
      event: input.event ?? "unknown",
      leadIdPrefix: input.leadId.slice(0, 8),
    });
    return false;
  }

  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId,
      userId: input.userId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) {
    console.warn("[staff-notify] skip: foreign/non-member recipient", {
      event: input.event ?? "unknown",
      leadIdPrefix: input.leadId.slice(0, 8),
      workspaceIdPrefix: workspaceId.slice(0, 8),
      userIdPrefix: input.userId.slice(0, 8),
    });
    return false;
  }
  return true;
}

/**
 * Authorize recipient for a task-backed event.
 * Uses task.workspaceId, else parent lead.workspaceId.
 */
export async function authorizeStaffRecipientForTask(input: {
  userId: string;
  taskWorkspaceId: string | null;
  leadId: string | null;
  event?: string;
}): Promise<boolean> {
  if (!isWorkspaceNotificationScope()) return true;

  let workspaceId = input.taskWorkspaceId;
  if (!workspaceId && input.leadId) {
    workspaceId = await resolveLeadEventWorkspaceId(input.leadId);
  }
  if (!workspaceId) {
    console.warn("[staff-notify] skip: task missing workspace context", {
      event: input.event ?? "task_due",
    });
    return false;
  }

  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId,
      userId: input.userId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) {
    console.warn("[staff-notify] skip: task recipient not in workspace", {
      event: input.event ?? "task_due",
      workspaceIdPrefix: workspaceId.slice(0, 8),
      userIdPrefix: input.userId.slice(0, 8),
    });
    return false;
  }
  return true;
}

/** Filter candidate userIds to ACTIVE members of the lead's workspace. */
export async function filterStaffRecipientsForLead(
  leadId: string,
  userIds: string[],
  event?: string,
): Promise<string[]> {
  if (!isWorkspaceNotificationScope()) return userIds;
  const allowed: string[] = [];
  for (const userId of userIds) {
    if (
      await authorizeStaffRecipientForLead({
        userId,
        leadId,
        event,
      })
    ) {
      allowed.push(userId);
    }
  }
  return allowed;
}
