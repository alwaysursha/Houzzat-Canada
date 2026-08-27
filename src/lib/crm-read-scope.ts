/**
 * Stage 3F — centralized CRM read-scope resolution (legacy | shadow | workspace).
 * Writes remain on organizationId via crm-ownership.ts; this module governs reads only.
 */
import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import { scheduleWorkerSideEffect } from "@/lib/prisma";
import { isTenantDomainScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";

export type CrmReadScopeMode = "legacy" | "shadow" | "workspace";

/** Minimal staff CRM context required for read-scope helpers. */
export type CrmScopeContext = {
  user: { id: string };
  organizationId: string;
  organizationIds: string[];
  canSeeTeamLeads: boolean;
  isPlatformAdmin: boolean;
  workspaceId: string | null;
  isWorkspaceMember: boolean;
  isWorkspaceCrmAllowed: boolean;
  hasAmbiguousWorkspaceMembership: boolean;
};

export function parseCrmReadScope(): CrmReadScopeMode {
  const flag = process.env.WORKSPACE_READ_SCOPE?.trim().toLowerCase();
  if (flag === "workspace") return "workspace";
  if (flag === "shadow") return "shadow";
  return "legacy";
}

/** Fail-closed tenant filter when workspace CRM is unavailable. */
const NO_LEADS: Prisma.LeadWhereInput = { id: { in: [] } };

export function isWorkspaceReadMode(): boolean {
  return parseCrmReadScope() === "workspace";
}

/** Workspace reads + hostname-bound CRM — both scopes must be workspace. */
export function isActiveHostnameBoundReadMode(): boolean {
  return isWorkspaceReadMode() && isTenantDomainScopeWorkspace();
}

export function leadTenantWhere(ctx: CrmScopeContext): Prisma.LeadWhereInput {
  if (isActiveHostnameBoundReadMode()) {
    if (
      ctx.hasAmbiguousWorkspaceMembership ||
      !ctx.isWorkspaceMember ||
      !ctx.isWorkspaceCrmAllowed ||
      !ctx.workspaceId
    ) {
      return NO_LEADS;
    }
    return { workspaceId: ctx.workspaceId };
  }

  return { organizationId: { in: ctx.organizationIds } };
}

export function agentTaskTenantWhere(
  ctx: CrmScopeContext,
): Prisma.AgentTaskWhereInput {
  if (isActiveHostnameBoundReadMode()) {
    if (
      ctx.hasAmbiguousWorkspaceMembership ||
      !ctx.isWorkspaceMember ||
      !ctx.isWorkspaceCrmAllowed ||
      !ctx.workspaceId
    ) {
      return { id: { in: [] } };
    }
    return { workspaceId: ctx.workspaceId };
  }

  return { organizationId: ctx.organizationId };
}

/** Lead list visibility — tenant boundary + mine/pond/team rules. */
export function leadScopeWhere(
  ctx: CrmScopeContext,
  view: "mine" | "pond" | "team" = "mine",
): Prisma.LeadWhereInput {
  const tenant = leadTenantWhere(ctx);

  if (view === "pond") {
    return { ...tenant, assignedAgentId: null };
  }

  if (view === "team" && ctx.canSeeTeamLeads) {
    return tenant;
  }

  return {
    ...tenant,
    OR: [{ assignedAgentId: ctx.user.id }, { assignedAgentId: null }],
  };
}

/** Desk activity / statistics desk lead filter. */
export function leadWhereForDesk(
  ctx: CrmScopeContext,
  deskAgentId: string | null,
): Prisma.LeadWhereInput {
  const tenant = leadTenantWhere(ctx);

  if (ctx.canSeeTeamLeads) {
    if (deskAgentId) return { ...tenant, assignedAgentId: deskAgentId };
    return tenant;
  }

  return { ...tenant, assignedAgentId: ctx.user.id };
}

/**
 * SQL fragment matching desk lead scope for statistics aggregates.
 */
export function leadDeskSql(
  ctx: CrmScopeContext,
  focusAgentId: string | null,
): PrismaNs.Sql {
  if (isActiveHostnameBoundReadMode()) {
    if (
      ctx.hasAmbiguousWorkspaceMembership ||
      !ctx.isWorkspaceMember ||
      !ctx.isWorkspaceCrmAllowed ||
      !ctx.workspaceId
    ) {
      return PrismaNs.sql`FALSE`;
    }

    const wsClause = PrismaNs.sql`"workspaceId" = ${ctx.workspaceId}`;

    if (focusAgentId) {
      return PrismaNs.sql`${wsClause} AND "assignedAgentId" = ${focusAgentId}`;
    }
    if (ctx.canSeeTeamLeads) {
      return wsClause;
    }
    return PrismaNs.sql`${wsClause} AND "assignedAgentId" = ${ctx.user.id}`;
  }

  if (focusAgentId) {
    return PrismaNs.sql`"organizationId" = ${ctx.organizationId} AND "assignedAgentId" = ${focusAgentId}`;
  }

  const orgIds = ctx.organizationIds.length
    ? ctx.organizationIds
    : [ctx.organizationId];
  const orgClause = PrismaNs.sql`"organizationId" IN (${PrismaNs.join(orgIds)})`;

  if (ctx.canSeeTeamLeads) {
    return orgClause;
  }
  return PrismaNs.sql`${orgClause} AND "assignedAgentId" = ${ctx.user.id}`;
}

function legacyCanAccessLead(
  ctx: CrmScopeContext,
  lead: {
    organizationId: string | null;
    assignedAgentId: string | null;
  },
): boolean {
  if (ctx.isPlatformAdmin || ctx.canSeeTeamLeads) return true;
  if (
    lead.organizationId &&
    !ctx.organizationIds.includes(lead.organizationId)
  ) {
    return false;
  }
  if (!lead.assignedAgentId) return true;
  return lead.assignedAgentId === ctx.user.id;
}

function workspaceCanAccessLead(
  ctx: CrmScopeContext,
  lead: {
    workspaceId?: string | null;
    assignedAgentId: string | null;
  },
): boolean {
  if (
    ctx.hasAmbiguousWorkspaceMembership ||
    !ctx.isWorkspaceMember ||
    !ctx.isWorkspaceCrmAllowed ||
    !ctx.workspaceId
  ) {
    return false;
  }

  if (!lead.workspaceId || lead.workspaceId !== ctx.workspaceId) {
    return false;
  }

  if (ctx.canSeeTeamLeads) return true;
  if (!lead.assignedAgentId) return true;
  return lead.assignedAgentId === ctx.user.id;
}

export function canAccessLead(
  ctx: CrmScopeContext,
  lead: {
    organizationId: string | null;
    workspaceId?: string | null;
    assignedAgentId: string | null;
  },
): boolean {
  const mode = parseCrmReadScope();

  if (isActiveHostnameBoundReadMode()) {
    return workspaceCanAccessLead(ctx, lead);
  }

  const legacy = legacyCanAccessLead(ctx, lead);

  if (mode === "shadow" && ctx.workspaceId && lead.workspaceId) {
    scheduleWorkerSideEffect(
      logCanAccessShadowMismatch(ctx, lead, legacy).catch(() => undefined),
    );
  }

  return legacy;
}

type LeadAccessFields = {
  organizationId: string | null;
  workspaceId?: string | null;
  assignedAgentId: string | null;
};

/**
 * Gate PATCH on appointments linked to a Lead (Stage 3F.1).
 * Lead-less appointments use agentId assignment only — no workspace inference.
 */
export function canMutateAppointment(
  ctx: CrmScopeContext,
  appointment: {
    agentId: string | null;
    lead: LeadAccessFields | null;
  },
): { allowed: true } | { allowed: false; reason: "lead" | "agent" } {
  if (appointment.lead && !canAccessLead(ctx, appointment.lead)) {
    return { allowed: false, reason: "lead" };
  }

  if (
    !ctx.isPlatformAdmin &&
    appointment.agentId &&
    appointment.agentId !== ctx.user.id
  ) {
    return { allowed: false, reason: "agent" };
  }

  return { allowed: true };
}

async function logCanAccessShadowMismatch(
  ctx: CrmScopeContext,
  lead: {
    organizationId: string | null;
    workspaceId?: string | null;
    assignedAgentId: string | null;
  },
  legacy: boolean,
): Promise<void> {
  const proposed = workspaceCanAccessLead(ctx, lead);
  if (legacy === proposed) return;

  console.warn("[crm-read-scope] canAccessLead shadow mismatch", {
    leadIdPrefix: lead.organizationId ? undefined : undefined,
    workspaceIdPrefix: lead.workspaceId?.slice(0, 8),
    userIdPrefix: ctx.user.id.slice(0, 8),
    legacy,
    proposed,
  });
}

export function maybeLogLeadScopeShadowMismatch(
  ctx: CrmScopeContext,
  view: "mine" | "pond" | "team",
  legacyCount: number,
  workspaceCount: number,
): void {
  if (parseCrmReadScope() !== "shadow") return;
  if (legacyCount === workspaceCount) return;

  console.warn("[crm-read-scope] leadScopeWhere shadow count mismatch", {
    view,
    userIdPrefix: ctx.user.id.slice(0, 8),
    legacyCount,
    workspaceCount,
  });
}
