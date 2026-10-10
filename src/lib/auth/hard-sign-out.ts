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

import { signOut } from "next-auth/react";
import { clearAccountLocalBrowseCaches } from "@/lib/auth/account-local-cleanup";
import {
  isSafeSignOutDestination,
  resolveCompleteSignOutDestination,
  WEB_SIGNED_OUT_HOME_PATH,
} from "@/lib/auth/complete-pro-logout";
import { isHouzzatVercelTestHost } from "@/lib/auth/pro-sign-in-routing";
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

/** Auth.js official sign-out (POST /api/auth/signout). Vercel test host only. */
async function authJsSignOutClear(): Promise<void> {
  try {
    await signOut({ redirect: false });
  } catch {
    // ignore — custom /api/auth/logout remains the Workers path
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
 * Vercel (incl. production) needs Auth.js signOut to drop the JWT session.
 * Cloudflare Workers must not call Auth.js signOut — it re-issues the cookie.
 * NEXT_PUBLIC_IS_VERCEL is set at build time from process.env.VERCEL.
 */
function shouldUseAuthJsSignOut(): boolean {
  if (
    typeof window !== "undefined" &&
    isHouzzatVercelTestHost(window.location.hostname)
  ) {
    return true;
  }
  return process.env.NEXT_PUBLIC_IS_VERCEL === "1";
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

  const useAuthJs = shouldUseAuthJsSignOut();

  if (useAuthJs) {
    // Auth.js POST /api/auth/signout while CSRF cookie still exists.
    // Custom expire-only Set-Cookie alone is unreliable on Vercel JWT sessions.
    // Cloudflare Workers must not call this (re-issues the session cookie).
    await authJsSignOutClear();
  }

  // Clear cookies BEFORE local browse cleanup. Clearing Active/Recent search
  // emits events that can trigger in-flight /api/account/browse-state calls;
  // Auth.js middleware may refresh the session cookie on those responses and
  // undo a later logout clear.
  await postLogoutClear();

  // Drop prior-account / guest browse caches (invalidates sync + cancels pushes).
  // Does not run during signup resume — only explicit sign-out.
  try {
    clearAccountLocalBrowseCaches();
  } catch {
    // ignore
  }

  // Second clear covers any Set-Cookie refresh that raced with the first clear.
  await postLogoutClear();

  let stillAuthed = await fetchAuthSessionUser();
  if (stillAuthed) {
    if (useAuthJs) {
      await authJsSignOutClear();
    }
    await getLogoutClearFetch();
    stillAuthed = await fetchAuthSessionUser();
  }

  if (useAuthJs && stillAuthed) {
    window.location.assign(
      "/api/auth/signout?callbackUrl=%2Fpro%2Fsign-in%3FsignedOut%3D1",
    );
    return { sessionCleared: false, destination };
  }

  // Pro on tenant → absolute platform /api/auth/logout (GET clears platform + lands on sign-in).
  // Web → tenant homepage. Platform host → /pro/sign-in?signedOut=1.
  window.location.assign(destination);
  return { sessionCleared: !stillAuthed, destination };
}
