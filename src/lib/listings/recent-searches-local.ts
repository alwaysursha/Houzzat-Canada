/**
 * Local Recent Searches — browsing history only (not SavedSearch / alerts).
 * Origin-local and tenant-scoped (workspaceId, else hostname).
 */

import { getPresentedTenantBrand } from "@/components/tenancy/presented-tenant-brand";

const LEGACY_STORAGE_KEY = "houzzat:recent-searches";
const STORAGE_KEY_PREFIX = "houzzat:recent-searches-v1";
const MAX_ITEMS = 8;

/** Fired after local Recent Searches are written or cleared (same-tab). */
export const RECENT_SEARCHES_CHANGED_EVENT = "houzzat:recent-searches-changed";

function emitRecentSearchesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECENT_SEARCHES_CHANGED_EVENT));
}

export type LocalRecentSearch = {
  label: string;
  href: string;
  at: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Tenant isolation on a shared origin — prefer workspaceId, else hostname. */
export function recentSearchesScope(host?: string): string {
  const brand = getPresentedTenantBrand();
  if (brand?.workspaceId?.trim()) return brand.workspaceId.trim();
  const hostname =
    host?.trim() ||
    (typeof window !== "undefined" ? window.location.hostname : "");
  return hostname || "default";
}

export function recentSearchesStorageKey(scope?: string): string {
  return `${STORAGE_KEY_PREFIX}:${scope ?? recentSearchesScope()}`;
}

/** Collapse equivalent search destinations (case / param order). */
export function normalizeRecentSearchHref(href: string) {
  const trimmed = href.trim();
  try {
    const url = new URL(trimmed, "https://houzzat.local");
    const params = new URLSearchParams(url.search);
    const keys = [...params.keys()].sort();
    const normalized = new URLSearchParams();
    for (const key of keys) {
      const value = params.get(key);
      if (value == null || value === "") continue;
      // View mode is presentation — not search identity.
      if (key === "view") continue;
      normalized.set(key, value.trim().toLowerCase());
    }
    const qs = normalized.toString();
    return `${url.pathname.toLowerCase()}${qs ? `?${qs}` : ""}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * Identity is canonical href only. Labels can collide across distinct criteria
 * (e.g. same beds/city with different sort) and must not merge those rows.
 */
function isSameSearch(a: LocalRecentSearch, b: LocalRecentSearch) {
  return normalizeRecentSearchHref(a.href) === normalizeRecentSearchHref(b.href);
}

export function dedupeRecentSearches(
  items: LocalRecentSearch[],
  max = MAX_ITEMS,
): LocalRecentSearch[] {
  const out: LocalRecentSearch[] = [];
  for (const item of items) {
    if (out.some((existing) => isSameSearch(existing, item))) continue;
    out.push(item);
  }
  return out.slice(0, max);
}

function parseStored(raw: string | null): LocalRecentSearch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is LocalRecentSearch =>
        Boolean(
          row &&
            typeof row === "object" &&
            typeof (row as LocalRecentSearch).label === "string" &&
            typeof (row as LocalRecentSearch).href === "string" &&
            typeof (row as LocalRecentSearch).at === "number",
        ),
    );
  } catch {
    return [];
  }
}

/** One-time migrate unscoped legacy key into the current tenant scope. */
function migrateLegacyIfNeeded(scopedKey: string) {
  if (!canUseStorage()) return;
  try {
    if (localStorage.getItem(scopedKey)) return;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return;
    localStorage.setItem(scopedKey, legacy);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function readLocalRecentSearches(scope?: string): LocalRecentSearch[] {
  if (!canUseStorage()) return [];
  const key = recentSearchesStorageKey(scope);
  migrateLegacyIfNeeded(key);
  try {
    const valid = parseStored(localStorage.getItem(key));
    const deduped = dedupeRecentSearches(valid);
    if (deduped.length !== valid.length) {
      try {
        localStorage.setItem(key, JSON.stringify(deduped));
      } catch {
        // ignore
      }
    }
    return deduped;
  } catch {
    return [];
  }
}

export function pushLocalRecentSearch(entry: {
  label: string;
  href: string;
  scope?: string;
}) {
  if (!canUseStorage()) return;
  const label = entry.label.trim();
  const href = entry.href.trim();
  if (!label || !href) return;
  // Bare /search with no criteria is not useful history.
  if (href === "/search" || href.startsWith("/search?")) {
    try {
      const u = new URL(href, "https://houzzat.local");
      const params = new URLSearchParams(u.search);
      params.delete("view");
      if (![...params.keys()].length && u.pathname === "/search") return;
    } catch {
      // keep going
    }
  }

  const key = recentSearchesStorageKey(entry.scope);
  migrateLegacyIfNeeded(key);
  const next = dedupeRecentSearches([
    { label, href, at: Date.now() },
    ...readLocalRecentSearches(entry.scope),
  ]);

  try {
    localStorage.setItem(key, JSON.stringify(next));
    emitRecentSearchesChanged();
  } catch {
    // Quota / private mode — ignore.
  }
}

/** Replace the full recent list (account sync / merge apply). */
export function writeLocalRecentSearches(
  items: LocalRecentSearch[],
  scope?: string,
) {
  if (!canUseStorage()) return;
  const key = recentSearchesStorageKey(scope);
  const next = dedupeRecentSearches(items);
  try {
    localStorage.setItem(key, JSON.stringify(next));
    emitRecentSearchesChanged();
  } catch {
    // ignore
  }
}

export function clearLocalRecentSearches(scope?: string) {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(recentSearchesStorageKey(scope));
    emitRecentSearchesChanged();
  } catch {
    // ignore
  }
}
