/**
 * Stage 3K.4.2 — deterministic HouzzatPro platform tenant hostnames.
 * Pattern: {workspace-slug}.houzzatpro.com (system-assigned, not client-chosen).
 */
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";

export const HOUZZATPRO_PLATFORM_ZONE = "houzzatpro.com";

/**
 * Neutral HouzzatPRO application bootstrap host (Stage 3K.5.10.6).
 * Distinct from sales apex houzzatpro.com / www.houzzatpro.com.
 */
export const HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME = "app.houzzatpro.com";
export const HOUZZATPRO_APP_BOOTSTRAP_ORIGIN = `https://${HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME}`;

/** Slugs that must never become platform tenant hostnames. */
export const RESERVED_PLATFORM_WORKSPACE_SLUGS = [
  "www",
  "api",
  "admin",
  "app",
  "billing",
  "mail",
  "status",
  "support",
  "help",
  "docs",
  "cdn",
  "static",
  "assets",
] as const;

const WORKSPACE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type PlatformHostnameResult =
  | { ok: true; hostname: string; slug: string }
  | { ok: false; error: string };

function normalizeSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!slug || !WORKSPACE_SLUG_RE.test(slug)) return null;
  if (
    (RESERVED_PLATFORM_WORKSPACE_SLUGS as readonly string[]).includes(slug)
  ) {
    return null;
  }
  return slug;
}

/** Derive canonical platform hostname from workspace slug. */
export function platformHostnameForWorkspaceSlug(
  rawSlug: string,
): PlatformHostnameResult {
  const slug = normalizeSlug(rawSlug);
  if (!slug) {
    return { ok: false, error: "invalid or reserved workspace slug" };
  }
  const hostname = `${slug}.${HOUZZATPRO_PLATFORM_ZONE}`;
  const normalized = normalizeWorkspaceHostname(hostname);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }
  return { ok: true, hostname: normalized.hostname, slug };
}

/** Parse `{slug}.houzzatpro.com` — returns slug only (no workspace trust). */
export function parsePlatformTenantHostname(
  rawHostname: string,
): { slug: string; hostname: string } | null {
  const normalized = normalizeWorkspaceHostname(rawHostname);
  if (!normalized.ok) return null;
  const hostname = normalized.hostname;
  const suffix = `.${HOUZZATPRO_PLATFORM_ZONE}`;
  if (!hostname.endsWith(suffix) || hostname === HOUZZATPRO_PLATFORM_ZONE) {
    return null;
  }
  const slugPart = hostname.slice(0, -suffix.length);
  const slug = normalizeSlug(slugPart);
  if (!slug) return null;
  const expected = platformHostnameForWorkspaceSlug(slug);
  if (!expected.ok || expected.hostname !== hostname) return null;
  return { slug, hostname };
}

export function isHouzzatProPlatformRoot(rawHostname: string): boolean {
  const normalized = normalizeWorkspaceHostname(rawHostname);
  if (!normalized.ok) return false;
  return (
    normalized.hostname === HOUZZATPRO_PLATFORM_ZONE ||
    normalized.hostname === `www.${HOUZZATPRO_PLATFORM_ZONE}`
  );
}

/** Application bootstrap host — auth, workspace discovery, handoff mint. */
export function isHouzzatProAppBootstrapHost(
  rawHostname: string | null | undefined,
): boolean {
  if (!rawHostname) return false;
  const normalized = normalizeWorkspaceHostname(rawHostname);
  if (!normalized.ok) return false;
  return normalized.hostname === HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME;
}

export function isPlatformTenantHostname(rawHostname: string): boolean {
  return parsePlatformTenantHostname(rawHostname) !== null;
}
