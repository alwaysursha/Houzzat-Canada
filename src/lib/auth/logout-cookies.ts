import { DESK_AGENT_COOKIE } from "@/lib/agent/desk-constants";

/**
 * Auth.js / NextAuth cookie names to expire on hard logout.
 * Shared by `/api/auth/logout` (Workers-safe clear; no Auth.js signOut()).
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
  // Desk selection must not survive into the next login session.
  DESK_AGENT_COOKIE,
] as const;

const AUTH_COOKIE_NAME_RE =
  /^(?:__Secure-|__Host-)?(?:authjs|next-auth)\./i;

const CHUNK_SUFFIX_RE = /^(.+)\.(\d+)$/;

/** Max Auth.js JWT chunk index we clear when any chunk for a base is present. */
const MAX_CHUNK_INDEX = 7;

/**
 * Names to expire on logout. Only emits chunk variants (`.0`…`.7`) when the
 * request already has a chunked cookie for that base — avoids 80+ Set-Cookie
 * headers on every sign-out (Cloudflare / WebView header limits → 502).
 */
export function collectAuthCookieNamesToClear(cookieHeader: string): string[] {
  const names = new Set<string>(ALWAYS_CLEAR);

  for (const part of cookieHeader.split(";")) {
    const name = part.trim().split("=")[0]?.trim();
    if (!name || !AUTH_COOKIE_NAME_RE.test(name)) continue;

    names.add(name);

    const chunk = name.match(CHUNK_SUFFIX_RE);
    if (!chunk) continue;

    const base = chunk[1]!;
    names.add(base);
    for (let i = 0; i <= MAX_CHUNK_INDEX; i += 1) {
      names.add(`${base}.${i}`);
    }
  }

  return [...names];
}

export function authSessionLooksAuthenticated(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const user = (payload as { user?: unknown }).user;
  return Boolean(user && typeof user === "object");
}
