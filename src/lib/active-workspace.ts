/**
 * Stage 3H — server-trusted active Workspace selection (signed httpOnly cookie).
 * Client-provided workspaceId is never authoritative without membership validation.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ACTIVE_WORKSPACE_COOKIE = "houzzat_active_workspace";
const SEP = ".";
/** CUID / cuid2 / uuid-ish ids only — rejects injection of separator or PII. */
const WORKSPACE_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[active-workspace] AUTH_SECRET required in production");
    }
    return "dev-insecure-active-workspace-secret";
  }
  return secret;
}

export function isValidWorkspaceIdShape(workspaceId: string): boolean {
  return WORKSPACE_ID_RE.test(workspaceId);
}

export function signActiveWorkspaceId(workspaceId: string): string {
  if (!isValidWorkspaceIdShape(workspaceId)) {
    throw new Error("[active-workspace] invalid workspaceId shape");
  }
  const sig = createHmac("sha256", signingSecret())
    .update(workspaceId)
    .digest("base64url");
  return `${workspaceId}${SEP}${sig}`;
}

export function verifySignedActiveWorkspaceCookie(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const sepIndex = value.lastIndexOf(SEP);
  if (sepIndex <= 0) return null;
  const workspaceId = value.slice(0, sepIndex);
  const sig = value.slice(sepIndex + 1);
  if (!workspaceId || !sig) return null;
  if (!isValidWorkspaceIdShape(workspaceId)) return null;

  const expected = createHmac("sha256", signingSecret())
    .update(workspaceId)
    .digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return workspaceId;
}

export async function readActiveWorkspaceIdFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  return verifySignedActiveWorkspaceCookie(raw);
}

export function activeWorkspaceCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 180,
  };
}

/**
 * Reject cross-site cookie mutation. SameSite=lax already blocks most CSRF;
 * Origin/Referer check adds defense-in-depth for credentialed same-site abuse.
 */
export function isTrustedStaffMutationOrigin(
  request: Request,
  siteUrl: string,
): boolean {
  const expected = new URL(siteUrl);
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const o = new URL(origin);
      return o.host === expected.host && o.protocol === expected.protocol;
    } catch {
      return false;
    }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const r = new URL(referer);
      return r.host === expected.host && r.protocol === expected.protocol;
    } catch {
      return false;
    }
  }
  // No Origin/Referer: allow same-origin navigations from older clients only in non-prod.
  return process.env.NODE_ENV !== "production";
}
