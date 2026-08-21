import { NextResponse } from "next/server";
import { collectAuthCookieNamesToClear } from "@/lib/auth/logout-cookies";
import {
  HOUZZATPRO_APP_ID,
  nativeAppIdFromUserAgent,
} from "@/lib/mobile/app-shell";

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

function signOutDestinationPath(request: Request): string {
  const ua = request.headers.get("user-agent");
  const appId = nativeAppIdFromUserAgent(ua);
  const path = appId === HOUZZATPRO_APP_ID ? "/pro/sign-in" : "/";
  const dest = new URL(path, "https://houzzat.local");
  dest.searchParams.set("signedOut", "1");
  return `${dest.pathname}${dest.search}`;
}

function clearedHtml(request: Request) {
  const destPath = signOutDestinationPath(request);
  // Destination is always same-origin path we control (no user input).
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
  const response = NextResponse.json({
    ok: true,
    destination: signOutDestinationPath(request),
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
