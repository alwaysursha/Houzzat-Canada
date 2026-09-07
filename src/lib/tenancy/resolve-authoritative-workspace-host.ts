/**
 * Stage 6.11G.7C — authoritative tenant hostname → workspace resolver.
 *
 * AUTHORITATIVE TENANT RESOLUTION MUST FAIL CLOSED.
 *
 * This resolver is SECURITY/AUTHORITY only. It never consults legacy/default
 * tenant-domain scope flags, never defaults to Houzzat, and never trusts a
 * client-supplied workspaceId.
 *
 * Legacy/default workspace resolution (compat hostname resolver legacy mode,
 * public-lead Houzzat routing, legacy branding) must never be used for:
 *   - MLS entitlement
 *   - tenant authorization
 *   - workspace-bound security decisions
 *
 * Future MLS entitlement (`resolveWorkspaceListingEntitlement`) must consume
 * this resolver or an equivalently fail-closed trusted workspace identity.
 *
 * This answers only: which ACTIVE workspace authoritatively owns this tenant
 * hostname? It does not answer listing display rights.
 */
import type {
  WorkspaceDomainKind,
  WorkspaceDomainRole,
} from "@prisma/client";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import type { HostResolutionDenyReason } from "@/lib/tenancy/host-resolution-types";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import { blocksTenantHostnameResolution } from "@/lib/tenancy/reserved-domains";
import { lookupActiveWorkspaceDomainRow } from "@/lib/tenancy/workspace-domain-probe";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type AuthoritativeWorkspaceHostDenyReason =
  | HostResolutionDenyReason
  | "missing_hostname";

export type AuthoritativeDomainLookupRow = {
  hostname: string;
  kind: WorkspaceDomainKind;
  role: WorkspaceDomainRole;
  workspaceId: string;
  workspaceSlug: string;
  domainStatus: "ACTIVE" | "PENDING" | "DISABLED";
  workspaceStatus: "ACTIVE" | "TRIAL" | "SUSPENDED" | "CANCELLED";
};

export type AuthoritativeHostResolutionDeps = {
  lookupActiveDomain: (
    hostname: string,
  ) => Promise<AuthoritativeDomainLookupRow | null>;
};

export type AuthoritativeWorkspaceHostSuccess = {
  ok: true;
  workspaceId: string;
  workspaceSlug: string;
  workspaceStatus: "ACTIVE";
  hostname: string;
  domainKind: WorkspaceDomainKind;
  domainRole: WorkspaceDomainRole;
  /** Always true — success implies ACTIVE WorkspaceDomain ownership. */
  verifiedHostname: true;
};

export type AuthoritativeWorkspaceHostFailure = {
  ok: false;
  reason: AuthoritativeWorkspaceHostDenyReason;
  hostname: string | null;
  verifiedHostname: false;
};

export type AuthoritativeWorkspaceHostResult =
  | AuthoritativeWorkspaceHostSuccess
  | AuthoritativeWorkspaceHostFailure;

function deny(
  hostname: string | null,
  reason: AuthoritativeWorkspaceHostDenyReason,
): AuthoritativeWorkspaceHostFailure {
  return {
    ok: false,
    reason,
    hostname,
    verifiedHostname: false,
  };
}

async function defaultLookupActiveDomain(
  hostname: string,
): Promise<AuthoritativeDomainLookupRow | null> {
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

function resolveFromDomainRow(
  row: AuthoritativeDomainLookupRow,
  hostname: string,
): AuthoritativeWorkspaceHostResult {
  if (row.domainStatus !== "ACTIVE") {
    return deny(hostname, "domain_inactive");
  }
  if (row.workspaceStatus === "SUSPENDED") {
    return deny(hostname, "workspace_suspended");
  }
  if (row.workspaceStatus !== "ACTIVE") {
    return deny(hostname, "workspace_inactive");
  }
  return {
    ok: true,
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspaceSlug,
    workspaceStatus: "ACTIVE",
    hostname,
    domainKind: row.kind,
    domainRole: row.role,
    verifiedHostname: true,
  };
}

/**
 * Resolve authoritative workspace ownership from a raw hostname string.
 * Always fail-closed — independent of legacy/default tenant-domain scope flags.
 */
export async function resolveAuthoritativeWorkspaceFromHostname(
  rawHostname: string | null | undefined,
  deps: AuthoritativeHostResolutionDeps = {
    lookupActiveDomain: defaultLookupActiveDomain,
  },
): Promise<AuthoritativeWorkspaceHostResult> {
  if (rawHostname == null || String(rawHostname).trim() === "") {
    return deny(null, "missing_hostname");
  }

  const normalized = normalizeWorkspaceHostname(rawHostname);
  if (!normalized.ok) {
    return deny(null, "malformed_hostname");
  }

  const hostname = normalized.hostname;
  const platformBlock = blocksTenantHostnameResolution(hostname);
  if (platformBlock) {
    return deny(hostname, "platform_surface");
  }

  const row = await deps.lookupActiveDomain(hostname);
  if (!row) {
    return deny(hostname, "domain_not_found");
  }

  return resolveFromDomainRow(row, hostname);
}

/**
 * Resolve authoritative workspace ownership from a trusted request hostname.
 * Client-supplied workspaceId is never consulted.
 */
export async function resolveAuthoritativeWorkspaceFromHost(
  request: Request,
  deps?: AuthoritativeHostResolutionDeps,
): Promise<AuthoritativeWorkspaceHostResult> {
  const hostname = extractTrustedRequestHostname(request);
  if (!hostname) {
    return deny(null, "missing_hostname");
  }
  return resolveAuthoritativeWorkspaceFromHostname(hostname, deps);
}

/** In-memory fixture lookup for selftests — NOT production. */
export function createFixtureAuthoritativeHostDeps(
  rows: AuthoritativeDomainLookupRow[],
): AuthoritativeHostResolutionDeps {
  const byHost = new Map(rows.map((r) => [r.hostname, r]));
  return {
    lookupActiveDomain: async (hostname) => byHost.get(hostname) ?? null,
  };
}
