/**
 * Sanitize push deep-link hrefs from FCM data.
 * Server still authorizes the destination; this only blocks unsafe navigation.
 */

const MAX_HREF_LEN = 512;

/** Internal path only — no scheme, host, or protocol-relative URL. */
export function sanitizePushHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_HREF_LEN) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("blob:")
  ) {
    return null;
  }

  // Absolute or protocol-relative → reject (even houzzat.com — use path only).
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    return null;
  }

  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\")) return null;
  if (trimmed.includes("\0")) return null;

  // Block path traversal segments.
  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  const segments = pathOnly.split("/");
  if (segments.some((s) => s === ".." || s === ".")) return null;

  // Allowlist: consumer Houzzat + HouzzatPro CRM paths. Query/hash preserved.
  if (!isAllowedPushPath(pathOnly)) return null;

  return trimmed;
}

function isAllowedPushPath(path: string): boolean {
  if (path === "/") return true;
  if (path.startsWith("/listing/")) return true;
  if (path.startsWith("/search")) return true;
  if (path.startsWith("/account")) return true;
  if (path.startsWith("/route-planner")) return true;
  if (path.startsWith("/auth/")) return true;
  // Shared shortlist / marketing surfaces used by existing push hrefs.
  if (path.startsWith("/share/")) return true;
  if (path.startsWith("/s/")) return true;
  // HouzzatPro CRM — lead profile uses `/agent/leads?lead=` (and `/agent/leads/{id}` redirect).
  if (path === "/agent" || path.startsWith("/agent/")) return true;
  if (path === "/admin" || path.startsWith("/admin/")) return true;
  if (path === "/pro" || path.startsWith("/pro/")) return true;
  return false;
}
