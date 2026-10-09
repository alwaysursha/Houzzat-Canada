/**
 * Active Search Memory (Phase A) — browsing-only persistence of the latest
 * committed Search V2 criteria. Not a Saved Search, alert, or qualification field.
 *
 * Storage is origin-local and scoped per tenant workspace (or hostname fallback).
 */

import { getPresentedTenantBrand } from "@/components/tenancy/presented-tenant-brand";
import { parseSearchUrl } from "@/lib/listings/search-state/parse";
import { serializeSearchUrl } from "@/lib/listings/search-state/serialize";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

export const ACTIVE_SEARCH_MEMORY_VERSION = 1 as const;
export const ACTIVE_SEARCH_MEMORY_KEY_PREFIX = "houzzat:active-search-v1";
/** Fired after Active Search Memory is written or cleared (same-tab listeners). */
export const ACTIVE_SEARCH_CHANGED_EVENT = "houzzat:active-search-changed";

function emitActiveSearchChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACTIVE_SEARCH_CHANGED_EVENT));
}

type ActiveSearchRecord = {
  v: typeof ACTIVE_SEARCH_MEMORY_VERSION;
  href: string;
  updatedAt: number;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Tenant isolation on a shared origin — prefer workspaceId, else hostname. */
export function activeSearchMemoryScope(host?: string): string {
  const brand = getPresentedTenantBrand();
  if (brand?.workspaceId?.trim()) return brand.workspaceId.trim();
  const hostname =
    host?.trim() ||
    (typeof window !== "undefined" ? window.location.hostname : "");
  return hostname || "default";
}

export function activeSearchMemoryKey(scope?: string): string {
  return `${ACTIVE_SEARCH_MEMORY_KEY_PREFIX}:${scope ?? activeSearchMemoryScope()}`;
}

/** Consumer /search only — never admin or agent search consoles. */
export function isConsumerSearchPath(pathname: string): boolean {
  return pathname === "/search";
}

/**
 * URL params that mean the visitor deliberately chose criteria (do not restore
 * over these). Default SALE transaction and alone view= are not "criteria".
 */
export function urlHasExplicitSearchCriteria(
  params: URLSearchParams | string,
): boolean {
  const p =
    typeof params === "string"
      ? new URLSearchParams(
          params.startsWith("?") ? params.slice(1) : params.includes("?")
            ? params.slice(params.indexOf("?") + 1)
            : params,
        )
      : params;

  if (p.get("city")?.trim()) return true;
  if (p.get("cities")?.trim()) return true;
  if (p.get("community")?.trim()) return true;
  if (p.get("communities")?.trim()) return true;
  if (p.get("q")?.trim()) return true;
  if (p.get("minPrice")?.trim()) return true;
  if (p.get("maxPrice")?.trim()) return true;
  if (p.get("minBeds")?.trim()) return true;
  if (p.get("minBaths")?.trim()) return true;
  if (p.get("propertyTypes")?.trim()) return true;
  if (p.get("openHouseOnly") === "1") return true;
  if (p.get("dataSource")?.trim()) return true;
  const segment = p.get("segment")?.trim();
  if (segment && segment !== "RESIDENTIAL") return true;
  const status = p.get("status")?.trim();
  if (status && status !== "ACTIVE") return true;
  const txn = p.get("transactionType")?.trim();
  if (txn && txn !== "SALE") return true;
  const sort = p.get("sort")?.trim();
  if (sort && sort !== "newest") return true;
  return false;
}

export function urlHasExplicitView(params: URLSearchParams | string): boolean {
  const p =
    typeof params === "string"
      ? new URLSearchParams(
          params.startsWith("?") ? params.slice(1) : params.includes("?")
            ? params.slice(params.indexOf("?") + 1)
            : params,
        )
      : params;
  const view = p.get("view")?.trim();
  return view === "cards" || view === "map" || view === "split";
}

function parseRecord(raw: string | null): ActiveSearchRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveSearchRecord>;
    if (parsed.v !== ACTIVE_SEARCH_MEMORY_VERSION) return null;
    if (typeof parsed.href !== "string" || !parsed.href.startsWith("/search")) {
      return null;
    }
    if (typeof parsed.updatedAt !== "number" || !Number.isFinite(parsed.updatedAt)) {
      return null;
    }
    return {
      v: ACTIVE_SEARCH_MEMORY_VERSION,
      href: parsed.href.slice(0, 1200),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function loadActiveSearchMemory(scope?: string): ActiveSearchRecord | null {
  if (!canUseStorage()) return null;
  try {
    return parseRecord(localStorage.getItem(activeSearchMemoryKey(scope)));
  } catch {
    return null;
  }
}

export function saveActiveSearchMemory(
  href: string,
  options?: { scope?: string; now?: number },
): void {
  if (!canUseStorage()) return;
  const raw = typeof href === "string" ? href.trim() : "";
  if (!raw.startsWith("/search")) return;
  const record: ActiveSearchRecord = {
    v: ACTIVE_SEARCH_MEMORY_VERSION,
    href: raw.slice(0, 1200),
    updatedAt: options?.now ?? Date.now(),
  };
  try {
    localStorage.setItem(
      activeSearchMemoryKey(options?.scope),
      JSON.stringify(record),
    );
    emitActiveSearchChanged();
  } catch {
    /* private mode / quota */
  }
}

export function clearActiveSearchMemory(scope?: string): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(activeSearchMemoryKey(scope));
    emitActiveSearchChanged();
  } catch {
    /* ignore */
  }
}

/**
 * Build the restore href from memory, optionally applying an explicit `view`
 * from the current URL (Map Search nav) without discarding remembered criteria.
 */
export function resolveActiveSearchRestoreHref(input: {
  memoryHref: string;
  currentParams: URLSearchParams;
}): string | null {
  try {
    const remembered = parseSearchUrl(input.memoryHref);
    let next: CommittedSearch = remembered;
    if (urlHasExplicitView(input.currentParams)) {
      const view = input.currentParams.get("view");
      if (view === "cards" || view === "map" || view === "split") {
        next = { ...remembered, view };
      }
    }
    return serializeSearchUrl(next, { pathname: "/search" });
  } catch {
    return null;
  }
}
