import type { LeadIntent, LeadSource } from "@prisma/client";
import { pickRoutedAssignee } from "@/lib/agent/pick-routed-assignee";
import { resolveLeadIntent } from "@/lib/agent/lead-intent";
import {
  resolveDefaultOrganizationId,
  resolveOrganizationIdForAssignee,
} from "@/lib/agent";
import {
  formatNewLeadEmailSubject,
  formatNewLeadPushTitle,
  formatSignupLeadDetailLine,
  formatSignupLeadEmailSubject,
  resolveLeadNotificationBrandFromRequest,
} from "@/lib/tenancy/lead-notification-brand";
import {
  isWorkspacePublicLeadScope,
  PublicLeadRoutingError,
  resolveOrganizationForWorkspaceLeadDesk,
  resolveWorkspaceModeLeadDeskAssignment,
} from "@/lib/workspace-lead-desk";
import {
  ensureCrmRoutingSettings,
  listLegacyRoutableAgents,
  listRoutableAgents,
  listRoutableAgentsForSettings,
} from "@/lib/crm-routing-config";
import {
  resolveChildCrmOwnership,
  resolveLeadCrmOwnership,
} from "@/lib/crm-ownership";
import { notifyNewLeadCapturedToStaff, scheduleNewLeadStaffEmail } from "@/lib/notifications/staff-events";
import {
  scheduleCustomerIntroductionSmsAutomationsForLead,
  scheduleSignupSmsAutomations,
} from "@/lib/sms/automations";
import { resolveOrCreateWorkspaceLead } from "@/lib/agent/resolve-workspace-lead";
import { prisma } from "@/lib/prisma";
import {
  resolveDefaultWorkspaceIdForRouting,
  resolveWorkspaceRoutedAssignee,
  shouldUseWorkspaceRouting,
} from "@/lib/workspace-routing";
import {
  detectClientWorkspaceOverride,
  resolvePublicLeadWorkspaceIdFromRequest,
} from "@/lib/tenancy/public-lead-workspace";
import type { HostResolutionDeps } from "@/lib/tenancy/resolve-workspace-host";

export { CRM_ROUTING_SETTINGS_ID, type RoutableAgent } from "@/lib/agent/routing-types";
export {
  ensureCrmRoutingSettings,
  listLegacyRoutableAgents,
  listRoutableAgents,
  listRoutableAgentsForSettings,
  syncCrmRoutingSettingsForWorkspace,
  syncRoutingWeightsForSettings,
  planRoutingWeightSync,
  usesWorkspaceRoutingForSettings,
  validateListingAgentForSettings,
  validateWeightsForSettings,
} from "@/lib/crm-routing-config";

export const CALL_NEW_LEAD_TASK_TITLE = "Call new lead";
export const CALL_NEW_LEAD_DUE_MS = 12 * 60 * 60 * 1000;
export const ATTEMPTED_CONTACT_REMINDER_TITLE =
  "Follow up — attempted contact";
export const ATTEMPTED_CONTACT_REMINDER_MS = 24 * 60 * 60 * 1000;

export { resolveLeadIntent };

/**
 * Pick assignee from routing rules.
 * 0 agents → null (pond). 1 agent → that agent.
 * 2+ → LISTING_AGENT or PERCENTAGE as configured. No arbitrary agents[0].
 */
export async function resolveRoutedAssignee(
  intent: LeadIntent,
  workspaceId?: string | null,
): Promise<string | null> {
  if (shouldUseWorkspaceRouting(workspaceId)) {
    return resolveWorkspaceRoutedAssignee(workspaceId, intent);
  }

  const settings = await ensureCrmRoutingSettings();
  const agents = await listRoutableAgentsForSettings(settings);
  const pick = pickRoutedAssignee({
    intent,
    agentIds: agents.map((a) => a.id),
    sellerAssignMode: settings.sellerAssignMode,
    listingAgentId: settings.listingAgentId,
    weights: settings.weights.map((w) => ({
      id: w.id,
      agentId: w.agentId,
      lane: w.lane,
      percent: w.percent,
      assignedCount: w.assignedCount,
    })),
  });

  if (pick.weightId) {
    await prisma.crmRoutingWeight.update({
      where: { id: pick.weightId },
      data: { assignedCount: { increment: 1 } },
    });
  }

  return pick.agentId;
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

  const ownership = await resolveChildCrmOwnership({
    organizationId: input.organizationId,
    leadId: input.leadId,
  });

  return prisma.agentTask.create({
    data: {
      organizationId: ownership.organizationId,
      workspaceId: ownership.workspaceId,
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

  const ownership = await resolveChildCrmOwnership({
    organizationId: input.organizationId,
    leadId: input.leadId,
  });

  return prisma.agentTask.create({
    data: {
      organizationId: ownership.organizationId,
      workspaceId: ownership.workspaceId,
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
  const ownership = await resolveLeadCrmOwnership(organizationId);

  await prisma.lead.update({
    where: { id: input.leadId },
    data: {
      assignedAgentId: input.assigneeId,
      ...(organizationId
        ? { organizationId, workspaceId: ownership.workspaceId }
        : {}),
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
export async function resolveLeadDeskAssignment(
  intent: LeadIntent,
  workspaceId?: string | null,
  request?: Request | null,
  deps?: HostResolutionDeps,
) {
  let trustedWorkspaceId: string | null;

  if (request) {
    trustedWorkspaceId = await resolvePublicLeadWorkspaceIdFromRequest(
      request,
      deps,
    );
    if (isWorkspacePublicLeadScope() && !trustedWorkspaceId) {
      throw new PublicLeadRoutingError(
        "workspace_not_resolved",
        "Public lead routing requires a verified tenant hostname",
      );
    }
  } else if (isWorkspacePublicLeadScope()) {
    throw new PublicLeadRoutingError(
      "workspace_not_resolved",
      "Public lead routing requires a trusted request hostname",
    );
  } else {
    trustedWorkspaceId =
      workspaceId ?? (await resolveDefaultWorkspaceIdForRouting());
  }

  if (isWorkspacePublicLeadScope() && trustedWorkspaceId) {
    const desk = await resolveWorkspaceModeLeadDeskAssignment({
      workspaceId: trustedWorkspaceId,
      intent,
    });
    return {
      assigneeId: desk.assigneeId,
      organizationId: desk.organizationId,
      workspaceId: desk.workspaceId,
      workspaceSlug: desk.workspaceSlug,
      isHouzzatWorkspace: desk.isHouzzatWorkspace,
    };
  }

  const assigneeId = await resolveRoutedAssignee(intent, trustedWorkspaceId);
  const organizationId =
    (await resolveOrganizationIdForAssignee(assigneeId, trustedWorkspaceId)) ??
    (await resolveDefaultOrganizationId());
  return {
    assigneeId,
    organizationId,
    workspaceId: trustedWorkspaceId,
    workspaceSlug: trustedWorkspaceId ? "houzzat" : null,
    isHouzzatWorkspace: true,
  };
}

/**
 * Lead desk assignment using trusted request tenancy when workspace lead scope is enabled.
 * Client workspace overrides must be rejected separately via detectClientWorkspaceOverride.
 */
export async function resolveLeadDeskAssignmentForRequest(
  request: Request,
  intent: LeadIntent,
  deps?: HostResolutionDeps,
) {
  return resolveLeadDeskAssignment(intent, null, request, deps);
}

export { PublicLeadRoutingError } from "@/lib/workspace-lead-desk";
export { httpStatusForPublicLeadRoutingError } from "@/lib/workspace-lead-desk";
export { detectClientWorkspaceOverride };

export async function resolveLeadCreateOwnership(input: {
  organizationId: string | null;
  workspaceId: string | null;
}) {
  if (isWorkspacePublicLeadScope() && input.workspaceId) {
    return {
      organizationId: input.organizationId ?? undefined,
      workspaceId: input.workspaceId,
    };
  }
  return resolveLeadCrmOwnership(input.organizationId);
}

/**
 * Hostname/workspace tenancy for public Lead capture WITHOUT picking an assignee.
 * Routing (and assignedCount increment) must run only after resolve-first.
 */
export async function resolveLeadCaptureTenancy(
  request?: Request | null,
  deps?: HostResolutionDeps,
  workspaceId?: string | null,
) {
  let trustedWorkspaceId: string | null;

  if (request) {
    trustedWorkspaceId = await resolvePublicLeadWorkspaceIdFromRequest(
      request,
      deps,
    );
    if (isWorkspacePublicLeadScope() && !trustedWorkspaceId) {
      throw new PublicLeadRoutingError(
        "workspace_not_resolved",
        "Public lead routing requires a verified tenant hostname",
      );
    }
  } else if (isWorkspacePublicLeadScope()) {
    throw new PublicLeadRoutingError(
      "workspace_not_resolved",
      "Public lead routing requires a trusted request hostname",
    );
  } else {
    trustedWorkspaceId =
      workspaceId ?? (await resolveDefaultWorkspaceIdForRouting());
  }

  if (isWorkspacePublicLeadScope() && trustedWorkspaceId) {
    const organizationId =
      await resolveOrganizationForWorkspaceLeadDesk(trustedWorkspaceId);
    return {
      workspaceId: trustedWorkspaceId,
      organizationId,
    };
  }

  const organizationId = await resolveDefaultOrganizationId();
  return {
    workspaceId: trustedWorkspaceId,
    organizationId,
  };
}

/**
 * Create a signup / simple website lead with routing + 12h call task.
 * Resolve-first: existing workspace Lead is reused and never rerouted.
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
  /** Skip auto-routing and use this assignee (null = pond). Create-only. */
  forceAssigneeId?: string | null;
  request?: Request | null;
  deps?: HostResolutionDeps;
}) {
  const isBuyer = input.isBuyer ?? true;
  const isSeller = input.isSeller ?? false;
  const intent =
    input.intent ??
    resolveLeadIntent({
      isBuyer,
      isSeller,
    });

  const tenancy = await resolveLeadCaptureTenancy(
    input.request,
    input.deps,
  );
  if (!tenancy.workspaceId) {
    throw new PublicLeadRoutingError(
      "workspace_not_resolved",
      "Public lead routing requires a verified tenant hostname",
    );
  }

  const notes =
    input.notes ??
    [
      input.name || input.email
        ? `Contact: ${input.name || "Customer"}${input.email ? ` <${input.email}>` : ""}`
        : null,
      input.phone ? `Phone: ${input.phone}` : null,
      `Signup lead (${intent === "SELLER" ? "seller" : "buyer"})`,
    ]
      .filter(Boolean)
      .join("\n");

  const resolved = await resolveOrCreateWorkspaceLead({
    workspaceId: tenancy.workspaceId,
    organizationId: tenancy.organizationId,
    customerId: input.customerId,
    email: input.email,
    phone: input.phone,
    name: input.name,
    isBuyer,
    isSeller,
    source: input.source,
    notes,
    score: input.score ?? 15,
    contactConsentAt: new Date(),
    actorId: input.actorId ?? input.customerId,
    upsertCustomer: false,
    activity: {
      type: "created",
      userId: input.actorId ?? input.customerId,
      body: `Lead captured (${intent.toLowerCase()}) via ${input.source}`,
    },
    resolveCreateDesk: async () => {
      if (input.forceAssigneeId !== undefined) {
        const organizationId =
          (await resolveOrganizationIdForAssignee(
            input.forceAssigneeId,
            tenancy.workspaceId,
          )) ?? tenancy.organizationId;
        return {
          assigneeId: input.forceAssigneeId,
          organizationId,
        };
      }
      const routed = input.request
        ? await resolveLeadDeskAssignmentForRequest(
            input.request,
            intent,
            input.deps,
          )
        : await resolveLeadDeskAssignment(intent, tenancy.workspaceId);
      const ownership = await resolveLeadCreateOwnership({
        organizationId: routed.organizationId,
        workspaceId: routed.workspaceId,
      });
      return {
        assigneeId: routed.assigneeId,
        organizationId:
          ownership.organizationId ?? routed.organizationId ?? null,
      };
    },
  });

  const assigneeId = resolved.assignedAgentId;
  const organizationId = resolved.organizationId;
  const lead = resolved.lead;

  if (!resolved.created) {
    return {
      lead,
      assignedAgentId: assigneeId,
      organizationId,
      created: false,
    };
  }

  if (input.source === "SIGNUP") {
    scheduleSignupSmsAutomations(lead.id);
  } else {
    scheduleCustomerIntroductionSmsAutomationsForLead(lead.id);
  }

  if (assigneeId) {
    const brand = await resolveLeadNotificationBrandFromRequest(input.request);
    const contactLabel =
      input.name?.trim() ||
      input.email?.trim() ||
      "New client";
    const bodyLabel =
      input.source === "SIGNUP"
        ? `${contactLabel} · signup`
        : contactLabel;
    notifyNewLeadCapturedToStaff({
      leadId: lead.id,
      label: bodyLabel,
      title: formatNewLeadPushTitle(brand),
      assigneeId,
    });

    const intentLabel = intent === "SELLER" ? "Seller" : "Buyer";
    const sourceKind =
      input.source === "SIGNUP"
        ? ("signup" as const)
        : ("other" as const);
    scheduleNewLeadStaffEmail({
      leadId: lead.id,
      source: sourceKind,
      subject:
        input.source === "SIGNUP"
          ? formatSignupLeadEmailSubject(brand)
          : formatNewLeadEmailSubject(brand, input.source),
      detailLines: [
        input.source === "SIGNUP"
          ? formatSignupLeadDetailLine(brand)
          : `A new lead was captured (${input.source}).`,
        `Contact: ${contactLabel}`,
        input.email ? `Email: ${input.email}` : null,
        input.phone ? `Phone: ${input.phone}` : null,
        `Intent: ${intentLabel}`,
      ].filter((line): line is string => Boolean(line)),
      assigneeId,
    });
  }

  if (assigneeId && organizationId) {
    try {
      await createCallNewLeadTask({
        leadId: lead.id,
        assigneeId,
        organizationId,
        createdById: input.actorId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[lead-intake] call-new-lead-task failed", {
        leadId: lead.id,
        assigneeId,
        organizationId,
        source: input.source,
        error: message,
      });
    }
  }

  return {
    lead,
    assignedAgentId: assigneeId,
    organizationId,
    created: true,
  };
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

  // Sticky ownership: never reroute or rewrite intent on an assigned Lead.
  if (current.assignedAgentId) {
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
