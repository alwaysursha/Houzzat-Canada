/**
 * Native application shell identity (UX / navigation only).
 *
 * SECURITY: shell identity, the `houzzat_shell` cookie, and the native
 * User-Agent marker are all client-controlled and therefore SPOOFABLE.
 * They must NEVER grant ADMIN/AGENT, bypass middleware/API authorization,
 * or expose restricted data. Server-side roles remain authoritative.
 *
 * The marker only ever *removes* UX (staff dashboards inside the consumer
 * app), so spoofing it can restrict the spoofer but cannot elevate anyone.
 */

export type AppShell = "web" | "houzzat" | "houzzatpro" | "unknown-native";

/** Capacitor `appId` / iOS bundle / Android applicationId. */
export const HOUZZAT_APP_ID = "com.houzzat.app";
/** Reserved for Phase 2 HouzzatPro native shell — do not ship store builds yet. */
export const HOUZZATPRO_APP_ID = "com.houzzat.pro";

/**
 * Server-visible native proof: appended to the WebView User-Agent by the
 * Capacitor shell (`appendUserAgent` in capacitor config).
 *
 * Format: `HouzzatNative/<version> (<appId>)`
 */
export const NATIVE_UA_PRODUCT = "HouzzatNative";
export const NATIVE_UA_VERSION = "1";

export function nativeUserAgentMarker(appId: string): string {
  return `${NATIVE_UA_PRODUCT}/${NATIVE_UA_VERSION} (${appId})`;
}

const NATIVE_UA_PATTERN = new RegExp(
  `${NATIVE_UA_PRODUCT}\\/\\d+\\s*\\(([^)]*)\\)`,
);

/**
 * UX-only cookie. Values: `consumer` | `pro` | `native`.
 * Set by native CapacitorBootstrap; cleared on normal web.
 *
 * Middleware does NOT trust this alone — see `resolveRequestAppShell`.
 */
export const APP_SHELL_COOKIE = "houzzat_shell";

export type AppShellCookieValue = "consumer" | "pro" | "native";

/** Lightweight interstitial when a non-Pro native shell hits staff routes. */
export const OPEN_HOUZZAT_PRO_PATH = "/open-houzzat-pro";

/**
 * HouzzatPro Capacitor cold-start URL (`server.url` + path).
 * Routes signed-in staff into CRM; unsupported roles see the staff-only page.
 */
export const HOUZZATPRO_START_PATH = "/pro";

/** Shown in HouzzatPro when the session role is not ADMIN/AGENT. */
export const HOUZZATPRO_STAFF_ONLY_PATH = "/pro/for-staff";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30d — native WebView only

let cachedShell: AppShell | null = null;
let resolvePromise: Promise<AppShell> | null = null;

export function shellToCookieValue(
  shell: AppShell,
): AppShellCookieValue | null {
  switch (shell) {
    case "houzzat":
      return "consumer";
    case "houzzatpro":
      return "pro";
    case "unknown-native":
      return "native";
    case "web":
      return null;
    default: {
      const _exhaustive: never = shell;
      return _exhaustive;
    }
  }
}

export function cookieValueToShell(
  value: string | null | undefined,
): AppShell | null {
  if (value === "consumer") return "houzzat";
  if (value === "pro") return "houzzatpro";
  if (value === "native") return "unknown-native";
  return null;
}

/** Parse `houzzat_shell` from a raw Cookie header. */
export function readAppShellCookieValue(
  cookieHeader: string | null | undefined,
): AppShellCookieValue | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName !== APP_SHELL_COOKIE) continue;
    const raw = rest.join("=").trim();
    if (raw === "consumer" || raw === "pro" || raw === "native") return raw;
    return null;
  }
  return null;
}

/** App id claimed by the native User-Agent marker, if present. */
export function nativeAppIdFromUserAgent(
  userAgent: string | null | undefined,
): string | null {
  if (!userAgent) return null;
  const match = NATIVE_UA_PATTERN.exec(userAgent);
  if (!match) return null;
  return match[1]?.trim() || "";
}

export function mapNativeAppId(appId: string | null | undefined): AppShell {
  if (appId === HOUZZAT_APP_ID) return "houzzat";
  if (appId === HOUZZATPRO_APP_ID) return "houzzatpro";
  // Native but unrecognized — never assume Pro.
  return "unknown-native";
}

/**
 * Server-side shell for UX decisions.
 *
 * The native UA marker is the only accepted proof of a native shell, so a
 * stale or hand-crafted `houzzat_shell` cookie in an ordinary browser can
 * never take Admin/Agent web routes away from a legitimate staff user.
 * The cookie is used only to refine which native shell is running.
 */
export function resolveRequestAppShell(input: {
  userAgent: string | null | undefined;
  cookieValue: string | null | undefined;
}): AppShell {
  const claimedAppId = nativeAppIdFromUserAgent(input.userAgent);
  if (claimedAppId == null) return "web";

  const fromUa = mapNativeAppId(claimedAppId);
  if (fromUa !== "unknown-native") return fromUa;

  // Marker present but app id unrecognized: allow the cookie to narrow it,
  // and never let that resolve to Pro.
  const fromCookie = cookieValueToShell(input.cookieValue);
  if (fromCookie === "houzzat") return "houzzat";
  return "unknown-native";
}

/** Native shells that must not render Admin Control / Agent CRM. */
export function shouldGateStaffRoutesForConsumerShell(
  shell: AppShell | null,
): boolean {
  return shell === "houzzat" || shell === "unknown-native";
}

/**
 * Staff `/account` → CRM redirect.
 * - web: yes (unchanged website behavior)
 * - houzzatpro: yes (Phase 2 startup routing builds on this)
 * - houzzat / unknown-native: no (never dump staff into CRM in a consumer shell)
 */
export function shouldRedirectStaffAccountToCrm(
  shell: AppShell | null,
): boolean {
  return !shouldGateStaffRoutesForConsumerShell(shell);
}

export function isStaffAppPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/agent");
}

/** Sync cache after resolve (null until first client resolve). */
export function getCachedAppShell(): AppShell | null {
  return cachedShell;
}

/**
 * Resolve shell once per JS context. Safe on server (always `"web"`).
 * Does not hit Neon/API.
 */
export async function resolveAppShell(): Promise<AppShell> {
  if (cachedShell) return cachedShell;
  if (typeof window === "undefined") {
    cachedShell = "web";
    return cachedShell;
  }
  if (resolvePromise) return resolvePromise;

  resolvePromise = (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        cachedShell = "web";
        return cachedShell;
      }
      try {
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        cachedShell = mapNativeAppId(info.id);
      } catch {
        // Native but identity unavailable — conservative, never Pro.
        cachedShell = "unknown-native";
      }
      return cachedShell;
    } catch {
      cachedShell = "web";
      return cachedShell;
    }
  })();

  return resolvePromise;
}

function shellCookieAttributes(maxAge: number): string {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  return `Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** Write or clear the UX-only shell cookie (browser only). */
export function syncAppShellCookie(shell: AppShell): void {
  if (typeof document === "undefined") return;
  const value = shellToCookieValue(shell);
  if (!value) {
    document.cookie = `${APP_SHELL_COOKIE}=; ${shellCookieAttributes(0)}`;
    return;
  }
  document.cookie = `${APP_SHELL_COOKIE}=${value}; ${shellCookieAttributes(COOKIE_MAX_AGE_SECONDS)}`;
}

/**
 * Web must not keep a stale consumer/pro hint from DevTools or a prior session.
 * Call on every client bootstrap when not native.
 */
export function clearAppShellCookieOnWeb(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${APP_SHELL_COOKIE}=; ${shellCookieAttributes(0)}`;
}
