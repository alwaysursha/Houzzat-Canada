import type { LeadIntent, LeadSource, SellerLeadAssignMode } from "@prisma/client";
import {
  resolveDefaultOrganizationId,
  resolveOrganizationIdForAssignee,
} from "@/lib/agent";
import { prisma } from "@/lib/prisma";

export const CALL_NEW_LEAD_TASK_TITLE = "Call new lead";
export const CALL_NEW_LEAD_DUE_MS = 12 * 60 * 60 * 1000;
export const ATTEMPTED_CONTACT_REMINDER_TITLE =
  "Follow up — attempted contact";
export const ATTEMPTED_CONTACT_REMINDER_MS = 24 * 60 * 60 * 1000;
export const CRM_ROUTING_SETTINGS_ID = "default";

export type RoutableAgent = {
  id: string;
  name: string | null;
  email: string;
};

/** Active field agents used for auto-routing counts and weights. */
export async function listRoutableAgents(): Promise<RoutableAgent[]> {
  return prisma.user.findMany({
    where: {
      role: "AGENT",
      disabledAt: null,
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

/**
 * Buyer+seller → seller desk. Seller-only → seller. Otherwise buyer.
 */
export function resolveLeadIntent(flags: {
  isBuyer?: boolean | null;
  isSeller?: boolean | null;
}): LeadIntent {
  if (flags.isSeller) return "SELLER";
  return "BUYER";
}

export async function ensureCrmRoutingSettings() {
  const agents = await listRoutableAgents();
  let settings = await prisma.crmRoutingSettings.findUnique({
    where: { id: CRM_ROUTING_SETTINGS_ID },
    include: { weights: true },
  });

  if (!settings) {
    const listingAgentId = agents[0]?.id ?? null;
    settings = await prisma.crmRoutingSettings.create({
      data: {
        id: CRM_ROUTING_SETTINGS_ID,
        listingAgentId,
        sellerAssignMode: "LISTING_AGENT",
      },
      include: { weights: true },
    });
  } else if (!settings.listingAgentId && agents[0]) {
    settings = await prisma.crmRoutingSettings.update({
      where: { id: CRM_ROUTING_SETTINGS_ID },
      data: { listingAgentId: agents[0].id },
      include: { weights: true },
    });
  }

  await syncRoutingWeights(
    agents.map((a) => a.id),
    settings.weights,
  );

  return prisma.crmRoutingSettings.findUniqueOrThrow({
    where: { id: CRM_ROUTING_SETTINGS_ID },
    include: {
      listingAgent: { select: { id: true, name: true, email: true } },
      weights: {
        include: {
          agent: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

async function syncRoutingWeights(
  agentIds: string[],
  existing: {
    id: string;
    agentId: string;
    lane: "BUYER" | "SELLER";
    percent: number;
  }[],
) {
  const lanes = ["BUYER", "SELLER"] as const;
  const equal =
    agentIds.length === 0 ? 0 : Math.floor(100 / agentIds.length);
  const remainder =
    agentIds.length === 0 ? 0 : 100 - equal * agentIds.length;

  for (const lane of lanes) {
    const laneWeights = existing.filter((w) => w.lane === lane);
    const known = new Set(laneWeights.map((w) => w.agentId));

    for (const agentId of agentIds) {
      if (known.has(agentId)) continue;
      const index = agentIds.indexOf(agentId);
      const percent = equal + (index === 0 ? remainder : 0);
      await prisma.crmRoutingWeight.create({
        data: {
          settingsId: CRM_ROUTING_SETTINGS_ID,
          agentId,
          lane,
          percent,
        },
      });
    }

    for (const weight of laneWeights) {
      if (!agentIds.includes(weight.agentId)) {
        await prisma.crmRoutingWeight.delete({ where: { id: weight.id } });
      }
    }

    const refreshed = await prisma.crmRoutingWeight.findMany({
      where: { settingsId: CRM_ROUTING_SETTINGS_ID, lane },
    });
    const sum = refreshed.reduce((s, w) => s + w.percent, 0);
    if (refreshed.length > 0 && sum === 0) {
      for (let i = 0; i < refreshed.length; i++) {
        const row = refreshed[i]!;
        await prisma.crmRoutingWeight.update({
          where: { id: row.id },
          data: { percent: equal + (i === 0 ? remainder : 0) },
        });
      }
    }
  }
}

/**
 * Pick assignee from routing rules.
 * 0 agents → null (pond). 1 agent → that agent. 2+ → weights / listing agent.
 */
export async function resolveRoutedAssignee(
  intent: LeadIntent,
): Promise<string | null> {
  const agents = await listRoutableAgents();
  if (agents.length === 0) return null;
  if (agents.length === 1) return agents[0]!.id;

  const settings = await ensureCrmRoutingSettings();

  if (intent === "SELLER") {
    const mode: SellerLeadAssignMode = settings.sellerAssignMode;
    if (mode === "LISTING_AGENT") {
      if (
        settings.listingAgentId &&
        agents.some((a) => a.id === settings.listingAgentId)
      ) {
        return settings.listingAgentId;
      }
    }
  }

  const lane = intent === "SELLER" ? "SELLER" : "BUYER";
  const weights = settings.weights.filter(
    (w) => w.lane === lane && w.percent > 0,
  );
  if (weights.length === 0) {
    return agents[0]?.id ?? null;
  }

  let best = weights[0]!;
  let bestScore =
    best.percent > 0
      ? best.assignedCount / best.percent
      : Number.POSITIVE_INFINITY;
  for (const weight of weights.slice(1)) {
    const score =
      weight.percent > 0
        ? weight.assignedCount / weight.percent
        : Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      best = weight;
      bestScore = score;
    }
  }

  await prisma.crmRoutingWeight.update({
    where: { id: best.id },
    data: { assignedCount: { increment: 1 } },
  });

  return best.agentId;
}

export async function createCallNewLeadTask(input: {
  leadId: string;
  assigneeId: string;
  organizationId: string;
  createdById?: string | null;
}) {
  await prisma.agentTask.updateMany({
    where: {
      leadId: input.leadId,
      status: "OPEN",
      title: CALL_NEW_LEAD_TASK_TITLE,
    },
    data: { status: "CANCELLED" },
  });

  return prisma.agentTask.create({
    data: {
      organizationId: input.organizationId,
      leadId: input.leadId,
      assigneeId: input.assigneeId,
      createdById: input.createdById ?? null,
      type: "CALL",
      status: "OPEN",
      title: CALL_NEW_LEAD_TASK_TITLE,
      body: "Auto-created when lead was assigned. Follow up within 12 hours.",
      dueAt: new Date(Date.now() + CALL_NEW_LEAD_DUE_MS),
    },
  });
}

/** When a lead moves to Attempted Contact — drop call-new tasks, set 24h reminder. */
export async function onLeadAttemptedContact(input: {
  leadId: string;
  assigneeId: string;
  organizationId: string;
  createdById?: string | null;
}) {
  await prisma.agentTask.updateMany({
    where: {
      leadId: input.leadId,
      status: "OPEN",
      title: CALL_NEW_LEAD_TASK_TITLE,
    },
    data: { status: "CANCELLED" },
  });

  await prisma.agentTask.updateMany({
    where: {
      leadId: input.leadId,
      status: "OPEN",
      title: ATTEMPTED_CONTACT_REMINDER_TITLE,
    },
    data: { status: "CANCELLED" },
  });

  return prisma.agentTask.create({
    data: {
      organizationId: input.organizationId,
      leadId: input.leadId,
      assigneeId: input.assigneeId,
      createdById: input.createdById ?? null,
      type: "CALL",
      status: "OPEN",
      title: ATTEMPTED_CONTACT_REMINDER_TITLE,
      body: "Lead marked Attempted Contact. Follow up within 24 hours.",
      dueAt: new Date(Date.now() + ATTEMPTED_CONTACT_REMINDER_MS),
    },
  });
}

export async function applyLeadAssignment(input: {
  leadId: string;
  assigneeId: string | null;
  actorId?: string | null;
  activityBody?: string;
}) {
  const organizationId =
    (await resolveOrganizationIdForAssignee(input.assigneeId)) ??
    (await resolveDefaultOrganizationId());

  await prisma.lead.update({
    where: { id: input.leadId },
    data: {
      assignedAgentId: input.assigneeId,
      ...(organizationId ? { organizationId } : {}),
      activities: {
        create: {
          type: input.assigneeId ? "assigned" : "unassigned",
          userId: input.actorId ?? undefined,
          body:
            input.activityBody ??
            (input.assigneeId
              ? `Assigned to agent ${input.assigneeId}`
              : "Moved to pond"),
        },
      },
    },
  });

  if (input.assigneeId && organizationId) {
    await createCallNewLeadTask({
      leadId: input.leadId,
      assigneeId: input.assigneeId,
      organizationId,
      createdById: input.actorId,
    });
  }

  return { organizationId, assigneeId: input.assigneeId };
}

/** Resolve org + assignee for a new lead create payload. */
export async function resolveLeadDeskAssignment(intent: LeadIntent) {
  const assigneeId = await resolveRoutedAssignee(intent);
  const organizationId =
    (await resolveOrganizationIdForAssignee(assigneeId)) ??
    (await resolveDefaultOrganizationId());
  return { assigneeId, organizationId };
}

/**
 * Create a signup / simple website lead with routing + 12h call task.
 */
export async function captureWebsiteLead(input: {
  source: LeadSource;
  intent?: LeadIntent;
  isBuyer?: boolean;
  isSeller?: boolean;
  customerId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  score?: number;
  actorId?: string | null;
  /** Skip auto-routing and use this assignee (null = pond). */
  forceAssigneeId?: string | null;
}) {
  const intent =
    input.intent ??
    resolveLeadIntent({
      isBuyer: input.isBuyer ?? true,
      isSeller: input.isSeller ?? false,
    });

  const routed =
    input.forceAssigneeId !== undefined
      ? {
          assigneeId: input.forceAssigneeId,
          organizationId:
            (await resolveOrganizationIdForAssignee(input.forceAssigneeId)) ??
            (await resolveDefaultOrganizationId()),
        }
      : await resolveLeadDeskAssignment(intent);

  const { assigneeId, organizationId } = routed;

  const lead = await prisma.lead.create({
    data: {
      source: input.source,
      status: "NEW_LEAD",
      intent,
      score: input.score ?? 15,
      notes:
        input.notes ??
        [
          input.name || input.email
            ? `Contact: ${input.name || "Customer"}${input.email ? ` <${input.email}>` : ""}`
            : null,
          input.phone ? `Phone: ${input.phone}` : null,
          `Signup lead (${intent === "SELLER" ? "seller" : "buyer"})`,
        ]
          .filter(Boolean)
          .join("\n"),
      customerId: input.customerId,
      assignedAgentId: assigneeId,
      organizationId: organizationId ?? undefined,
      contactConsentAt: new Date(),
      statusChangedAt: new Date(),
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: "created",
      userId: input.actorId ?? input.customerId,
      body: `Lead captured (${intent.toLowerCase()}) via ${input.source}`,
    },
  });

  if (assigneeId && organizationId) {
    await createCallNewLeadTask({
      leadId: lead.id,
      assigneeId,
      organizationId,
      createdById: input.actorId,
    });
  }

  return { lead, assignedAgentId: assigneeId, organizationId };
}

/**
 * After a custom lead.create that left assignedAgentId null, apply routing.
 */
export async function routeExistingLead(input: {
  leadId: string;
  intent: LeadIntent;
  actorId?: string | null;
}) {
  const current = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, assignedAgentId: true, intent: true },
  });
  if (!current) return null;

  if (current.intent !== input.intent) {
    await prisma.lead.update({
      where: { id: input.leadId },
      data: { intent: input.intent },
    });
  }

  if (current.assignedAgentId) {
    const organizationId =
      (await resolveOrganizationIdForAssignee(current.assignedAgentId)) ??
      (await resolveDefaultOrganizationId());
    if (organizationId) {
      await createCallNewLeadTask({
        leadId: input.leadId,
        assigneeId: current.assignedAgentId,
        organizationId,
        createdById: input.actorId,
      });
    }
    return current.assignedAgentId;
  }

  const assigneeId = await resolveRoutedAssignee(input.intent);
  await applyLeadAssignment({
    leadId: input.leadId,
    assigneeId,
    actorId: input.actorId,
    activityBody: assigneeId
      ? `Auto-routed (${input.intent.toLowerCase()})`
      : "No routable agent — left in pond",
  });
  return assigneeId;
}
