import { NextResponse } from "next/server";
import {
  isSafeSignOutReturnUrl,
  PRO_SIGNED_OUT_SIGN_IN_PATH,
  resolveCompleteSignOutDestination,
  WEB_SIGNED_OUT_HOME_PATH,
} from "@/lib/auth/complete-pro-logout";
import { collectAuthCookieNamesToClear } from "@/lib/auth/logout-cookies";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";

/**
 * Hard logout for Cloudflare Workers / OpenNext + Capacitor WebView.
 *
 * Do NOT call Auth.js `signOut()` here: on Workers it often emits a blank
 * Set-Cookie then a refreshed session cookie; Chrome keeps the last one, so
 * the user stays signed in.
 *
 * Do NOT 303-redirect with Set-Cookie: Android System WebView frequently
 * drops Set-Cookie on redirect responses, so Cap apps stay signed in while
 * desktop Chrome clears correctly. Serve 200 HTML (cookies expire here),
 * then client-navigate to the signed-out destination.
 *
 * Only clear cookies present on the request (plus a tiny always-clear set).
 * Pre-emitting hundreds of chunk variants blows CF header limits → 502.
 *
 * Stage 3K.5.10.10: clears THIS host only. Complete Pro logout is a two-step
 * client navigation (tenant clear → app.houzzatpro.com/api/auth/logout GET
 * with optional safe returnTo redirect).
 */

function expireCookie(response: NextResponse, name: string) {
  const isHost = name.startsWith("__Host-");
  const secure =
    isHost ||
    name.startsWith("__Secure-") ||
    process.env.NODE_ENV === "production";

  response.cookies.set({
    name,
    value: "",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: isHost || secure,
  });
}

function applyClears(response: NextResponse, request: Request) {
  const header = request.headers.get("cookie") ?? "";
  for (const name of collectAuthCookieNamesToClear(header)) {
    expireCookie(response, name);
  }
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
}

function signOutDestination(request: Request): string {
  const hostname = extractTrustedRequestHostname(request);
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo");

  if (returnTo && isSafeSignOutReturnUrl(returnTo)) {
    return returnTo;
  }

  const dest = resolveCompleteSignOutDestination({
    hostname,
    userAgent: request.headers.get("user-agent"),
  });
  // GET HTML on the platform host must land on local sign-in (not recurse).
  if (dest.includes("/api/auth/logout")) {
    return PRO_SIGNED_OUT_SIGN_IN_PATH;
  }
  return dest || WEB_SIGNED_OUT_HOME_PATH;
}

function clearedHtml(request: Request) {
  const destPath = signOutDestination(request);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="refresh" content="0;url=${destPath}"/><title>Signing out</title><script>location.replace(${JSON.stringify(destPath)});</script></head><body>Signing out…</body></html>`;
  const response = new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
  applyClears(response, request);
  return response;
}

function clearedJson(request: Request) {
  const hostname = extractTrustedRequestHostname(request);
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo");
  let destination: string;
  if (returnTo && isSafeSignOutReturnUrl(returnTo)) {
    destination = returnTo;
  } else {
    destination = resolveCompleteSignOutDestination({
      hostname,
      userAgent: request.headers.get("user-agent"),
    });
  }
  const response = NextResponse.json({
    ok: true,
    destination,
  });
  applyClears(response, request);
  return response;
}

/**
 * Browser / WebView navigation target.
 * Returns 200 + Set-Cookie clears, then client-side redirect (WebView-safe).
 */
export async function GET(request: Request) {
  return clearedHtml(request);
}

/** Used by client hard-sign-out: apply clears without following a redirect. */
export async function POST(request: Request) {
  return clearedJson(request);
}
