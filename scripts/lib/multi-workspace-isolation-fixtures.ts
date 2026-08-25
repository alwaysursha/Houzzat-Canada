/**
 * Stage 3G — Sun Realty multi-workspace isolation fixtures (TEST ONLY, no production DB).
 */
import type { CrmScopeContext } from "../../src/lib/crm-read-scope";
import {
  agentTaskTenantWhere,
  canAccessLead,
  canMutateAppointment,
  leadScopeWhere,
  leadTenantWhere,
} from "../../src/lib/crm-read-scope";

export const BROKERAGE = "Sun Realty";

export const WS_A = "ws_smith_team";
export const WS_B = "ws_jones_team";

export const USERS = {
  ownerA: "user_owner_a",
  adminA: "user_admin_a",
  agentA1: "user_agent_a1",
  agentA2: "user_agent_a2",
  ownerB: "user_owner_b",
  adminB: "user_admin_b",
  agentB1: "user_agent_b1",
  agentB2: "user_agent_b2",
  platformAdmin: "user_platform_admin",
  sharedUser: "user_shared_ab",
  customerShared: "user_customer_shared",
} as const;

export type FixtureLead = {
  id: string;
  workspaceId: string;
  organizationId: string;
  assignedAgentId: string | null;
  customerId: string | null;
  status: string;
  source: string;
};

export type FixtureTask = {
  id: string;
  workspaceId: string;
  leadId: string;
  assigneeId: string;
};

export type FixtureNote = {
  id: string;
  workspaceId: string;
  leadId: string;
};

export type FixtureEmailLog = {
  id: string;
  workspaceId: string;
  leadId: string;
};

export type FixtureActivity = {
  id: string;
  leadId: string;
};

export type FixtureAppointment = {
  id: string;
  leadId: string;
  agentId: string;
  lead: FixtureLead;
};

export const FIXTURE = {
  brokerage: BROKERAGE,
  workspaces: {
    a: {
      id: WS_A,
      slug: "smith-team",
      name: "Smith Team",
      primaryAgentId: USERS.agentA1,
      billingOwnerUserId: USERS.ownerA,
      brokerageAffiliation: BROKERAGE,
    },
    b: {
      id: WS_B,
      slug: "jones-team",
      name: "Jones Team",
      primaryAgentId: USERS.agentB1,
      billingOwnerUserId: USERS.ownerB,
      brokerageAffiliation: BROKERAGE,
    },
  },
  leads: [
    {
      id: "lead_a1",
      workspaceId: WS_A,
      organizationId: "org_legacy",
      assignedAgentId: USERS.agentA1,
      customerId: "cust_a_only",
      status: "NEW_LEAD",
      source: "SIGNUP",
    },
    {
      id: "lead_a2",
      workspaceId: WS_A,
      organizationId: "org_legacy",
      assignedAgentId: null,
      customerId: null,
      status: "NEW_LEAD",
      source: "HOME_VALUATION",
    },
    {
      id: "lead_b1",
      workspaceId: WS_B,
      organizationId: "org_legacy",
      assignedAgentId: USERS.agentB1,
      customerId: USERS.customerShared,
      status: "CONTACTED",
      source: "SIGNUP",
    },
    {
      id: "lead_b2",
      workspaceId: WS_B,
      organizationId: "org_legacy",
      assignedAgentId: null,
      customerId: null,
      status: "NEW_LEAD",
      source: "OTHER",
    },
    {
      id: "lead_a_shared_customer",
      workspaceId: WS_A,
      organizationId: "org_legacy",
      assignedAgentId: USERS.agentA2,
      customerId: USERS.customerShared,
      status: "PENDING_CLIENT",
      source: "SIGNUP",
    },
  ] satisfies FixtureLead[],
  tasks: [
    {
      id: "task_a1",
      workspaceId: WS_A,
      leadId: "lead_a1",
      assigneeId: USERS.agentA1,
    },
    {
      id: "task_b1",
      workspaceId: WS_B,
      leadId: "lead_b1",
      assigneeId: USERS.agentB1,
    },
  ] satisfies FixtureTask[],
  notes: [
    { id: "note_a1", workspaceId: WS_A, leadId: "lead_a1" },
    { id: "note_b1", workspaceId: WS_B, leadId: "lead_b1" },
  ] satisfies FixtureNote[],
  emailLogs: [
    { id: "email_a1", workspaceId: WS_A, leadId: "lead_a1" },
    { id: "email_b1", workspaceId: WS_B, leadId: "lead_b1" },
  ] satisfies FixtureEmailLog[],
  activities: [
    { id: "act_a1", leadId: "lead_a1" },
    { id: "act_b1", leadId: "lead_b1" },
  ] satisfies FixtureActivity[],
  appointments: [
    {
      id: "appt_a1",
      leadId: "lead_a1",
      agentId: USERS.agentA1,
      lead: null as unknown as FixtureLead,
    },
    {
      id: "appt_b1",
      leadId: "lead_b1",
      agentId: USERS.agentB1,
      lead: null as unknown as FixtureLead,
    },
  ] satisfies FixtureAppointment[],
};

// Wire appointment parent leads
FIXTURE.appointments[0]!.lead = FIXTURE.leads[0]!;
FIXTURE.appointments[1]!.lead = FIXTURE.leads[2]!;

const ORG_LEGACY = "org_legacy";

export function ctxFor(
  workspace: "a" | "b",
  role: "OWNER" | "ADMIN" | "AGENT",
  userId: string,
  overrides: Partial<CrmScopeContext> = {},
): CrmScopeContext {
  const workspaceId = workspace === "a" ? WS_A : WS_B;
  const canSeeTeamLeads = role === "OWNER" || role === "ADMIN";
  return {
    user: { id: userId },
    organizationId: ORG_LEGACY,
    organizationIds: [ORG_LEGACY],
    canSeeTeamLeads,
    isPlatformAdmin: false,
    workspaceId,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    ...overrides,
  };
}

export function leadById(id: string): FixtureLead {
  const lead = FIXTURE.leads.find((l) => l.id === id);
  if (!lead) throw new Error(`missing fixture lead ${id}`);
  return lead;
}

/** Mirror list visibility using Stage 3F workspace-mode helpers + in-memory filter. */
export function visibleLeadIds(
  ctx: CrmScopeContext,
  view: "mine" | "team" | "pond",
): string[] {
  const tenant = leadTenantWhere(ctx);
  if ("id" in tenant && tenant.id && "in" in tenant.id && tenant.id.in.length === 0) {
    return [];
  }
  const scope = leadScopeWhere(ctx, view);
  return FIXTURE.leads
    .filter((lead) => matchesLeadScope(lead, scope))
    .map((l) => l.id);
}

function matchesLeadScope(
  lead: FixtureLead,
  scope: ReturnType<typeof leadScopeWhere>,
): boolean {
  if (scope.workspaceId && lead.workspaceId !== scope.workspaceId) return false;
  if (scope.assignedAgentId === null && lead.assignedAgentId !== null) {
    return false;
  }
  if (
    typeof scope.assignedAgentId === "string" &&
    lead.assignedAgentId !== scope.assignedAgentId
  ) {
    return false;
  }
  if (scope.OR) {
    const or = scope.OR as Array<{
      assignedAgentId?: string | null;
    }>;
    const ok = or.some((clause) => {
      if ("assignedAgentId" in clause) {
        if (clause.assignedAgentId === null) return lead.assignedAgentId === null;
        return lead.assignedAgentId === clause.assignedAgentId;
      }
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

export function visibleTaskIds(ctx: CrmScopeContext): string[] {
  const tenant = agentTaskTenantWhere(ctx);
  if ("id" in tenant && tenant.id && "in" in tenant.id && tenant.id.in.length === 0) {
    return [];
  }
  return FIXTURE.tasks
    .filter((t) => t.workspaceId === ctx.workspaceId)
    .map((t) => t.id);
}

export function childVisibleViaLead<T extends { leadId: string }>(
  ctx: CrmScopeContext,
  rows: T[],
): T[] {
  return rows.filter((row) => {
    const lead = leadById(row.leadId);
    return canAccessLead(ctx, lead);
  });
}

export function statisticsLeadCount(ctx: CrmScopeContext): number {
  const tenant = leadTenantWhere(ctx);
  if ("id" in tenant && tenant.id && "in" in tenant.id && tenant.id.in.length === 0) {
    return 0;
  }
  return FIXTURE.leads.filter((l) => l.workspaceId === ctx.workspaceId).length;
}

export function hotnessCohortIds(ctx: CrmScopeContext): string[] {
  return visibleLeadIds(ctx, ctx.canSeeTeamLeads ? "team" : "mine");
}

/** Future API guard — client workspaceId must never override membership workspace. */
export function rejectForeignWorkspaceId(
  ctx: CrmScopeContext,
  requestedWorkspaceId: string | null | undefined,
): boolean {
  if (!requestedWorkspaceId) return false;
  if (!ctx.workspaceId) return true;
  return requestedWorkspaceId !== ctx.workspaceId;
}

export function ambiguousMembershipCtx(userId: string): CrmScopeContext {
  return {
    user: { id: userId },
    organizationId: ORG_LEGACY,
    organizationIds: [ORG_LEGACY],
    canSeeTeamLeads: false,
    isPlatformAdmin: false,
    workspaceId: null,
    isWorkspaceMember: false,
    isWorkspaceCrmAllowed: false,
    hasAmbiguousWorkspaceMembership: true,
  };
}

export function appointmentAuth(
  ctx: CrmScopeContext,
  appointment: FixtureAppointment,
) {
  return canMutateAppointment(ctx, {
    agentId: appointment.agentId,
    lead: appointment.lead,
  });
}
