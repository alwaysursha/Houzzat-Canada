/**
 * Stage 3K.4.2 — platform/reserved hostname policy.
 */
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import {
  HOUZZATPRO_PLATFORM_ZONE,
  isHouzzatProPlatformRoot,
  isPlatformTenantHostname,
  parsePlatformTenantHostname,
  platformHostnameForWorkspaceSlug,
} from "@/lib/tenancy/platform-hostname";

/** Exact hostnames reserved for HouzzatPro SaaS root (marketing/billing). */
export const HOUZZATPRO_PLATFORM_ROOT_HOSTNAMES = [
  "houzzatpro.com",
  "www.houzzatpro.com",
] as const;

/** Houzzat tenant #1 custom domains (seeded via trusted migration only). */
export const HOUZZAT_TENANT_HOSTNAMES = [
  "houzzat.com",
  "www.houzzat.com",
] as const;

/** Suffixes for dev infrastructure — never tenant-owned. */
export const RESERVED_HOSTNAME_SUFFIXES = [
  ".workers.dev",
  ".pages.dev",
  ".trycloudflare.com",
] as const;

export type ReservedHostnameReason =
  | "platform_houzzatpro_root"
  | "platform_houzzat_tenant"
  | "platform_infrastructure"
  | "platform_hostname_slug_mismatch";

export type ReservedHostnameCheck = {
  reserved: boolean;
  reason?: ReservedHostnameReason;
};

export type AssertHostnameClaimableInput = {
  hostname: string;
  kind?: "PLATFORM" | "CUSTOM";
  workspaceSlug?: string;
  /** Trusted Houzzat Tenant #1 migration may claim houzzat.com. */
  trustedHouzzatMigration?: boolean;
  /** Trusted platform seed may claim {slug}.houzzatpro.com for matching slug. */
  trustedPlatformSeed?: boolean;
};

function normalizeOrNull(raw: string): string | null {
  const result = normalizeWorkspaceHostname(raw);
  return result.ok ? result.hostname : null;
}

export function isReservedPlatformHostname(
  rawHostname: string,
): ReservedHostnameCheck {
  const hostname = normalizeOrNull(rawHostname);
  if (!hostname) return { reserved: false };

  if (isHouzzatProPlatformRoot(hostname)) {
    return { reserved: true, reason: "platform_houzzatpro_root" };
  }

  if ((HOUZZAT_TENANT_HOSTNAMES as readonly string[]).includes(hostname)) {
    return { reserved: true, reason: "platform_houzzat_tenant" };
  }

  for (const suffix of RESERVED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix) || hostname === suffix.slice(1)) {
      return { reserved: true, reason: "platform_infrastructure" };
    }
  }

  return { reserved: false };
}

/**
 * Hostnames blocked before DB lookup (platform root + infra only).
 * *.houzzatpro.com tenant hostnames resolve ONLY via exact WorkspaceDomain row.
 */
export function blocksTenantHostnameResolution(
  rawHostname: string,
): ReservedHostnameReason | null {
  const hostname = normalizeOrNull(rawHostname);
  if (!hostname) return null;

  if (isHouzzatProPlatformRoot(hostname)) {
    return "platform_houzzatpro_root";
  }

  for (const suffix of RESERVED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix) || hostname === suffix.slice(1)) {
      return "platform_infrastructure";
    }
  }

  return null;
}

/**
 * Returns an error when a hostname cannot be claimed via tenant provisioning.
 */
export function assertHostnameClaimable(
  input: AssertHostnameClaimableInput,
): string | null {
  const hostname = normalizeOrNull(input.hostname);
  if (!hostname) return "invalid hostname";

  const platformParsed = parsePlatformTenantHostname(hostname);
  if (platformParsed) {
    if (input.kind === "CUSTOM") {
      return "platform tenant hostnames cannot be claimed as custom domains";
    }
    if (input.trustedPlatformSeed && input.workspaceSlug) {
      const expected = platformHostnameForWorkspaceSlug(input.workspaceSlug);
      if (expected.ok && expected.hostname === hostname) {
        return null;
      }
      return "platform hostname slug mismatch";
    }
    return "platform tenant hostnames require trusted platform seed";
  }

  if (isPlatformTenantHostname(hostname)) {
    return "invalid platform tenant hostname";
  }

  if (hostname.endsWith(`.${HOUZZATPRO_PLATFORM_ZONE}`)) {
    return "unknown houzzatpro.com subdomain";
  }

  const check = isReservedPlatformHostname(hostname);
  if (!check.reserved) return null;

  if (
    check.reason === "platform_houzzat_tenant" &&
    input.trustedHouzzatMigration
  ) {
    return null;
  }

  if (check.reason === "platform_houzzat_tenant") {
    return "hostname reserved for Houzzat tenant #1 migration";
  }
  if (check.reason === "platform_houzzatpro_root") {
    return "hostname reserved for HouzzatPro platform root";
  }
  return "hostname reserved for platform infrastructure";
}

/** Validate PLATFORM row hostname matches workspace slug derivation. */
export function assertPlatformDomainMatchesSlug(input: {
  hostname: string;
  workspaceSlug: string;
}): string | null {
  const expected = platformHostnameForWorkspaceSlug(input.workspaceSlug);
  if (!expected.ok) return expected.error;
  const hostname = normalizeOrNull(input.hostname);
  if (!hostname || hostname !== expected.hostname) {
    return "platform hostname does not match workspace slug";
  }
  return null;
}

export {
  HOUZZATPRO_PLATFORM_ZONE,
  isHouzzatProPlatformRoot,
  isPlatformTenantHostname,
  parsePlatformTenantHostname,
};
