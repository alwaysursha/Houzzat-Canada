import { ONLINE_MS } from "@/lib/agent/hotness";
import { openLeadProfileHref } from "@/lib/agent/lead-profile-query";
import { SITE_URL } from "@/lib/constants";
import { sendNotification } from "@/lib/notifications";
import {
  isStaffEmailCategoryEnabled,
  type StaffNotificationCategory,
} from "@/lib/notifications/staff-categories";
import { sendPushToUser, sendPushToUsers } from "@/lib/notifications/push";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { isAgentRole } from "@/lib/roles";
import {
  authorizeStaffRecipientForLead,
  authorizeStaffRecipientForTask,
  filterStaffRecipientsForLead,
} from "@/lib/workspace-notification-recipients";

function uniqueUserIds(
  ids: Array<string | null | undefined>,
): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export type NewLeadEmailRecipient = {
  id: string;
  email?: string | null;
  phone?: string | null;
};

export type NewLeadEmailSourceKind =
  | "signup"
  | "listing_inquiry"
  | "valuation"
  | "route_planner"
  | "pre_construction"
  | "other";

function absoluteLeadCrmUrl(leadId: string): string {
  const path = openLeadProfileHref(leadId);
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

/**
 * One New Leads email per unique staff recipient (assignee + desk, deduped).
 * Preference: New Leads Email (missing = ON). Worker-safe; never throws to callers.
 */
export function scheduleNewLeadStaffEmail(input: {
  leadId: string;
  source: NewLeadEmailSourceKind;
  subject: string;
  detailLines: string[];
  assigneeId?: string | null;
  deskRecipients?: NewLeadEmailRecipient[];
  smsText?: string;
  whatsappText?: string;
  preferWhatsApp?: boolean;
}): void {
  const deskById = new Map<string, NewLeadEmailRecipient>();
  for (const row of input.deskRecipients ?? []) {
    if (row.id) deskById.set(row.id, row);
  }
  const recipientIds = uniqueUserIds([
    input.assigneeId,
    ...deskById.keys(),
  ]);
  if (recipientIds.length === 0) {
    console.info("[staff-notify] new_lead email skipped: no recipients", {
      leadId: input.leadId,
      source: input.source,
    });
    return;
  }

  const cta = absoluteLeadCrmUrl(input.leadId);
  const text = [...input.detailLines, "", `View lead in HouzzatPro: ${cta}`]
    .filter((line) => line != null)
    .join("\n");

  scheduleWorkerSideEffect(
    (async () => {
      const authorizedIds = await filterStaffRecipientsForLead(
        input.leadId,
        recipientIds,
        "new_lead_email",
      );
      if (authorizedIds.length === 0) {
        console.info("[staff-notify] new_lead email skipped: no authorized recipients", {
          leadId: input.leadId,
          source: input.source,
        });
        return;
      }

      const users = await prisma.user.findMany({
        where: { id: { in: authorizedIds } },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          disabledAt: true,
          pushNotificationPrefs: true,
        },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      const emailed = new Set<string>();

      for (const id of authorizedIds) {
        const user = byId.get(id);
        if (!user || user.disabledAt) continue;
        if (!isAgentRole(user.role)) continue;
        if (
          !isStaffEmailCategoryEnabled(
            user.pushNotificationPrefs,
            "new_leads",
          )
        ) {
          console.info("[staff-notify] new_lead email skipped: preference off", {
            leadId: input.leadId,
            source: input.source,
          });
          continue;
        }

        const desk = deskById.get(id);
        const toEmail = (desk?.email || user.email || "").trim();
        if (!toEmail) continue;
        const emailKey = toEmail.toLowerCase();
        if (emailed.has(emailKey)) continue;
        emailed.add(emailKey);

        const toPhone = desk?.phone ?? user.phone;
        const result = await sendNotification({
          toEmail,
          toPhone,
          subject: input.subject,
          text,
          smsText: input.smsText,
          whatsappText: input.whatsappText,
          preferWhatsApp: input.preferWhatsApp,
        });
        if (result.email === "failed") {
          console.error("[staff-notify] new_lead email failed", {
            leadId: input.leadId,
            source: input.source,
            email: "failed",
          });
        }
      }
    })().catch((error) => {
      console.error("[staff-notify] new_lead email batch failed", {
        leadId: input.leadId,
        source: input.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
}

/**
 * Generic desk / staff email (non–New-Lead categories). Prefer
 * scheduleNewLeadStaffEmail for New Leads sources.
 */
export function scheduleStaffNotificationEmail(input: {
  recipientUserId: string;
  emailCategory: StaffNotificationCategory;
  toEmail?: string | null;
  toPhone?: string | null;
  subject: string;
  text: string;
  smsText?: string;
  whatsappText?: string;
  preferWhatsApp?: boolean;
  /** Sanitized context for failure logs (no PII). */
  logContext?: Record<string, string | number | boolean | null | undefined>;
}): void {
  if (!input.toEmail && !input.toPhone) return;

  scheduleWorkerSideEffect(
    (async () => {
      const user = await prisma.user.findUnique({
        where: { id: input.recipientUserId },
        select: {
          disabledAt: true,
          pushNotificationPrefs: true,
        },
      });
      if (!user || user.disabledAt) return;
      if (
        !isStaffEmailCategoryEnabled(
          user.pushNotificationPrefs,
          input.emailCategory,
        )
      ) {
        console.info("[staff-notify] email skipped: preference off", {
          ...input.logContext,
          category: input.emailCategory,
        });
        return;
      }

      const result = await sendNotification({
        toEmail: input.toEmail,
        toPhone: input.toPhone,
        subject: input.subject,
        text: input.text,
        smsText: input.smsText,
        whatsappText: input.whatsappText,
        preferWhatsApp: input.preferWhatsApp,
      });
      if (result.email === "failed") {
        console.error("[staff-notify] email failed", {
          ...input.logContext,
          email: "failed",
        });
      }
    })(),
  );
}

export function notifyLeadAssignedToAgent(
  agentId: string | null | undefined,
  input: { leadId: string; label: string },
) {
  if (!agentId) return;
  scheduleWorkerSideEffect(
    (async () => {
      const ok = await authorizeStaffRecipientForLead({
        userId: agentId,
        leadId: input.leadId,
        event: "lead_reassigned",
      });
      if (!ok) return;
      sendPushToUser(agentId, {
        type: "lead_reassigned",
        title: "Lead assigned to you",
        body: input.label,
        href: openLeadProfileHref(input.leadId),
      });
    })().catch((error) => {
      console.error("[staff-notify] lead_reassigned failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
}

/**
 * HouzzatPro `new_lead` after durable lead + assignment exist.
 * Fans out to assignee + optional desk staff (deduped). No-op if nobody to notify.
 */
export function notifyNewLeadCapturedToStaff(input: {
  leadId: string;
  label: string;
  title?: string;
  assigneeId?: string | null;
  deskUserIds?: Array<string | null | undefined>;
}): void {
  const recipients = uniqueUserIds([
    input.assigneeId,
    ...(input.deskUserIds ?? []),
  ]);
  if (recipients.length === 0) {
    console.info("[staff-notify] new_lead skipped: no recipients", {
      leadId: input.leadId,
    });
    return;
  }
  scheduleWorkerSideEffect(
    (async () => {
      const authorized = await filterStaffRecipientsForLead(
        input.leadId,
        recipients,
        "new_lead",
      );
      if (authorized.length === 0) {
        console.info("[staff-notify] new_lead skipped: no authorized recipients", {
          leadId: input.leadId,
        });
        return;
      }
      sendPushToUsers(authorized, {
        type: "new_lead",
        title: input.title ?? "New lead",
        body: input.label,
        href: openLeadProfileHref(input.leadId),
      });
    })().catch((error) => {
      console.error("[staff-notify] new_lead push failed", {
        leadId: input.leadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
}

/** Signup / single-assignee convenience — same push as desk fan-out with one id. */
export function notifyNewLeadCaptured(
  agentId: string | null | undefined,
  input: { leadId: string; label: string },
) {
  notifyNewLeadCapturedToStaff({
    leadId: input.leadId,
    label: input.label,
    assigneeId: agentId,
  });
}

/** First beacon after the 3-minute presence window — assigned agents only. */
export async function notifyCustomerCameOnline(
  userId: string,
  previousLastSeenAt: Date | null,
) {
  const wasOffline =
    !previousLastSeenAt ||
    Date.now() - previousLastSeenAt.getTime() >= ONLINE_MS;
  if (!wasOffline) return;

  const leads = await prisma.lead.findMany({
    where: { customerId: userId, assignedAgentId: { not: null } },
    select: {
      id: true,
      workspaceId: true,
      assignedAgentId: true,
      customer: { select: { name: true, email: true } },
    },
    take: 8,
  });
  if (leads.length === 0) return;

  const name =
    leads[0]?.customer?.name?.trim() ||
    leads[0]?.customer?.email ||
    "A client";

  const seen = new Set<string>();
  for (const lead of leads) {
    const agentId = lead.assignedAgentId;
    if (!agentId || agentId === userId || seen.has(agentId)) continue;
    const ok = await authorizeStaffRecipientForLead({
      userId: agentId,
      leadId: lead.id,
      event: "lead_online",
    });
    if (!ok) continue;
    seen.add(agentId);
    sendPushToUser(agentId, {
      type: "lead_online",
      title: "Lead is online",
      body: name,
      href: openLeadProfileHref(lead.id),
    });
  }

  if (seen.size === 0) return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const views = await prisma.activityEvent.findMany({
    where: {
      userId,
      type: "LISTING_VIEW",
      createdAt: { gte: since },
      mlsNumber: { not: null },
    },
    select: { mlsNumber: true },
    take: 40,
  });
  const distinct = new Set(views.map((row) => row.mlsNumber)).size;
  if (distinct < 3) return;

  for (const agentId of seen) {
    const lead = leads.find((row) => row.assignedAgentId === agentId);
    if (!lead) continue;
    const ok = await authorizeStaffRecipientForLead({
      userId: agentId,
      leadId: lead.id,
      event: "hot_pipeline",
    });
    if (!ok) continue;
    sendPushToUser(agentId, {
      type: "hot_pipeline",
      title: "Hot pipeline",
      body: `${name} viewed ${distinct} homes today`,
      href: openLeadProfileHref(lead.id),
    });
  }
}

/** Enqueue presence / hot-pipeline pushes without blocking the beacon response. */
export function scheduleNotifyCustomerCameOnline(
  userId: string,
  previousLastSeenAt: Date | null,
): void {
  scheduleWorkerSideEffect(
    notifyCustomerCameOnline(userId, previousLastSeenAt).catch((error) => {
      console.error("[staff-notify] lead_online/hot failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
}

/** Morning briefing of open overdue tasks (runs with the digest cron). */
export async function notifyOpenTasksDue() {
  const tasks = await prisma.agentTask.findMany({
    where: {
      status: "OPEN",
      dueAt: { lte: new Date() },
    },
    select: {
      title: true,
      assigneeId: true,
      leadId: true,
      workspaceId: true,
    },
    take: 300,
    orderBy: { dueAt: "asc" },
  });

  const byAgent = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const ok = await authorizeStaffRecipientForTask({
      userId: task.assigneeId,
      taskWorkspaceId: task.workspaceId,
      leadId: task.leadId,
      event: "task_due",
    });
    if (!ok) continue;
    const list = byAgent.get(task.assigneeId) ?? [];
    list.push(task);
    byAgent.set(task.assigneeId, list);
  }

  for (const [agentId, list] of byAgent) {
    const first = list[0];
    if (!first) continue;
    sendPushToUser(agentId, {
      type: "task_due",
      title: list.length === 1 ? "Task due" : `${list.length} tasks due`,
      body: first.title,
      href: first.leadId ? openLeadProfileHref(first.leadId) : "/agent/tasks",
    });
  }
}
