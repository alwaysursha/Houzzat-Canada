import { NextResponse } from "next/server";

/**
 * Hard logout for Cloudflare Workers / OpenNext.
 *
 * Do NOT call Auth.js `signOut()` here: on Workers it often emits a blank
 * Set-Cookie then a refreshed session cookie; Chrome keeps the last one, so
 * the user stays signed in.
 *
 * Only clear cookies that are actually on the request (plus a tiny always-clear
 * set). Pre-emitting hundreds of chunk variants blows CF header limits → 502.
 */

const ALWAYS_CLEAR = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "__Secure-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
] as const;

const AUTH_COOKIE_NAME_RE =
  /^(?:__Secure-|__Host-)?(?:authjs|next-auth)\./i;

function collectCookieNames(request: Request): string[] {
  const names = new Set<string>(ALWAYS_CLEAR);

  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const name = part.trim().split("=")[0]?.trim();
    if (name && AUTH_COOKIE_NAME_RE.test(name)) {
      names.add(name);
    }
  }

  return [...names];
}

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

function clearedRedirect(request: Request) {
  const url = new URL(request.url);
  const dest = new URL("/", url.origin);
  dest.searchParams.set("signedOut", "1");
  const response = NextResponse.redirect(dest, 303);
  for (const name of collectCookieNames(request)) {
    expireCookie(response, name);
  }
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

function clearedJson(request: Request) {
  const response = NextResponse.json({ ok: true });
  for (const name of collectCookieNames(request)) {
    expireCookie(response, name);
  }
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

/** Prefer this from the browser — Set-Cookie applies on the redirect response. */
export async function GET(request: Request) {
  return clearedRedirect(request);
}

export async function POST(request: Request) {
  return clearedJson(request);
}
