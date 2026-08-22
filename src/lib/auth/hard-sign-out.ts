/**
 * Client hard sign-out that matches desktop Auth.js cookie clearing on
 * Capacitor Android WebView.
 *
 * Android WebView often ignores Set-Cookie on 3xx redirects. Prefer POST
 * (200 + Set-Cookie), verify `/api/auth/session` is empty, then hard-navigate.
 * If the session is still present, repeat via GET fetch (never navigate the
 * WebView to `/api/auth/logout` — that surfaces a raw API page / 502).
 */

import { authSessionLooksAuthenticated } from "@/lib/auth/logout-cookies";

export type HardSignOutResult = {
  sessionCleared: boolean;
  destination: string;
};

function defaultDestinationFromUa(): string {
  if (
    typeof navigator !== "undefined" &&
    /com\.houzzat\.pro/i.test(navigator.userAgent)
  ) {
    return "/pro/sign-in?signedOut=1";
  }
  return "/?signedOut=1";
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

async function postLogoutClear(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    try {
      const body = (await res.json()) as { destination?: string };
      if (
        typeof body.destination === "string" &&
        body.destination.startsWith("/")
      ) {
        return body.destination;
      }
    } catch {
      // ignore body parse
    }
  } catch {
    // network blip
  }
  return null;
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
}): Promise<HardSignOutResult> {
  let destination = options?.destination ?? defaultDestinationFromUa();

  const fromPost = await postLogoutClear();
  if (fromPost) destination = fromPost;

  let stillAuthed = await fetchAuthSessionUser();
  if (stillAuthed) {
    await getLogoutClearFetch();
    stillAuthed = await fetchAuthSessionUser();
  }

  // Always leave the API route — land on the signed-out shell even if WebView
  // was stubborn about cookie clears (user can retry sign-in).
  window.location.assign(destination);
  return { sessionCleared: !stillAuthed, destination };
}
