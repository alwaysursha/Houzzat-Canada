import { ONLINE_MS } from "@/lib/agent/hotness";
import { openLeadHandoffHref } from "@/lib/agent/lead-profile-query";
import { SITE_URL } from "@/lib/constants";
import {
  dedupeLeadInfoChanges,
  formatLeadInfoUpdatedSummary,
  leadInfoChangeLabels,
  type MaterialLeadInfoChange,
} from "@/lib/agent/lead-info-change";
import { sendNotification } from "@/lib/notifications";
import {
  hasRecentLeadOnlineSignIn,
  markLeadOnlineSignIn,
  shouldEmitLeadOnline,
  uniqueAssignedAgentIds,
  type LeadOnlineSource,
} from "@/lib/notifications/lead-online-gate";
import { renderLeadInfoUpdatedEmail } from "@/lib/email/templates";
import { resolveCommunicationsE164 } from "@/lib/sms/e164";
import {
  isStaffEmailCategoryEnabled,
  type StaffNotificationCategory,
} from "@/lib/notifications/staff-categories";
import { sendPushToUser, sendPushToUsers } from "@/lib/notifications/push";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { isAgentRole, isConsumerRole } from "@/lib/roles";
import { scheduleLeadReturnedSmsAutomations } from "@/lib/sms/automations";
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
  const path = openLeadHandoffHref(leadId);
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

      const [leadRow, users] = await Promise.all([
        prisma.lead.findUnique({
          where: { id: input.leadId },
          select: { workspaceId: true },
        }),
        prisma.user.findMany({
          where: { id: { in: authorizedIds } },
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            disabledAt: true,
            pushNotificationPrefs: true,
          },
        }),
      ]);
      const workspaceId = leadRow?.workspaceId ?? null;
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
          workspaceId,
          smsClass: "staff",
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
  workspaceId?: string | null;
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
        workspaceId: input.workspaceId,
        smsClass: "staff",
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
        href: openLeadHandoffHref(input.leadId),
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
        href: openLeadHandoffHref(input.leadId),
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
  input: { leadId: string; label: string; title?: string },
) {
  notifyNewLeadCapturedToStaff({
    leadId: input.leadId,
    label: input.label,
    title: input.title,
    assigneeId: agentId,
  });
}

/** Leads whose assignee may receive lead_online. A workspace id limits that to one tenant. */
export function customerOnlineLeadWhere(
  customerId: string,
  workspaceId?: string | null,
) {
  return {
    customerId,
    assignedAgentId: { not: null },
    ...(workspaceId ? { workspaceId } : {}),
  };
}

/** Assigned-agent lead_online (sign-in or first beacon after the 3-minute window). */
export async function notifyCustomerCameOnline(
  userId: string,
  previousLastSeenAt: Date | null,
  opts?: {
    source?: LeadOnlineSource;
    role?: string | null;
    /** Null means a tenant was required and none resolved — do not notify other workspaces. */
    workspaceId?: string | null;
  },
) {
  const source: LeadOnlineSource = opts?.source ?? "beacon";

  if (source === "sign-in") {
    if (
      !shouldEmitLeadOnline({
        source: "sign-in",
        role: opts?.role,
        previousLastSeenAt: null,
        recentSignInAt: null,
      })
    ) {
      return;
    }
  } else {
    if (hasRecentLeadOnlineSignIn(userId)) return;
    if (
      !shouldEmitLeadOnline({
        source: "beacon",
        previousLastSeenAt,
        recentSignInAt: null,
      })
    ) {
      return;
    }
    const recentSignIn = await prisma.activityEvent.findFirst({
      where: {
        userId,
        type: "SIGN_IN",
        createdAt: { gte: new Date(Date.now() - ONLINE_MS) },
      },
      select: { id: true },
    });
    if (recentSignIn) return;
  }

  if (opts?.workspaceId === null) return;

  const leads = await prisma.lead.findMany({
    where: customerOnlineLeadWhere(userId, opts?.workspaceId),
    select: {
      id: true,
      workspaceId: true,
      assignedAgentId: true,
      customer: { select: { name: true, email: true } },
    },
    take: 8,
  });
  if (leads.length === 0) return;

  scheduleLeadReturnedSmsAutomations(userId, previousLastSeenAt);

  const name =
    leads[0]?.customer?.name?.trim() ||
    leads[0]?.customer?.email ||
    "A client";

  const seen = new Set<string>();
  for (const agentId of uniqueAssignedAgentIds(leads, userId)) {
    const lead = leads.find((row) => row.assignedAgentId === agentId);
    if (!lead) continue;
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
      href: openLeadHandoffHref(lead.id),
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
      href: openLeadHandoffHref(lead.id),
    });
  }
}

function scheduleLeadOnlineWork(
  userId: string,
  previousLastSeenAt: Date | null,
  source: LeadOnlineSource,
  role?: string | null,
  workspaceId?: string | null,
): void {
  scheduleWorkerSideEffect(
    notifyCustomerCameOnline(userId, previousLastSeenAt, {
      source,
      role,
      workspaceId,
    }).catch(
      (error) => {
        console.error("[staff-notify] lead_online/hot failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    ),
  );
}

/** Enqueue presence / hot-pipeline pushes without blocking the beacon response. */
export function scheduleNotifyCustomerCameOnline(
  userId: string,
  previousLastSeenAt: Date | null,
  workspaceId?: string | null,
): void {
  scheduleLeadOnlineWork(
    userId,
    previousLastSeenAt,
    "beacon",
    undefined,
    workspaceId,
  );
}

/**
 * Consumer sign-in → lead_online. BUYER/SELLER only.
 * Stamps the dedupe window so the immediate ActivityBeacon cannot send twice.
 */
export function scheduleNotifyCustomerCameOnlineFromSignIn(
  userId: string,
  role: string | null | undefined,
  workspaceId?: string | null,
): void {
  if (!userId || !isConsumerRole(role)) return;
  markLeadOnlineSignIn(userId);
  scheduleLeadOnlineWork(userId, null, "sign-in", role, workspaceId);
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
      href: first.leadId ? openLeadHandoffHref(first.leadId) : "/agent/tasks",
    });
  }
}

export type LeadInfoUpdatedNotifyDeps = {
  authorizeStaffRecipientForLead?: typeof authorizeStaffRecipientForLead;
  sendPushToUser?: typeof sendPushToUser;
  sendNotification?: typeof sendNotification;
  schedule?: (work: Promise<unknown>) => void;
  loadLead?: (leadId: string) => Promise<{
    id: string;
    workspaceId: string | null;
    assignedAgentId: string | null;
    customer: { name: string | null; email: string } | null;
  } | null>;
  loadAgent?: (agentId: string) => Promise<{
    id: string;
    email: string | null;
    phone: string | null;
    phoneE164: string | null;
    disabledAt: Date | null;
    role: string;
    pushNotificationPrefs: unknown;
  } | null>;
  writeActivity?: (input: {
    leadId: string;
    body: string;
    userId: string | null;
    labels: string[];
  }) => Promise<void>;
};

const defaultLeadInfoUpdatedDeps: LeadInfoUpdatedNotifyDeps = {};

function scheduleLeadInfoWork(
  work: Promise<unknown>,
  deps?: LeadInfoUpdatedNotifyDeps,
): void {
  const schedule = deps?.schedule ?? scheduleWorkerSideEffect;
  schedule(
    work.catch((error) => {
      console.error("[staff-notify] lead_info_updated failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
}

/**
 * Best-effort Lead Info Updated: Push + Email + Agent SMS to assignedAgentId.
 * Never throws to the customer request. One logical action → one event.
 */
export function notifyLeadInfoUpdated(
  input: {
    leadId: string;
    assignedAgentId?: string | null;
    clientLabel?: string | null;
    changes: MaterialLeadInfoChange[];
    actorUserId?: string | null;
  },
  deps: LeadInfoUpdatedNotifyDeps = defaultLeadInfoUpdatedDeps,
): void {
  const changes = dedupeLeadInfoChanges(input.changes);
  const labels = leadInfoChangeLabels(changes);
  if (labels.length === 0) return;

  scheduleLeadInfoWork(
    deliverLeadInfoUpdatedNotice(
      {
        leadId: input.leadId,
        assignedAgentId: input.assignedAgentId,
        clientLabel: input.clientLabel,
        labels,
        actorUserId: input.actorUserId ?? null,
      },
      deps,
    ),
    deps,
  );
}

export async function deliverLeadInfoUpdatedNotice(
  input: {
    leadId: string;
    assignedAgentId?: string | null;
    clientLabel?: string | null;
    labels: string[];
    actorUserId?: string | null;
  },
  deps: LeadInfoUpdatedNotifyDeps = defaultLeadInfoUpdatedDeps,
): Promise<{
  attempted: { push: boolean; email: boolean; sms: boolean };
  skipped?: string;
}> {
  const attempted = { push: false, email: false, sms: false };
  if (input.labels.length === 0) return { attempted, skipped: "no_changes" };

  const loadLead =
    deps.loadLead ??
    (async (leadId: string) =>
      prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          workspaceId: true,
          assignedAgentId: true,
          customer: { select: { name: true, email: true } },
        },
      }));
  const lead = await loadLead(input.leadId);
  if (!lead) return { attempted, skipped: "missing_lead" };

  const agentId = input.assignedAgentId ?? lead.assignedAgentId;
  if (!agentId) return { attempted, skipped: "unassigned" };

  const authorize =
    deps.authorizeStaffRecipientForLead ?? authorizeStaffRecipientForLead;
  const ok = await authorize({
    userId: agentId,
    leadId: lead.id,
    event: "lead_info_updated",
  });
  if (!ok) return { attempted, skipped: "unauthorized" };

  const clientLabel =
    input.clientLabel?.trim() ||
    lead.customer?.name?.trim() ||
    lead.customer?.email ||
    "A client";
  const summary = formatLeadInfoUpdatedSummary(clientLabel, input.labels);
  const href = openLeadHandoffHref(lead.id);
  const leadUrl = absoluteLeadCrmUrl(lead.id);

  const writeActivity =
    deps.writeActivity ??
    (async (row) => {
      await prisma.leadActivity.create({
        data: {
          leadId: row.leadId,
          type: "lead_info_updated",
          body: row.body,
          userId: row.userId,
          meta: { changes: row.labels },
        },
      });
    });
  try {
    await writeActivity({
      leadId: lead.id,
      body: summary,
      userId: input.actorUserId ?? null,
      labels: input.labels,
    });
  } catch (error) {
    console.error("[staff-notify] lead_info_updated activity failed", {
      leadId: lead.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const push = deps.sendPushToUser ?? sendPushToUser;
  try {
    attempted.push = true;
    push(agentId, {
      type: "lead_info_updated",
      title: "Lead info updated",
      body: summary,
      href,
    });
  } catch (error) {
    console.error("[staff-notify] lead_info_updated push failed", {
      leadId: lead.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const loadAgent =
    deps.loadAgent ??
    (async (id: string) =>
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          phone: true,
          phoneE164: true,
          disabledAt: true,
          role: true,
          pushNotificationPrefs: true,
        },
      }));
  const agent = await loadAgent(agentId);
  if (!agent || agent.disabledAt || !isAgentRole(agent.role)) {
    return { attempted, skipped: "agent_unavailable" };
  }
  if (!isStaffEmailCategoryEnabled(agent.pushNotificationPrefs, "lead_updates")) {
    return { attempted, skipped: "preference_off" };
  }

  const toEmail = agent.email?.trim() || null;
  const toPhone = resolveCommunicationsE164(agent.phone, agent.phoneE164);
  const rendered = renderLeadInfoUpdatedEmail({
    clientLabel,
    changeLabels: input.labels,
    leadUrl,
  });
  const notify = deps.sendNotification ?? sendNotification;
  try {
    attempted.email = Boolean(toEmail);
    attempted.sms = Boolean(toPhone);
    if (toEmail || toPhone) {
      await notify({
        toEmail,
        toPhone,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        smsText: summary,
        workspaceId: lead.workspaceId,
        smsClass: "staff",
      });
    }
  } catch (error) {
    console.error("[staff-notify] lead_info_updated email/sms failed", {
      leadId: lead.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { attempted };
}

/**
 * After resolve-first intake: notify only when an existing Lead materially changed.
 * New leads keep the New Lead emitters. Never reroutes.
 */
export function scheduleLeadInfoUpdatedAfterIntake(input: {
  created: boolean;
  leadId: string;
  assignedAgentId?: string | null;
  clientLabel?: string | null;
  changes: MaterialLeadInfoChange[];
  actorUserId?: string | null;
}): void {
  if (input.created) return;
  notifyLeadInfoUpdated({
    leadId: input.leadId,
    assignedAgentId: input.assignedAgentId,
    clientLabel: input.clientLabel,
    changes: input.changes,
    actorUserId: input.actorUserId,
  });
}

/**
 * Account / profile paths without a specific intake Lead: notify the canonical
 * (earliest created) assigned Lead in each workspace.
 */
export function scheduleLeadInfoUpdatedForCustomer(input: {
  customerId: string;
  changes: MaterialLeadInfoChange[];
  actorUserId?: string | null;
  clientLabel?: string | null;
}): void {
  const changes = dedupeLeadInfoChanges(input.changes);
  if (changes.length === 0) return;

  scheduleLeadInfoWork(
    (async () => {
      const leads = await prisma.lead.findMany({
        where: { customerId: input.customerId },
        select: {
          id: true,
          workspaceId: true,
          assignedAgentId: true,
          createdAt: true,
          customer: { select: { name: true, email: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const byWorkspace = new Map<string, (typeof leads)[number]>();
      for (const lead of leads) {
        const key = lead.workspaceId ?? `lead:${lead.id}`;
        if (!byWorkspace.has(key)) byWorkspace.set(key, lead);
      }
      const seenAgents = new Set<string>();
      for (const lead of byWorkspace.values()) {
        if (!lead.assignedAgentId) continue;
        const agentKey = `${lead.workspaceId ?? ""}:${lead.assignedAgentId}`;
        if (seenAgents.has(agentKey)) continue;
        seenAgents.add(agentKey);
        const clientLabel =
          input.clientLabel?.trim() ||
          lead.customer?.name?.trim() ||
          lead.customer?.email ||
          "A client";
        await deliverLeadInfoUpdatedNotice({
          leadId: lead.id,
          assignedAgentId: lead.assignedAgentId,
          clientLabel,
          labels: leadInfoChangeLabels(changes),
          actorUserId: input.actorUserId ?? input.customerId,
        });
      }
    })(),
  );
}
