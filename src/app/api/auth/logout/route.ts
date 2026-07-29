import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

/**
 * Auth.js cookie names used across local + production (Secure / Host prefixes).
 * Clearing all variants avoids stale sessions after domain switches
 * (workers.dev → houzzat.com) or CSRF failures on client signOut.
 */
const AUTH_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "__Secure-authjs.csrf-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "authjs.pkce.code_verifier",
  "__Secure-authjs.pkce.code_verifier",
  "authjs.state",
  "__Secure-authjs.state",
  "authjs.nonce",
  "__Secure-authjs.nonce",
] as const;

function expireCookie(
  response: NextResponse,
  name: string,
  secure: boolean,
) {
  const isHost = name.startsWith("__Host-");
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

export async function POST() {
  const secure = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ ok: true });

  try {
    await signOut({ redirect: false });
  } catch {
    // Still clear cookies below even if Auth.js signOut throws.
  }

  for (const name of AUTH_COOKIE_NAMES) {
    expireCookie(response, name, secure);
  }

  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Allow GET for simple browser navigation fallbacks. */
export async function GET() {
  return POST();
}
