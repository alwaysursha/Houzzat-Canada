/**
 * Shared parsing for tenant email feature-flag workspace allowlists.
 * Malformed entries are skipped (fail closed per entry); empty → no IDs.
 */

import { isValidWorkspaceIdShape } from "@/lib/active-workspace";

/**
 * Parse a comma/whitespace-separated workspace allowlist.
 * Invalid shapes are rejected; empty/unset → empty set.
 */
export function parseWorkspaceIdAllowlist(
  raw: string | null | undefined,
): ReadonlySet<string> {
  if (raw == null) return new Set();
  const trimmed = raw.trim();
  if (!trimmed) return new Set();

  const out = new Set<string>();
  for (const part of trimmed.split(/[,\s]+/)) {
    const id = part.trim();
    if (!id) continue;
    if (!isValidWorkspaceIdShape(id)) continue;
    out.add(id);
  }
  return out;
}

/**
 * True when workspaceId is a valid shape and present in a non-empty allowlist.
 * Empty/unset allowlist → false (fail closed).
 */
export function isWorkspaceIdAllowlisted(
  workspaceId: string | null | undefined,
  allowlistRaw: string | null | undefined,
): boolean {
  const id = workspaceId?.trim();
  if (!id || !isValidWorkspaceIdShape(id)) return false;
  const allowed = parseWorkspaceIdAllowlist(allowlistRaw);
  if (allowed.size === 0) return false;
  return allowed.has(id);
}
