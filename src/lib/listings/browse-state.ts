/**
 * Account browse-state — Active Search + Recent Searches sync helpers.
 * Pure validation / merge (no Prisma). Never creates SavedSearch or alerts.
 */

import { urlHasExplicitSearchCriteria } from "@/lib/listings/search-state/active-search-memory";
import { normalizeRecentSearchHref } from "@/lib/listings/recent-searches-local";

export const BROWSE_STATE_RECENT_MAX = 8;
export const BROWSE_STATE_HREF_MAX = 1200;
export const BROWSE_STATE_LABEL_MAX = 160;

export type BrowseRecentEntry = {
  label: string;
  href: string;
  at: number;
};

export type BrowseStatePayload = {
  activeSearchHref: string | null;
  activeUpdatedAt: number | null;
  recentSearches: BrowseRecentEntry[];
  revision: number;
};

/** Strip presentation-only `view` and reject non-/search URLs. */
export function canonicalizeBrowseSearchHref(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.length > BROWSE_STATE_HREF_MAX) return null;
  if (!trimmed.startsWith("/search")) return null;
  // Reject protocol-relative / absolute / traversal.
  if (trimmed.startsWith("//") || trimmed.includes("://")) return null;
  if (trimmed.includes("\\") || trimmed.includes("..")) return null;

  try {
    const url = new URL(trimmed, "https://houzzat.local");
    if (url.pathname !== "/search") return null;
    const params = new URLSearchParams(url.search);
    params.delete("view");
    // Drop empty values.
    for (const key of [...params.keys()]) {
      const value = params.get(key);
      if (value == null || value.trim() === "") params.delete(key);
    }
    const qs = params.toString();
    const href = qs ? `/search?${qs}` : "/search";
    if (!urlHasExplicitSearchCriteria(href)) return null;
    return href.slice(0, BROWSE_STATE_HREF_MAX);
  } catch {
    return null;
  }
}

export function normalizeBrowseRecentEntry(
  raw: unknown,
): BrowseRecentEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const label =
    typeof row.label === "string" ? row.label.trim().slice(0, BROWSE_STATE_LABEL_MAX) : "";
  const href = canonicalizeBrowseSearchHref(
    typeof row.href === "string" ? row.href : null,
  );
  const at =
    typeof row.at === "number" && Number.isFinite(row.at)
      ? Math.trunc(row.at)
      : null;
  if (!label || !href || at == null || at <= 0) return null;
  return { label, href, at };
}

export function normalizeBrowseRecentList(
  raw: unknown,
  max = BROWSE_STATE_RECENT_MAX,
): BrowseRecentEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: BrowseRecentEntry[] = [];
  const seen = new Set<string>();
  // Prefer first occurrence (callers should send newest-first).
  for (const item of raw) {
    const entry = normalizeBrowseRecentEntry(item);
    if (!entry) continue;
    const key = normalizeRecentSearchHref(entry.href);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Merge recent lists by canonical href. Newest `at` wins per key;
 * result sorted newest-first, capped.
 */
export function mergeBrowseRecentLists(
  account: readonly BrowseRecentEntry[],
  incoming: readonly BrowseRecentEntry[],
  max = BROWSE_STATE_RECENT_MAX,
): BrowseRecentEntry[] {
  const byKey = new Map<string, BrowseRecentEntry>();
  for (const item of [...account, ...incoming]) {
    const entry = normalizeBrowseRecentEntry(item);
    if (!entry) continue;
    const key = normalizeRecentSearchHref(entry.href);
    const existing = byKey.get(key);
    if (!existing || entry.at >= existing.at) {
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, max);
}

/**
 * Active Search conflict rule (deterministic):
 * - Prefer the side with the newer activeUpdatedAt.
 * - On equal timestamps, prefer account (server) over guest/device.
 * - Intentional account clear (null href + timestamp) beats older incoming
 *   so offline retries cannot resurrect a reset search.
 * - Empty account (null href, null timestamp) still accepts incoming.
 */
export function resolveActiveSearchConflict(input: {
  accountHref: string | null;
  accountUpdatedAt: number | null;
  incomingHref: string | null;
  incomingUpdatedAt: number | null;
}): { href: string | null; updatedAt: number | null } {
  const accountHref = canonicalizeBrowseSearchHref(input.accountHref);
  const incomingHref = canonicalizeBrowseSearchHref(input.incomingHref);
  const accountAt = input.accountUpdatedAt;
  const incomingAt = input.incomingUpdatedAt;

  if (!incomingHref && !accountHref) {
    // Prefer the newer clear/empty timestamp when both hrefs are empty.
    if (accountAt != null || incomingAt != null) {
      const a = accountAt ?? 0;
      const b = incomingAt ?? 0;
      return { href: null, updatedAt: b > a ? incomingAt : accountAt };
    }
    return { href: null, updatedAt: null };
  }
  if (!incomingHref) {
    return { href: accountHref, updatedAt: accountAt };
  }
  if (!accountHref) {
    // Cleared-with-timestamp beats older offline resurrect; empty account accepts.
    if (accountAt != null && (incomingAt ?? 0) <= accountAt) {
      return { href: null, updatedAt: accountAt };
    }
    return { href: incomingHref, updatedAt: incomingAt };
  }

  const a = accountAt ?? 0;
  const b = incomingAt ?? 0;
  if (b > a) return { href: incomingHref, updatedAt: incomingAt };
  return { href: accountHref, updatedAt: accountAt };
}

export function parseStoredRecentJson(raw: unknown): BrowseRecentEntry[] {
  return normalizeBrowseRecentList(raw);
}

export function browseStateEquals(
  a: Pick<BrowseStatePayload, "activeSearchHref" | "recentSearches">,
  b: Pick<BrowseStatePayload, "activeSearchHref" | "recentSearches">,
): boolean {
  const aHref = canonicalizeBrowseSearchHref(a.activeSearchHref);
  const bHref = canonicalizeBrowseSearchHref(b.activeSearchHref);
  if (aHref !== bHref) return false;
  if (a.recentSearches.length !== b.recentSearches.length) return false;
  for (let i = 0; i < a.recentSearches.length; i++) {
    const left = a.recentSearches[i]!;
    const right = b.recentSearches[i]!;
    if (
      normalizeRecentSearchHref(left.href) !==
        normalizeRecentSearchHref(right.href) ||
      left.at !== right.at ||
      left.label !== right.label
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Clamp client clocks so future skew cannot beat server-authoritative state.
 * Times ahead of the server are treated as untrusted (null) for merge LWW.
 */
export function clampBrowseClientTime(
  clientAt: number | null,
  serverNow: number,
): number | null {
  if (clientAt == null || !Number.isFinite(clientAt)) return null;
  const t = Math.trunc(clientAt);
  if (t > serverNow) return null;
  return t;
}

/**
 * Pure next-state resolver for browse PUT apply.
 * Non-merge writes are revision-gated at the DB layer; this stamps server time
 * so client clock skew cannot overwrite newer server-authoritative Active Search.
 */
export function computeBrowseStateNext(input: {
  account: BrowseStatePayload;
  incomingActiveHref: string | null | undefined;
  incomingActiveAt: number | null;
  incomingRecent: BrowseRecentEntry[] | undefined;
  merge: boolean;
  serverNow: number;
}): {
  nextActiveHref: string | null;
  nextActiveAt: number | null;
  nextRecent: BrowseRecentEntry[];
} {
  const { account, incomingActiveHref, incomingRecent, merge, serverNow } =
    input;
  const clampedIncomingAt = clampBrowseClientTime(
    input.incomingActiveAt,
    serverNow,
  );

  let nextActiveHref = account.activeSearchHref;
  let nextActiveAt = account.activeUpdatedAt;
  let nextRecent = account.recentSearches;

  if (incomingActiveHref !== undefined) {
    if (merge) {
      const resolved = resolveActiveSearchConflict({
        accountHref: account.activeSearchHref,
        accountUpdatedAt: account.activeUpdatedAt,
        incomingHref: incomingActiveHref,
        incomingUpdatedAt: clampedIncomingAt,
      });
      nextActiveHref = resolved.href;
      nextActiveAt = resolved.updatedAt;
    } else if (incomingActiveHref == null) {
      // Explicit clear — server time wins so offline retries cannot resurrect.
      nextActiveHref = null;
      nextActiveAt = serverNow;
    } else {
      // Revision-gated writer wins; stamp with server time (ignore client skew).
      nextActiveHref = incomingActiveHref;
      nextActiveAt = serverNow;
    }
  }

  if (incomingRecent !== undefined) {
    const clampedRecent = incomingRecent.map((row) => ({
      ...row,
      at: Math.min(row.at, serverNow),
    }));
    nextRecent = mergeBrowseRecentLists(account.recentSearches, clampedRecent);
  }

  return { nextActiveHref, nextActiveAt, nextRecent };
}
