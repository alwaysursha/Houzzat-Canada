/**
 * Stage 3K.5.2 — canonical request-scoped tenancy resolver.
 */
import type {
  WorkspaceDomainKind,
  WorkspaceDomainRole,
} from "@prisma/client";
import type { WorkspaceBrandInternal, WorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import { toWorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import { buildLegacyHouzzatBrand } from "@/lib/tenancy/legacy-houzzat-brand";
import {
  resolveTrustedRequestOrigin,
  type TrustedRequestOriginFailure,
} from "@/lib/tenancy/resolve-trusted-request-origin";
import {
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromRequest,
  type HostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";
import type { HostResolutionDenyReason } from "@/lib/tenancy/host-resolution-types";
import { resolveWorkspaceBrand } from "@/lib/tenancy/resolve-workspace-brand";
import { isTenantBrandingScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";
import type { TenantScopeMode } from "@/lib/tenancy/tenant-scope-flags";

export type RequestTenancyDenyReason =
  | HostResolutionDenyReason
  | TrustedRequestOriginFailure["reason"];

export type RequestTenancySuccess = {
  ok: true;
  hostname: string;
  origin: string;
  workspaceId: string;
  workspaceSlug: string;
  domainKind?: WorkspaceDomainKind;
  domainRole?: WorkspaceDomainRole;
  verifiedHostname: boolean;
  brand: WorkspaceBrandPublic;
  resolutionMode: TenantScopeMode;
};

export type RequestTenancyFailure = {
  ok: false;
  reason: RequestTenancyDenyReason;
  resolutionMode: TenantScopeMode;
  hostname: string | null;
};

export type RequestTenancyResult = RequestTenancySuccess | RequestTenancyFailure;

export type RequestTenancyDeps = HostResolutionDeps & {
  resolveBrand?: (workspaceId: string) => Promise<WorkspaceBrandInternal>;
};

async function defaultResolveBrand(
  workspaceId: string,
): Promise<WorkspaceBrandInternal> {
  return resolveWorkspaceBrand(workspaceId);
}

async function resolveBrandForTenancy(
  workspaceId: string,
  deps: RequestTenancyDeps,
): Promise<WorkspaceBrandPublic> {
  const resolveBrand = deps.resolveBrand ?? defaultResolveBrand;
  if (!isTenantBrandingScopeWorkspace()) {
    return toWorkspaceBrandPublic(buildLegacyHouzzatBrand(workspaceId));
  }
  const brand = await resolveBrand(workspaceId);
  return toWorkspaceBrandPublic(brand);
}

/**
 * Single canonical entry: trusted hostname → workspace → public brand DTO.
 * Request-scoped — no global mutable tenant state.
 */
export async function resolveRequestTenancy(
  request: Request,
  deps?: RequestTenancyDeps,
): Promise<RequestTenancyResult> {
  const hostResult = await resolveWorkspaceFromRequest(request, deps);
  const originResult = resolveTrustedRequestOrigin(request);
  const resolutionMode = hostResult.mode;

  if (!hostResult.ok) {
    return {
      ok: false,
      reason: hostResult.reason,
      resolutionMode: resolutionMode === "legacy" ? "legacy" : "workspace",
      hostname: hostResult.normalizedHostname,
    };
  }

  if (!originResult.ok) {
    return {
      ok: false,
      reason: originResult.reason,
      resolutionMode,
      hostname: hostResult.normalizedHostname,
    };
  }

  const brand = await resolveBrandForTenancy(
    hostResult.workspaceId,
    deps ?? ({} as RequestTenancyDeps),
  );

  return {
    ok: true,
    hostname: hostResult.normalizedHostname,
    origin: originResult.origin,
    workspaceId: hostResult.workspaceId,
    workspaceSlug: hostResult.workspaceSlug,
    domainKind: hostResult.domainKind,
    domainRole: hostResult.domainRole,
    verifiedHostname: hostResult.verifiedHostname,
    brand,
    resolutionMode,
  };
}

export { createFixtureHostResolutionDeps };
