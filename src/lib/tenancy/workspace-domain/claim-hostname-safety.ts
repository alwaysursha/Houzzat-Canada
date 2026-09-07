/**
 * Stage 6.11F.1 — claim-only hostname policy for CUSTOM website domains.
 *
 * Shared `normalizeWorkspaceHostname` may accept development hosts (localhost /
 * IPv4) for request-host parsing. CUSTOM claims must still reject them.
 */

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

export type ClaimHostnameSafetyResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Apply after successful normalizeWorkspaceHostname.
 * Input must already be ASCII lowercase without port/protocol.
 */
export function assertSafeCustomWebsiteClaimHostname(
  normalizedHostname: string,
): ClaimHostnameSafetyResult {
  const hostname = normalizedHostname.trim().toLowerCase();
  if (!hostname) {
    return { ok: false, error: "hostname empty" };
  }
  if (hostname.includes("*")) {
    return { ok: false, error: "wildcard hostnames are not allowed" };
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, error: "localhost is not allowed" };
  }
  if (IPV4_RE.test(hostname)) {
    return { ok: false, error: "IPv4 literals are not allowed" };
  }
  // IPv6 never passes the DNS-label normalizer; keep an explicit guard.
  if (hostname.includes(":")) {
    return { ok: false, error: "IPv6 literals are not allowed" };
  }
  if (!hostname.includes(".")) {
    return {
      ok: false,
      error:
        "custom website domains must include a domain label (e.g. example.com)",
    };
  }
  return { ok: true };
}
