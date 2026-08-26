/**
 * Stage 3K.5.2 — trusted request origin (hostname-scoped, no X-Forwarded-Host).
 */
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { blocksTenantHostnameResolution } from "@/lib/tenancy/reserved-domains";

export type TrustedRequestOriginDenyReason =
  | "malformed_hostname"
  | "platform_surface"
  | "protocol_not_allowed"
  | "userinfo_in_url"
  | "missing_hostname";

export type TrustedRequestOriginSuccess = {
  ok: true;
  origin: string;
  hostname: string;
  protocol: "http:" | "https:";
};

export type TrustedRequestOriginFailure = {
  ok: false;
  reason: TrustedRequestOriginDenyReason;
};

export type TrustedRequestOriginResult =
  | TrustedRequestOriginSuccess
  | TrustedRequestOriginFailure;

function productionProtocol(): "http:" | "https:" {
  return process.env.NODE_ENV === "production" ? "https:" : "http:";
}

function protocolFromRequestUrl(request: Request): "http:" | "https:" | null {
  try {
    const parsed = new URL(request.url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.protocol;
    }
  } catch {
    // fall through
  }
  return null;
}

function resolveProtocol(request: Request): "http:" | "https:" {
  return protocolFromRequestUrl(request) ?? productionProtocol();
}

/**
 * Derive a trusted HTTPS/HTTP origin from request.url hostname (+ Host fallback).
 * Does not read X-Forwarded-Host.
 */
export function resolveTrustedRequestOrigin(
  request: Request,
  options?: { requireTenantOrigin?: boolean },
): TrustedRequestOriginResult {
  try {
    const parsed = new URL(request.url);
    if (parsed.username || parsed.password) {
      return { ok: false, reason: "userinfo_in_url" };
    }
  } catch {
    return { ok: false, reason: "malformed_hostname" };
  }

  const hostname = extractTrustedRequestHostname(request);
  if (!hostname) {
    return { ok: false, reason: "missing_hostname" };
  }

  if (options?.requireTenantOrigin) {
    const platformBlock = blocksTenantHostnameResolution(hostname);
    if (platformBlock) {
      return { ok: false, reason: "platform_surface" };
    }
  }

  const protocol = resolveProtocol(request);
  if (process.env.NODE_ENV === "production" && protocol !== "https:") {
    return { ok: false, reason: "protocol_not_allowed" };
  }

  return {
    ok: true,
    origin: `${protocol}//${hostname}`,
    hostname,
    protocol,
  };
}

/** Safe path join — rejects protocol-relative and external escapes. */
export function normalizeTrustedAbsolutePath(path: string): string | null {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed) return "/";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\")) return null;
  if (trimmed.includes("@")) return null;

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const segments = withSlash.split("/");
  const safe: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    safe.push(segment);
  }
  return safe.length === 0 ? "/" : `/${safe.join("/")}`;
}

export function absoluteUrlForOrigin(origin: string, path = "/"): string | null {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return null;
  }
  if (base.username || base.password) return null;

  const normalizedPath = normalizeTrustedAbsolutePath(path);
  if (normalizedPath === null) return null;

  return `${base.origin}${normalizedPath === "/" ? "" : normalizedPath}`;
}

export function absoluteUrlForRequest(
  request: Request,
  path = "/",
): string | null {
  const origin = resolveTrustedRequestOrigin(request);
  if (!origin.ok) return null;
  return absoluteUrlForOrigin(origin.origin, path);
}
