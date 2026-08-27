/**
 * Stage 3K.5.7 — workspace-scoped public lead desk resolution (fail-closed).
 */
import type { LeadIntent } from "@prisma/client";
import {
  LEGACY_CRM_ORGANIZATION_SLUG,
  HOUZZAT_WORKSPACE_SLUG,
} from "@/lib/crm-ownership";
import { prisma } from "@/lib/prisma";
import { isTenantPublicLeadScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";
import {
  resolvePublicLeadWorkspaceIdFromRequest,
  type ClientWorkspaceOverrideRejection,
  detectClientWorkspaceOverride,
} from "@/lib/tenancy/public-lead-workspace";
import type { HostResolutionDeps } from "@/lib/tenancy/resolve-workspace-host";
import {
  listWorkspaceRoutableAgents,
  resolveWorkspaceRoutedAssignee,
  shouldUseWorkspaceRouting,
} from "@/lib/workspace-routing";

export type PublicLeadRoutingFailureReason =
  | "workspace_not_resolved"
  | "lead_desk_not_configured"
  | "organization_not_allowed"
  | "assignee_not_allowed"
  | "platform_surface";

export class PublicLeadRoutingError extends Error {
  readonly reason: PublicLeadRoutingFailureReason;

  constructor(
    reason: PublicLeadRoutingFailureReason,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "PublicLeadRoutingError";
    this.reason = reason;
  }
}

export type ResolvedPublicLeadDesk = {
  workspaceId: string | null;
  organizationId: string | null;
  assigneeId: string | null;
  workspaceSlug: string | null;
  isHouzzatWorkspace: boolean;
};

export type WorkspaceLeadDeskFixture = {
  lookupWorkspace: (
    workspaceId: string,
  ) => Promise<{ slug: string; status: string } | null>;
  lookupCompatOrg: () => Promise<{ id: string; slug: string } | null>;
  lookupHouzzatBrokerageOrg: () => Promise<{ id: string } | null>;
  listRoutableAgents: (
    workspaceId: string,
  ) => Promise<Array<{ id: string }>>;
  resolveWorkspaceAssignee: (
    workspaceId: string,
    intent: LeadIntent,
  ) => Promise<string | null>;
};

const defaultFixture: WorkspaceLeadDeskFixture = {
  lookupWorkspace: async (workspaceId) =>
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { slug: true, status: true },
    }),
  lookupCompatOrg: async () =>
    prisma.organization.findUnique({
      where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      select: { id: true, slug: true },
    }),
  lookupHouzzatBrokerageOrg: async () => {
    const fromEnv = process.env.DEFAULT_ORGANIZATION_ID?.trim();
    if (fromEnv) {
      const org = await prisma.organization.findUnique({
        where: { id: fromEnv },
        select: { id: true },
      });
      if (org) return org;
    }
    const compat = await prisma.organization.findUnique({
      where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      select: { id: true },
    });
    return compat;
  },
  listRoutableAgents: listWorkspaceRoutableAgents,
  resolveWorkspaceAssignee: resolveWorkspaceRoutedAssignee,
};

export function httpStatusForPublicLeadRoutingError(
  error: PublicLeadRoutingError,
): number {
  switch (error.reason) {
    case "lead_desk_not_configured":
      return 503;
    case "workspace_not_resolved":
    case "platform_surface":
    case "organization_not_allowed":
    case "assignee_not_allowed":
      return 403;
    default: {
      const _exhaustive: never = error.reason;
      return _exhaustive;
    }
  }
}

export async function assertAssigneeEligibleForWorkspace(
  workspaceId: string,
  assigneeId: string | null | undefined,
  fixture: WorkspaceLeadDeskFixture = defaultFixture,
): Promise<void> {
  if (!assigneeId) return;
  const agents = await fixture.listRoutableAgents(workspaceId);
  if (!agents.some((agent) => agent.id === assigneeId)) {
    throw new PublicLeadRoutingError(
      "assignee_not_allowed",
      `Assignee is not an eligible agent for workspace ${workspaceId.slice(0, 8)}`,
    );
  }
}

/**
 * Resolve CRM metadata organization for a workspace-scoped public lead.
 * Houzzat workspace → brokerage/compat org. Tenant workspaces → compat org (metadata only).
 */
export async function resolveOrganizationForWorkspaceLeadDesk(
  workspaceId: string,
  fixture: WorkspaceLeadDeskFixture = defaultFixture,
): Promise<string> {
  const workspace = await fixture.lookupWorkspace(workspaceId);
  if (!workspace || workspace.status !== "ACTIVE") {
    throw new PublicLeadRoutingError(
      "lead_desk_not_configured",
      "Workspace is inactive or missing for lead desk routing",
    );
  }

  if (workspace.slug === HOUZZAT_WORKSPACE_SLUG) {
    const houzzatOrg = await fixture.lookupHouzzatBrokerageOrg();
    if (!houzzatOrg) {
      throw new PublicLeadRoutingError(
        "lead_desk_not_configured",
        "Houzzat brokerage organization is not configured",
      );
    }
    return houzzatOrg.id;
  }

  const compat = await fixture.lookupCompatOrg();
  if (!compat) {
    throw new PublicLeadRoutingError(
      "lead_desk_not_configured",
      `Compatibility organization "${LEGACY_CRM_ORGANIZATION_SLUG}" is not configured`,
    );
  }
  return compat.id;
}

export async function resolveWorkspaceScopedAssignee(
  workspaceId: string,
  intent: LeadIntent,
  fixture: WorkspaceLeadDeskFixture = defaultFixture,
): Promise<string | null> {
  const agents = await fixture.listRoutableAgents(workspaceId);
  if (agents.length === 0) {
    throw new PublicLeadRoutingError(
      "lead_desk_not_configured",
      "No routable agents configured for workspace lead desk",
    );
  }
  return fixture.resolveWorkspaceAssignee(workspaceId, intent);
}

/**
 * Workspace-mode public lead desk assignment — fail-closed, no Houzzat fallback.
 */
export async function resolveWorkspaceModeLeadDeskAssignment(input: {
  workspaceId: string;
  intent: LeadIntent;
  fixture?: WorkspaceLeadDeskFixture;
}): Promise<ResolvedPublicLeadDesk> {
  const fixture = input.fixture ?? defaultFixture;
  const workspace = await fixture.lookupWorkspace(input.workspaceId);
  if (!workspace || workspace.status !== "ACTIVE") {
    throw new PublicLeadRoutingError(
      "workspace_not_resolved",
      "Trusted workspace is not active",
    );
  }

  const organizationId = await resolveOrganizationForWorkspaceLeadDesk(
    input.workspaceId,
    fixture,
  );
  const assigneeId = await resolveWorkspaceScopedAssignee(
    input.workspaceId,
    input.intent,
    fixture,
  );
  if (assigneeId) {
    await assertAssigneeEligibleForWorkspace(
      input.workspaceId,
      assigneeId,
      fixture,
    );
  }

  return {
    workspaceId: input.workspaceId,
    organizationId,
    assigneeId,
    workspaceSlug: workspace.slug,
    isHouzzatWorkspace: workspace.slug === HOUZZAT_WORKSPACE_SLUG,
  };
}

export async function resolveTrustedPublicLeadWorkspaceId(
  request: Request,
  deps?: HostResolutionDeps,
): Promise<string | null> {
  return resolvePublicLeadWorkspaceIdFromRequest(request, deps);
}

export {
  detectClientWorkspaceOverride,
  type ClientWorkspaceOverrideRejection,
};

export function isWorkspacePublicLeadScope(): boolean {
  return isTenantPublicLeadScopeWorkspace();
}

export function shouldRouteLeadsByWorkspace(
  workspaceId?: string | null,
): workspaceId is string {
  return isTenantPublicLeadScopeWorkspace() && Boolean(workspaceId);
}
