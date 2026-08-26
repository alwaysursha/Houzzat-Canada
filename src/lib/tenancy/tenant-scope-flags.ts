/**
 * Stage 3K.2 — tenant domain/branding feature flags (default: legacy/off).
 */
export type TenantScopeMode = "legacy" | "workspace";
export type TenantAdminHostLock = "off" | "on";

function parseLegacyWorkspaceFlag(
  envKey: string,
  fallback: TenantScopeMode = "legacy",
): TenantScopeMode {
  const flag = process.env[envKey]?.trim().toLowerCase();
  if (flag === "workspace") return "workspace";
  if (flag === "legacy") return "legacy";
  return fallback;
}

export function parseTenantBrandingScope(): TenantScopeMode {
  return parseLegacyWorkspaceFlag("TENANT_BRANDING_SCOPE");
}

export function parseTenantDomainScope(): TenantScopeMode {
  return parseLegacyWorkspaceFlag("TENANT_DOMAIN_SCOPE");
}

export function parseTenantPublicLeadScope(): TenantScopeMode {
  return parseLegacyWorkspaceFlag("TENANT_PUBLIC_LEAD_SCOPE");
}

export function parseTenantAdminHostLock(): TenantAdminHostLock {
  const flag = process.env.TENANT_ADMIN_HOST_LOCK?.trim().toLowerCase();
  if (flag === "on") return "on";
  return "off";
}

export function isTenantBrandingScopeWorkspace(): boolean {
  return parseTenantBrandingScope() === "workspace";
}

export function isTenantDomainScopeWorkspace(): boolean {
  return parseTenantDomainScope() === "workspace";
}

export function isTenantPublicLeadScopeWorkspace(): boolean {
  return parseTenantPublicLeadScope() === "workspace";
}

export function isTenantAdminHostLockOn(): boolean {
  return parseTenantAdminHostLock() === "on";
}
