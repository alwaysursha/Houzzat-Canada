/**
 * Stage 3K.5.17 — Canonical Server-Side Tenant Authority Primitive.
 *
 * Security Model (Stage 3K.5.16 Target Architecture):
 * Derives staff authority ONLY through the authoritative server chain:
 *
 * REQUEST HOSTNAME (Trusted Server Extraction)
 *   │
 *   ▼
 * EXACT ACTIVE WORKSPACE (Strict WorkspaceDomain lookup / verified mapping)
 *   │
 *   ▼
 * AUTHENTICATED USER ID (Session verified on this host)
 *   │
 *   ▼
 * ACTIVE WORKSPACEMEMBER (Status = ACTIVE, Workspace Status = ACTIVE | TRIAL)
 *   │
 *   ▼
 * WORKSPACEMEMBER.ROLE (OWNER | ADMIN | AGENT | MEMBER)
 *
 * FORBIDDEN AUTHORITY SOURCES:
 * - User role (global)
 * - Org membership / legacy brokerage
 * - first-found WorkspaceMember
 * - cookie / client workspace ID
 * - legacy Houzzat default fallback
 * - platform bootstrap host (app.houzzatpro.com has ZERO tenant authority)
 */
import type {
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceStatus,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/reserved-domains";
import { lookupActiveWorkspaceDomainRow } from "@/lib/tenancy/workspace-domain-probe";
import type { DomainLookupRow } from "@/lib/tenancy/resolve-workspace-host";

export type TenantAuthoritySuccess = {
  ok: true;
  host: string;
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  workspaceRole: WorkspaceMemberRole;
  isActiveMember: true;
  canManageWorkspace: boolean;
  canSeeTeamLeads: boolean;
  isOwnerAdmin: boolean;
};

export type TenantAuthorityFailureReason =
  | "unauthenticated"
  | "platform_host_no_tenant_authority"
  | "malformed_hostname"
  | "unknown_tenant_workspace"
  | "workspace_inactive"
  | "no_active_membership"
  | "member_suspended"
  | "user_disabled";

export type TenantAuthorityFailure = {
  ok: false;
  reason: TenantAuthorityFailureReason;
  host: string | null;
  workspaceId?: string;
};

export type TenantAuthorityResult =
  | TenantAuthoritySuccess
  | TenantAuthorityFailure;

export type TenantAuthorityDeps = {
  lookupActiveDomain?: (hostname: string) => Promise<DomainLookupRow | null>;
  lookupUser?: (userId: string) => Promise<{
    id: string;
    disabledAt: Date | null;
  } | null>;
  lookupMembership?: (
    userId: string,
    workspaceId: string,
  ) => Promise<{
    id: string;
    role: WorkspaceMemberRole;
    status: WorkspaceMemberStatus;
    workspace: {
      id: string;
      slug: string;
      status: WorkspaceStatus;
    };
  } | null>;
};

async function defaultLookupDomain(
  hostname: string,
): Promise<DomainLookupRow | null> {
  const row = await lookupActiveWorkspaceDomainRow(defaultPrisma, hostname);
  if (!row) return null;
  return {
    hostname: row.hostname,
    kind: row.kind,
    role: row.role,
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspaceSlug,
    domainStatus: row.status,
    workspaceStatus: row.workspaceStatus,
  };
}

async function defaultLookupUser(
  userId: string,
): Promise<{ id: string; disabledAt: Date | null } | null> {
  return defaultPrisma.user.findUnique({
    where: { id: userId },
    select: { id: true, disabledAt: true },
  });
}

async function defaultLookupMembership(
  userId: string,
  workspaceId: string,
): Promise<{
  id: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
  workspace: {
    id: string;
    slug: string;
    status: WorkspaceStatus;
  };
} | null> {
  return defaultPrisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    select: {
      id: true,
      role: true,
      status: true,
      workspace: {
        select: {
          id: true,
          slug: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Strict Hostname → Workspace Resolver.
 * Fail closed:
 * - Blocks platform bootstrap host (app.houzzatpro.com).
 * - Blocks platform sales roots (houzzatpro.com, www.houzzatpro.com).
 * - Requires exact active DomainLookupRow (ACTIVE domain + ACTIVE/TRIAL workspace).
 * - Never defaults to Houzzat on unknown host.
 */
export async function resolveStrictTenantWorkspace(
  rawHostname: string,
  deps?: Pick<TenantAuthorityDeps, "lookupActiveDomain">,
): Promise<
  | {
      ok: true;
      host: string;
      workspaceId: string;
      workspaceSlug: string;
      workspaceStatus: WorkspaceStatus;
    }
  | {
      ok: false;
      reason:
        | "platform_host_no_tenant_authority"
        | "malformed_hostname"
        | "unknown_tenant_workspace"
        | "workspace_inactive";
      host: string | null;
    }
> {
  const normalized = normalizeWorkspaceHostname(rawHostname);
  if (!normalized.ok) {
    return { ok: false, reason: "malformed_hostname", host: null };
  }

  const hostname = normalized.hostname;

  // Platform bootstrap host has zero tenant authority
  if (isPlatformMobileBootstrapHost(hostname)) {
    return {
      ok: false,
      reason: "platform_host_no_tenant_authority",
      host: hostname,
    };
  }

  // Sales/marketing root has zero tenant authority
  if (isHouzzatProPlatformRoot(hostname)) {
    return {
      ok: false,
      reason: "platform_host_no_tenant_authority",
      host: hostname,
    };
  }

  const lookupFn = deps?.lookupActiveDomain ?? defaultLookupDomain;
  const domainRow = await lookupFn(hostname);

  if (!domainRow || domainRow.domainStatus !== "ACTIVE") {
    return {
      ok: false,
      reason: "unknown_tenant_workspace",
      host: hostname,
    };
  }

  // ACTIVE and TRIAL workspaces are operational for staff
  if (
    domainRow.workspaceStatus !== "ACTIVE" &&
    domainRow.workspaceStatus !== "TRIAL"
  ) {
    return {
      ok: false,
      reason: "workspace_inactive",
      host: hostname,
    };
  }

  return {
    ok: true,
    host: hostname,
    workspaceId: domainRow.workspaceId,
    workspaceSlug: domainRow.workspaceSlug,
    workspaceStatus: domainRow.workspaceStatus,
  };
}

/**
 * Canonical Server-Side Tenant Authority Resolver.
 *
 * Derives staff authority strictly from request hostname + active WorkspaceMember.
 * Does not check or grant authority from User.role or Organization.
 */
export async function resolveTenantAuthority(
  requestOrHost: Request | string,
  user?: { id?: string | null } | null,
  deps?: TenantAuthorityDeps,
): Promise<TenantAuthorityResult> {
  const rawHostname =
    typeof requestOrHost === "string"
      ? (requestOrHost.startsWith("http://") ||
        requestOrHost.startsWith("https://")
          ? new URL(requestOrHost).hostname
          : requestOrHost)
      : extractTrustedRequestHostname(requestOrHost);

  if (!rawHostname) {
    return { ok: false, reason: "malformed_hostname", host: null };
  }

  const userId = user?.id?.trim();
  if (!userId) {
    return { ok: false, reason: "unauthenticated", host: rawHostname };
  }

  const userLookupFn = deps?.lookupUser ?? defaultLookupUser;
  const dbUser = await userLookupFn(userId);
  if (!dbUser || dbUser.disabledAt) {
    return { ok: false, reason: "user_disabled", host: rawHostname };
  }

  const workspaceRes = await resolveStrictTenantWorkspace(rawHostname, deps);
  if (!workspaceRes.ok) {
    return {
      ok: false,
      reason: workspaceRes.reason,
      host: workspaceRes.host,
    };
  }

  const memberLookupFn = deps?.lookupMembership ?? defaultLookupMembership;
  const membership = await memberLookupFn(userId, workspaceRes.workspaceId);

  if (!membership) {
    return {
      ok: false,
      reason: "no_active_membership",
      host: workspaceRes.host,
      workspaceId: workspaceRes.workspaceId,
    };
  }

  if (membership.status === "SUSPENDED") {
    return {
      ok: false,
      reason: "member_suspended",
      host: workspaceRes.host,
      workspaceId: workspaceRes.workspaceId,
    };
  }

  if (membership.status !== "ACTIVE") {
    return {
      ok: false,
      reason: "no_active_membership",
      host: workspaceRes.host,
      workspaceId: workspaceRes.workspaceId,
    };
  }

  if (
    membership.workspace.status !== "ACTIVE" &&
    membership.workspace.status !== "TRIAL"
  ) {
    return {
      ok: false,
      reason: "workspace_inactive",
      host: workspaceRes.host,
      workspaceId: workspaceRes.workspaceId,
    };
  }

  const role = membership.role;
  const isOwnerAdmin = role === "OWNER" || role === "ADMIN";
  const canSeeTeamLeads = isOwnerAdmin;
  const canManageWorkspace = isOwnerAdmin;

  return {
    ok: true,
    host: workspaceRes.host,
    workspaceId: workspaceRes.workspaceId,
    workspaceSlug: workspaceRes.workspaceSlug,
    userId,
    workspaceRole: role,
    isActiveMember: true,
    canManageWorkspace,
    canSeeTeamLeads,
    isOwnerAdmin,
  };
}
