import { ONLINE_MS } from "@/lib/agent/hotness";
import { sendPushToUser } from "@/lib/notifications/push";
import { prisma } from "@/lib/prisma";

export function notifyLeadAssignedToAgent(
  agentId: string | null | undefined,
  input: { leadId: string; label: string },
) {
  if (!agentId) return;
  void sendPushToUser(agentId, {
    type: "lead_reassigned",
    title: "Lead assigned to you",
    body: input.label,
    href: `/agent/leads/${input.leadId}`,
  });
}

/** After a new lead is captured and routed — HouzzatPro `new_lead` alert. */
export function notifyNewLeadCaptured(
  agentId: string | null | undefined,
  input: { leadId: string; label: string },
) {
  if (!agentId) return;
  sendPushToUser(agentId, {
    type: "new_lead",
    title: "New lead",
    body: input.label,
    href: `/agent/leads/${input.leadId}`,
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
    seen.add(agentId);
    void sendPushToUser(agentId, {
      type: "lead_online",
      title: "Lead is online",
      body: name,
      href: `/agent/leads/${lead.id}`,
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
    void sendPushToUser(agentId, {
      type: "hot_pipeline",
      title: "Hot pipeline",
      body: `${name} viewed ${distinct} homes today`,
      href: `/agent/leads/${lead.id}`,
    });
  }
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
    },
    take: 300,
    orderBy: { dueAt: "asc" },
  });

  const byAgent = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const list = byAgent.get(task.assigneeId) ?? [];
    list.push(task);
    byAgent.set(task.assigneeId, list);
  }

  for (const [agentId, list] of byAgent) {
    const first = list[0];
    if (!first) continue;
    void sendPushToUser(agentId, {
      type: "task_due",
      title: list.length === 1 ? "Task due" : `${list.length} tasks due`,
      body: first.title,
      href: first.leadId ? `/agent/leads/${first.leadId}` : "/agent/tasks",
    });
  }
}
