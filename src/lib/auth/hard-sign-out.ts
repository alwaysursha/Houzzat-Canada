/**
 * Client hard sign-out that matches desktop Auth.js cookie clearing on
 * Capacitor Android WebView.
 *
 * Android WebView often ignores Set-Cookie on 3xx redirects. Prefer POST
 * (200 + Set-Cookie), verify `/api/auth/session` is empty, then hard-navigate.
 * If the session is still present, repeat via GET fetch (never navigate the
 * WebView to `/api/auth/logout` — that surfaces a raw API page / 502).
 *
 * Stage 3K.5.10.9: HouzzatPRO completes logout by clearing the current host,
 * then navigating to app.houzzatpro.com/api/auth/logout (GET) so the platform
 * session is cleared too — without widening cookie Domain.
 */

import {
  isSafeSignOutDestination,
  resolveCompleteSignOutDestination,
  WEB_SIGNED_OUT_HOME_PATH,
} from "@/lib/auth/complete-pro-logout";
import { authSessionLooksAuthenticated } from "@/lib/auth/logout-cookies";
import { markManualSignInRequired } from "@/lib/auth/remembered-login";
import { resolveAppShell } from "@/lib/mobile/app-shell";

export type HardSignOutResult = {
  sessionCleared: boolean;
  destination: string;
};

async function resolveDestination(options?: {
  destination?: string;
  isStaff?: boolean;
}): Promise<string> {
  if (options?.destination && isSafeSignOutDestination(options.destination)) {
    return options.destination;
  }
  try {
    const shell = await resolveAppShell();
    return resolveCompleteSignOutDestination({
      hostname:
        typeof window !== "undefined" ? window.location.hostname : "",
      pathname:
        typeof window !== "undefined" ? window.location.pathname : "",
      shell,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      isStaff: options?.isStaff,
    });
  } catch {
    return WEB_SIGNED_OUT_HOME_PATH;
  }
}

export async function fetchAuthSessionUser(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return false;
    const data: unknown = await res.json();
    return authSessionLooksAuthenticated(data);
  } catch {
    return false;
  }
}

async function postLogoutClear(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    // network blip — still attempt navigation
  }
}

/** GET clear via fetch so Set-Cookie applies without loading the API URL as a page. */
async function getLogoutClearFetch(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // ignore
  }
}

/**
 * Clear Auth.js cookies via POST, confirm session is gone, hard-navigate.
 * Never throws for navigation — callers should not catch around the assign.
 */
export async function performHardSignOut(options?: {
  destination?: string;
  isStaff?: boolean;
}): Promise<HardSignOutResult> {
  const destination = await resolveDestination(options);

  // Require an explicit Sign in click on the next visit (no silent auto-login).
  try {
    markManualSignInRequired();
  } catch {
    // ignore
  }

  // Clear cookies on the *current* host (tenant or platform).
  await postLogoutClear();

  let stillAuthed = await fetchAuthSessionUser();
  if (stillAuthed) {
    await getLogoutClearFetch();
    stillAuthed = await fetchAuthSessionUser();
  }

  // Pro on tenant → absolute platform /api/auth/logout (GET clears platform + lands on sign-in).
  // Web → tenant homepage. Platform host → /pro/sign-in?signedOut=1.
  window.location.assign(destination);
  return { sessionCleared: !stillAuthed, destination };
}
