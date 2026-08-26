/**
 * Stage 3K.3 — trusted request hostname extraction (Cloudflare/OpenNext).
 *
 * Authority order:
 * 1. `new URL(request.url).hostname` — set by Cloudflare Worker / OpenNext from edge Host
 * 2. `Host` header — same value at Cloudflare edge in normal production flow
 *
 * We intentionally do NOT read `X-Forwarded-Host` — spoofable if ever bypassing CF edge.
 */
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";

export function extractTrustedRequestHostname(request: Request): string | null {
  let candidate: string | null = null;

  try {
    const fromUrl = new URL(request.url).hostname;
    if (fromUrl) candidate = fromUrl;
  } catch {
    // fall through
  }

  if (!candidate) {
    const hostHeader = request.headers.get("host");
    if (hostHeader) {
      candidate = hostHeader;
    }
  }

  if (!candidate) return null;

  const normalized = normalizeWorkspaceHostname(candidate);
  return normalized.ok ? normalized.hostname : null;
}

/**
 * Documented precedence for operators (not executed at runtime).
 */
export const TRUSTED_HOSTNAME_AUTHORITY_DOC = [
  "Cloudflare edge sets Host from TLS SNI / HTTP Host",
  "OpenNext Worker request.url reflects that Host",
  "Resolver uses request.url hostname, then Host header",
  "X-Forwarded-Host is ignored (client-spoofable)",
] as const;
