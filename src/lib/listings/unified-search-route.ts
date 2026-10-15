/**
 * Unified free-text inventory search routing (Phase 3).
 *
 * Precedence on Enter/Search submit:
 * 1. Off-market civic resolve when flag ON + exact-address heuristic
 * 2. Natural-language parseSearchQuery (V2 when its flag ON, else legacy)
 * 3. Traditional /search URL filters
 *
 * Never resolves per keystroke. Never navigates to /property from regex alone.
 */

import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import { parseExactAddressQuery } from "@/lib/listings/search-match";
import { isOffMarketPropertySearchEnabled } from "@/lib/property-address/feature-flag";
import {
  decideSearchAddressNavigation,
  fetchPropertyAddressResolve,
  rememberPreparedPropertyAddress,
  type SearchAddressNavDecision,
} from "@/lib/property-address/search-integration";

export type FreeTextInventoryRoute = {
  href: string;
  /** How the href was chosen — for tests / telemetry. */
  via:
    | "listing"
    | "property"
    | "nearby"
    | "search"
    | "empty";
  message?: string;
};

export function shouldAttemptOffMarketFreeTextResolve(query: string): boolean {
  if (!isOffMarketPropertySearchEnabled()) return false;
  const trimmed = query.trim();
  if (trimmed.length < 5) return false;
  // Strict civic gate — NL phrases like "3 bed Mississauga" must not resolve.
  return parseExactAddressQuery(trimmed) != null;
}

export async function resolveFreeTextCivicSearchNavigation(
  query: string,
  options: {
    transactionType?: "SALE" | "LEASE";
    sessionToken?: string | null;
  } = {},
): Promise<SearchAddressNavDecision | null> {
  if (!shouldAttemptOffMarketFreeTextResolve(query)) return null;
  const result = await fetchPropertyAddressResolve({
    query: query.trim(),
    sessionToken: options.sessionToken,
  });
  return decideSearchAddressNavigation(result, {
    transactionType: options.transactionType,
  });
}

/** NL / traditional /search href from a free-text phrase (flag-aware parser). */
export function inventorySearchHrefFromQuery(
  query: string,
  options: {
    transactionType?: "SALE" | "LEASE";
    basePath?: string;
  } = {},
): string {
  const parsed = parseSearchQuery(query);
  const txn = parsed.transactionType ?? options.transactionType;
  if (txn && !parsed.transactionType) {
    parsed.transactionType = txn;
    parsed.hasFilters = true;
  }
  return searchHrefFromParsed(
    { ...parsed, hasFilters: parsed.hasFilters || Boolean(txn) },
    { transactionType: txn, basePath: options.basePath },
  );
}

/**
 * Single submit-time router for homepage, header, /search, and listing chrome.
 * Call only on Enter/Search — never from autocomplete keystroke handlers.
 */
export async function routeFreeTextInventorySearch(
  query: string,
  options: {
    transactionType?: "SALE" | "LEASE";
    basePath?: string;
    sessionToken?: string | null;
  } = {},
): Promise<FreeTextInventoryRoute> {
  const trimmed = query.trim();
  const txn = options.transactionType ?? "SALE";
  const basePath = options.basePath;

  if (!trimmed) {
    const href = searchHrefFromParsed(
      { hasFilters: true, transactionType: txn },
      { transactionType: txn, basePath },
    );
    return { href, via: "empty" };
  }

  const decision = await resolveFreeTextCivicSearchNavigation(trimmed, {
    transactionType: txn,
    sessionToken: options.sessionToken,
  });

  if (decision) {
    switch (decision.kind) {
      case "listing":
        return { href: decision.href, via: "listing" };
      case "property_prepared":
        rememberPreparedPropertyAddress(decision.prepared);
        return { href: decision.prepared.path, via: "property" };
      case "nearby":
        if (decision.nearbyHref) {
          return { href: decision.nearbyHref, via: "nearby" };
        }
        break;
      case "unresolvable":
        if (decision.nearbyHref) {
          return {
            href: decision.nearbyHref,
            via: "nearby",
            message: decision.message,
          };
        }
        // No verified coords — fall through to NL/search, never /property from text.
        break;
      default: {
        const _exhaustive: never = decision;
        void _exhaustive;
        break;
      }
    }
  }

  return {
    href: inventorySearchHrefFromQuery(trimmed, {
      transactionType: txn,
      basePath,
    }),
    via: "search",
  };
}
