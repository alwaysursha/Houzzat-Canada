/**
 * Persist the visitor's last /search URL so signup → captureContext can recover
 * city/price after client-side navigation to a listing (document.referrer is unreliable).
 * Browser sessionStorage only — never creates SavedSearch.
 */

export const BROWSE_SEARCH_CONTEXT_KEY = "houzzat:browse-search-url";

export function persistBrowseSearchUrl(url: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (!parsed.pathname.startsWith("/search")) return;
    sessionStorage.setItem(
      BROWSE_SEARCH_CONTEXT_KEY,
      parsed.href.slice(0, 800),
    );
  } catch {
    /* ignore */
  }
}

export function loadBrowseSearchUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BROWSE_SEARCH_CONTEXT_KEY)?.trim();
    if (!raw) return null;
    const parsed = new URL(raw, window.location.origin);
    if (!parsed.pathname.startsWith("/search")) return null;
    return parsed.href.slice(0, 800);
  } catch {
    return null;
  }
}

/**
 * Pure parser for captureContext.searchFilters from a search URL or querystring.
 * Only includes keys that were actually present — never invents city/price.
 */
export function searchFiltersFromSearchUrl(
  urlOrQuery: string | null | undefined,
): Record<string, unknown> | null {
  if (!urlOrQuery || typeof urlOrQuery !== "string") return null;
  let params: URLSearchParams;
  try {
    if (urlOrQuery.includes("://") || urlOrQuery.startsWith("/")) {
      const parsed = new URL(
        urlOrQuery,
        typeof window !== "undefined"
          ? window.location.origin
          : "https://houzzat.com",
      );
      if (!parsed.pathname.startsWith("/search")) return null;
      params = parsed.searchParams;
    } else {
      params = new URLSearchParams(
        urlOrQuery.startsWith("?") ? urlOrQuery.slice(1) : urlOrQuery,
      );
    }
  } catch {
    return null;
  }

  const cities: string[] = [];
  const city = params.get("city")?.trim();
  if (city) cities.push(city);
  const citiesRaw = params.get("cities")?.trim();
  if (citiesRaw) {
    for (const part of citiesRaw.split(",")) {
      const c = part.trim();
      if (c && !cities.includes(c)) cities.push(c);
    }
  }

  const maxRaw = params.get("maxPrice") ?? params.get("priceMax");
  const minRaw = params.get("minPrice") ?? params.get("priceMin");
  const bedsRaw = params.get("minBeds") ?? params.get("bedsMin");
  const propertyType = params.get("propertyType")?.trim();
  const propertyTypesRaw = params.get("propertyTypes")?.trim();
  const maxPrice =
    maxRaw != null && maxRaw !== "" && Number.isFinite(Number(maxRaw))
      ? Number(maxRaw)
      : null;
  const minPrice =
    minRaw != null && minRaw !== "" && Number.isFinite(Number(minRaw))
      ? Number(minRaw)
      : null;
  const minBeds =
    bedsRaw != null && bedsRaw !== "" && Number.isFinite(Number(bedsRaw))
      ? Number(bedsRaw)
      : null;
  const propertyTypes: string[] = [];
  if (propertyType) propertyTypes.push(propertyType);
  if (propertyTypesRaw) {
    for (const t of propertyTypesRaw.split(",")) {
      const trimmed = t.trim();
      if (trimmed) propertyTypes.push(trimmed);
    }
  }

  if (
    cities.length === 0 &&
    maxPrice == null &&
    minPrice == null &&
    minBeds == null &&
    propertyTypes.length === 0
  ) {
    return null;
  }

  return {
    ...(cities[0] ? { city: cities[0] } : {}),
    ...(cities.length ? { cities } : {}),
    ...(maxPrice != null ? { maxPrice } : {}),
    ...(minPrice != null ? { minPrice } : {}),
    ...(minBeds != null ? { minBeds } : {}),
    ...(propertyTypes[0] ? { propertyType: propertyTypes[0] } : {}),
    ...(propertyTypes.length ? { propertyTypes } : {}),
  };
}
