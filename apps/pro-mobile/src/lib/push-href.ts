/**
 * Stage 5.11 — sanitize FCM data.href for native navigation (web push-href parity).
 * Absolute URLs / hostnames rejected — native only.
 */

const MAX_HREF_LEN = 512;

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

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    return null;
  }

  if (!trimmed.startsWith("/")) return null;
  if (trimmed.includes("\\") || trimmed.includes("\0")) return null;

  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  const segments = pathOnly.split("/");
  if (segments.some((s) => s === ".." || s === ".")) return null;

  if (!(pathOnly === "/agent" || pathOnly.startsWith("/agent/"))) {
    return null;
  }

  return trimmed;
}

export type PushNavTarget =
  | { kind: "lead"; leadId: string }
  | { kind: "tasks" }
  | { kind: "home" };

/** Map canonical staff push href → native destination. */
export function resolvePushNavTarget(rawHref: unknown): PushNavTarget {
  const href = sanitizePushHref(rawHref);
  if (!href) return { kind: "home" };

  const pathOnly = href.split(/[?#]/, 1)[0] ?? href;
  const openLead = pathOnly.match(/^\/agent\/open-lead\/([^/]+)$/);
  if (openLead?.[1]) {
    try {
      return { kind: "lead", leadId: decodeURIComponent(openLead[1]) };
    } catch {
      return { kind: "home" };
    }
  }

  if (pathOnly === "/agent/leads" || pathOnly.startsWith("/agent/leads/")) {
    const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
    const lead = new URLSearchParams(query.split("#")[0]).get("lead");
    if (lead && lead.trim()) return { kind: "lead", leadId: lead.trim() };
  }

  if (pathOnly === "/agent/tasks" || pathOnly.startsWith("/agent/tasks/")) {
    return { kind: "tasks" };
  }

  return { kind: "home" };
}
