/**
 * Stage 3K.3 — trusted hostname → workspace resolver (fail-closed in workspace scope).
 */
import type {
  PrismaClient,
  WorkspaceDomainKind,
  WorkspaceDomainRole,
} from "@prisma/client";
import { HOUZZAT_WORKSPACE_SLUG } from "@/lib/crm-ownership";
import {
  clearHostResolutionCacheForTests,
  readHostResolutionCache,
  writeHostResolutionCache,
} from "@/lib/tenancy/host-resolution-cache";
import type {
  HostResolutionDenyReason,
  ResolvedWorkspaceHost,
} from "@/lib/tenancy/host-resolution-types";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import { blocksTenantHostnameResolution } from "@/lib/tenancy/reserved-domains";
import { isTenantDomainScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { lookupActiveWorkspaceDomainRow } from "@/lib/tenancy/workspace-domain-probe";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type DomainLookupRow = {
  hostname: string;
  kind: WorkspaceDomainKind;
  role: WorkspaceDomainRole;
  workspaceId: string;
  workspaceSlug: string;
  domainStatus: "ACTIVE" | "PENDING" | "DISABLED";
  workspaceStatus: "ACTIVE" | "TRIAL" | "SUSPENDED" | "CANCELLED";
};

export type HostResolutionDeps = {
  lookupActiveDomain: (
    hostname: string,
  ) => Promise<DomainLookupRow | null>;
  resolveLegacyHouzzatWorkspace: () => Promise<{
    workspaceId: string;
    workspaceSlug: string;
  } | null>;
};

function deny(
  normalizedHostname: string | null,
  reason: HostResolutionDenyReason,
): ResolvedWorkspaceHost {
  return {
    ok: false,
    mode: "workspace",
    normalizedHostname,
    reason,
    verifiedHostname: false,
  };
}

async function defaultLookupActiveDomain(
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

async function defaultLegacyHouzzatWorkspace(): Promise<{
  workspaceId: string;
  workspaceSlug: string;
} | null> {
  const workspace = await defaultPrisma.workspace.findUnique({
    where: { slug: HOUZZAT_WORKSPACE_SLUG },
    select: { id: true, slug: true, status: true },
  });
  if (!workspace || workspace.status !== "ACTIVE") return null;
  return { workspaceId: workspace.id, workspaceSlug: workspace.slug };
}

function resolveFromDomainRow(
  row: DomainLookupRow,
  normalizedHostname: string,
): ResolvedWorkspaceHost {
  if (row.domainStatus !== "ACTIVE") {
    return deny(normalizedHostname, "domain_inactive");
  }
  if (row.workspaceStatus === "SUSPENDED") {
    return deny(normalizedHostname, "workspace_suspended");
  }
  if (row.workspaceStatus !== "ACTIVE") {
    return deny(normalizedHostname, "workspace_inactive");
  }
  return {
    ok: true,
    mode: "workspace",
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspaceSlug,
    normalizedHostname,
    domainKind: row.kind,
    domainRole: row.role,
    verifiedHostname: true,
  };
}

/**
 * Resolve workspace from a raw hostname string.
 * Workspace scope: fail-closed — unknown hosts never become Houzzat.
 * Legacy scope: returns Houzzat workspace with verifiedHostname=false.
 */
export async function resolveWorkspaceFromHostname(
  rawHostname: string,
  deps: HostResolutionDeps = {
    lookupActiveDomain: defaultLookupActiveDomain,
    resolveLegacyHouzzatWorkspace: defaultLegacyHouzzatWorkspace,
  },
): Promise<ResolvedWorkspaceHost> {
  const scopeMode = isTenantDomainScopeWorkspace() ? "workspace" : "legacy";
  const normalized = normalizeWorkspaceHostname(rawHostname);

  if (!normalized.ok) {
    if (scopeMode === "workspace") {
      return deny(null, "malformed_hostname");
    }
    const legacy = await deps.resolveLegacyHouzzatWorkspace();
    if (!legacy) {
      return deny(null, "workspace_inactive");
    }
    return {
      ok: true,
      mode: "legacy",
      workspaceId: legacy.workspaceId,
      workspaceSlug: legacy.workspaceSlug,
      normalizedHostname: rawHostname.trim().toLowerCase(),
      verifiedHostname: false,
    };
  }

  const hostname = normalized.hostname;
  const cached = readHostResolutionCache(scopeMode, hostname);
  if (cached) return cached;

  if (scopeMode === "legacy") {
    const legacy = await deps.resolveLegacyHouzzatWorkspace();
    const result: ResolvedWorkspaceHost = legacy
      ? {
          ok: true,
          mode: "legacy",
          workspaceId: legacy.workspaceId,
          workspaceSlug: legacy.workspaceSlug,
          normalizedHostname: hostname,
          verifiedHostname: false,
        }
      : deny(hostname, "workspace_inactive");
    writeHostResolutionCache(scopeMode, hostname, result);
    return result;
  }

  const platformBlock = blocksTenantHostnameResolution(hostname);
  if (platformBlock) {
    const result = deny(hostname, "platform_surface");
    writeHostResolutionCache(scopeMode, hostname, result);
    return result;
  }

  const row = await deps.lookupActiveDomain(hostname);
  if (!row) {
    const result = deny(hostname, "domain_not_found");
    writeHostResolutionCache(scopeMode, hostname, result);
    return result;
  }

  const result = resolveFromDomainRow(row, hostname);
  writeHostResolutionCache(scopeMode, hostname, result);
  return result;
}

export async function resolveWorkspaceFromRequest(
  request: Request,
  deps?: HostResolutionDeps,
): Promise<ResolvedWorkspaceHost> {
  const hostname = extractTrustedRequestHostname(request);
  if (!hostname) {
    if (isTenantDomainScopeWorkspace()) {
      return deny(null, "malformed_hostname");
    }
    return resolveWorkspaceFromHostname("", deps);
  }
  return resolveWorkspaceFromHostname(hostname, deps);
}

/** Test-only */
export { clearHostResolutionCacheForTests };

/** In-memory fixture lookup for selftests — NOT production. */
export function createFixtureHostResolutionDeps(
  rows: DomainLookupRow[],
  legacyHouzzat?: { workspaceId: string; workspaceSlug: string } | null,
): HostResolutionDeps {
  const byHost = new Map(rows.map((r) => [r.hostname, r]));
  return {
    lookupActiveDomain: async (hostname) => byHost.get(hostname) ?? null,
    resolveLegacyHouzzatWorkspace: async () =>
      legacyHouzzat ?? {
        workspaceId: "ws_houzzat_fixture",
        workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
      },
  };
}
