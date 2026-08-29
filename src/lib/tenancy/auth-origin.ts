/**
 * Stage 3K.5.2 — Auth.js request-origin foundation (host-isolated sessions).
 */
import { headers } from "next/headers";
import {
  readEnvPinnedAuthOrigin,
  readEnvPinnedAuthUrl,
} from "@/lib/tenancy/env-pinned-origin";
import {
  absoluteUrlForOrigin,
  resolveTrustedRequestOrigin,
} from "@/lib/tenancy/resolve-trusted-request-origin";

/** Build a Request from Next.js incoming headers when redirect callback lacks Request. */
export async function buildSyntheticRequestFromHeaders(): Promise<Request | null> {
  const headerStore = await headers();
  const host = headerStore.get("host");
  if (!host) return null;

  const protoHeader = headerStore.get("x-forwarded-proto");
  const protocol =
    protoHeader === "http" || protoHeader === "https"
      ? protoHeader
      : process.env.NODE_ENV === "production"
        ? "https"
        : "http";

  try {
    return new Request(`${protocol}://${host}/`);
  } catch {
    return null;
  }
}

/**
 * Preferred Auth.js base origin for the current request.
 * Falls back to env-pinned origin when hostname cannot be trusted.
 */
export async function resolveAuthBaseOriginForRequest(
  request?: Request | null,
): Promise<string> {
  const req =
    (await buildSyntheticRequestFromHeaders().catch(() => null)) ?? request;
  if (req) {
    const trusted = resolveTrustedRequestOrigin(req);
    if (trusted.ok) return trusted.origin;
  }
  return readEnvPinnedAuthOrigin();
}

/** Resolve redirect target preserving trusted request origin for relative URLs. */
export function resolveAuthRedirectUrl(
  url: string,
  baseOrigin: string,
): string {
  if (url.startsWith("/")) {
    return absoluteUrlForOrigin(baseOrigin, url) ?? baseOrigin;
  }

  try {
    const parsed = new URL(url);
    const base = new URL(baseOrigin);
    if (parsed.origin === base.origin) {
      return url;
    }
  } catch {
    return baseOrigin;
  }

  return baseOrigin;
}

/** Documented Auth.js limitations for Stage 3K.5.3 deploy. */
export const AUTH_ORIGIN_FOUNDATION_DOC = {
  authJsVersion: "next-auth@5.0.0-beta.31",
  trustHost: true,
  cookiesHostOnly: true,
  envPinBlocksDynamicOrigin:
    "NEXTAUTH_URL/AUTH_URL set on Worker forces callback-url cookie to houzzat.com until unset",
  oauthImplication:
    "Google OAuth redirect URI is registered per provider console entry; each tenant custom domain needs its own redirect URI registered before OAuth works on that host",
  credentialsImplication:
    "Credentials provider uses same-origin POST; host-isolated sessions work per hostname once NEXTAUTH_URL is unset",
  deployRequirement:
    "Remove NEXTAUTH_URL from wrangler.jsonc vars and redeploy Worker for live per-host callback-url cookies",
} as const;

/** Selftest guard — cookies must never set Domain= for cross-subdomain sessions. */
export function authCookieOptionsAreHostOnly(
  cookies: Record<string, { options?: Record<string, unknown> }>,
): boolean {
  for (const entry of Object.values(cookies)) {
    const domain = entry.options?.domain;
    if (domain !== undefined && domain !== null && domain !== "") {
      return false;
    }
  }
  return true;
}

export function readEnvPinnedAuthUrlForDiagnostics(): string {
  return readEnvPinnedAuthUrl();
}
