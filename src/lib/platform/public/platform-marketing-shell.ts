/**
 * V1 — platform-root marketing shell paths (houzzatpro.com / www only).
 * Does not grant tenant authority. Layout chrome-bypass only for these paths.
 */

import { headers } from "next/headers";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

export const PLATFORM_MARKETING_HOME_PATH = "/" as const;
export const PLATFORM_MARKETING_TERMS_PATH = "/terms" as const;
export const PLATFORM_MARKETING_PRIVACY_PATH = "/privacy" as const;

/** Paths that render under the HouzzatPRO SaaS marketing shell on platform root. */
export const PLATFORM_MARKETING_SHELL_PATHS = [
  PLATFORM_MARKETING_HOME_PATH,
  PLATFORM_MARKETING_TERMS_PATH,
  PLATFORM_MARKETING_PRIVACY_PATH,
] as const;

export type PlatformMarketingShellPath =
  (typeof PLATFORM_MARKETING_SHELL_PATHS)[number];

export function normalizeRequestPathname(raw: string): string {
  if (!raw) return "";
  const path = raw.startsWith("http")
    ? (() => {
        try {
          return new URL(raw).pathname;
        } catch {
          return raw;
        }
      })()
    : raw;
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1) || "/";
  }
  return path || "/";
}

export function isPlatformMarketingShellPath(
  path: string,
): path is PlatformMarketingShellPath {
  const normalized = normalizeRequestPathname(path);
  return (PLATFORM_MARKETING_SHELL_PATHS as readonly string[]).includes(
    normalized,
  );
}

export function isPlatformMarketingHomePath(path: string): boolean {
  return normalizeRequestPathname(path) === PLATFORM_MARKETING_HOME_PATH;
}

/** Pure host+path gate — safe for selftests (no headers). */
export function matchesHouzzatProPlatformMarketingShell(input: {
  hostname: string;
  pathname: string;
}): boolean {
  return (
    isHouzzatProPlatformRoot(input.hostname) &&
    isPlatformMarketingShellPath(input.pathname)
  );
}

export function matchesHouzzatProPlatformHome(input: {
  hostname: string;
  pathname: string;
}): boolean {
  return (
    isHouzzatProPlatformRoot(input.hostname) &&
    isPlatformMarketingHomePath(input.pathname)
  );
}

async function readRequestPathAndHost(): Promise<{
  path: string;
  host: string | null;
}> {
  const headerStore = await headers();
  const pathname =
    headerStore.get("x-houzzat-request-path") ??
    headerStore.get("next-url") ??
    "";
  const path = normalizeRequestPathname(pathname);
  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    null;
  return { path, host };
}

/**
 * True when request is HouzzatPRO platform-root / , /terms, or /privacy.
 * Tenant hosts must not use this chrome-free SaaS shell.
 */
export async function isHouzzatProPlatformMarketingShellRequest(): Promise<boolean> {
  const { path, host } = await readRequestPathAndHost();
  if (!host) return false;
  return matchesHouzzatProPlatformMarketingShell({
    hostname: host,
    pathname: path,
  });
}

/** True when request is HouzzatPRO platform-root homepage. */
export async function isHouzzatProPlatformHomeRequest(): Promise<boolean> {
  const { path, host } = await readRequestPathAndHost();
  if (!host) return false;
  return matchesHouzzatProPlatformHome({
    hostname: host,
    pathname: path,
  });
}
