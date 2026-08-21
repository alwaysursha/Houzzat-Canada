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
] as const;

const AUTH_COOKIE_NAME_RE =
  /^(?:__Secure-|__Host-)?(?:authjs|next-auth)\./i;

export function collectAuthCookieNamesToClear(cookieHeader: string): string[] {
  const names = new Set<string>(ALWAYS_CLEAR);

  // Auth.js may chunk large JWTs as `.0`, `.1`, …
  for (const base of ALWAYS_CLEAR) {
    for (let i = 0; i < 8; i += 1) {
      names.add(`${base}.${i}`);
    }
  }

  for (const part of cookieHeader.split(";")) {
    const name = part.trim().split("=")[0]?.trim();
    if (name && AUTH_COOKIE_NAME_RE.test(name)) {
      names.add(name);
    }
  }

  return [...names];
}

export function authSessionLooksAuthenticated(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const user = (payload as { user?: unknown }).user;
  return Boolean(user && typeof user === "object");
}
