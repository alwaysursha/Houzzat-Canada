/**
 * Client hard sign-out that matches desktop Auth.js cookie clearing on
 * Capacitor Android WebView.
 *
 * Android WebView often ignores Set-Cookie on 3xx redirects. Prefer POST
 * (200 + Set-Cookie), verify `/api/auth/session` is empty, then hard-navigate.
 * If the session is still present, fall back to GET `/api/auth/logout` (200 HTML
 * clear + client redirect).
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

/**
 * Clear Auth.js cookies via POST, confirm session is gone, hard-navigate.
 * Never throws for navigation — callers should not catch around the assign.
 */
export async function performHardSignOut(options?: {
  destination?: string;
}): Promise<HardSignOutResult> {
  let destination = options?.destination ?? defaultDestinationFromUa();

  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      try {
        const body = (await res.json()) as { destination?: string };
        if (
          typeof body.destination === "string" &&
          body.destination.startsWith("/")
        ) {
          destination = body.destination;
        }
      } catch {
        // ignore body parse
      }
    }
  } catch {
    // Network blip — still try verify + GET fallback
  }

  const stillAuthed = await fetchAuthSessionUser();
  if (stillAuthed) {
    // WebView-safe HTML clear path (Set-Cookie on 200, then location.replace).
    window.location.assign("/api/auth/logout");
    return { sessionCleared: false, destination: "/api/auth/logout" };
  }

  window.location.assign(destination);
  return { sessionCleared: true, destination };
}
