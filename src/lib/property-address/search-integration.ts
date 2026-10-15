/**
 * Search autocomplete ↔ Phase 1 address resolver (select-time only).
 */

import { nearAddressHref } from "@/lib/listings/address-suggest";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import type { ResolveAddressResult } from "@/lib/property-address/resolve-address";
import { propertyAddressPath } from "@/lib/property-address/property-path";

export const PREPARED_PROPERTY_ADDRESS_STORAGE_KEY =
  "houzzat:prepared-property-address" as const;

export type PreparedPropertyAddress = {
  path: string;
  formattedAddress: string;
  streetNumber: string | null;
  streetName: string | null;
  unitNumber: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  listingStatusClass: "NO_ACTIVE_LISTING_FOUND";
  preparedAt: string;
};

export type SearchAddressNavDecision =
  | {
      kind: "listing";
      href: string;
      mlsNumber: string;
    }
  | {
      kind: "property_prepared";
      prepared: PreparedPropertyAddress;
      nearbyHref: string | null;
      suggestionPatch: Partial<AutocompleteSuggestion>;
    }
  | {
      kind: "nearby";
      nearbyHref: string | null;
      reason: string;
      suggestionPatch: Partial<AutocompleteSuggestion>;
    }
  | {
      kind: "unresolvable";
      nearbyHref: string | null;
      message: string;
      suggestionPatch: Partial<AutocompleteSuggestion>;
    };

export function isResidentialAddressSuggestion(
  suggestion: AutocompleteSuggestion,
): boolean {
  if (suggestion.mlsNumber) return false;
  if (suggestion.type === "listing" || suggestion.type === "mls") return false;
  if (suggestion.type === "city" || suggestion.type === "community") return false;
  if (suggestion.group === "cities" || suggestion.group === "communities") {
    return false;
  }
  if (suggestion.group === "listings" || suggestion.group === "mls") return false;
  if (suggestion.group === "around" || suggestion.group === "recent") return false;
  if (suggestion.group === "popular" || suggestion.group === "actions") {
    return false;
  }
  if (
    suggestion.action &&
    suggestion.action !== "near_address" &&
    suggestion.action !== "listings_empty"
  ) {
    // open_houses / near_me / area / city_search are not civic resolves
    if (
      suggestion.action === "near_me" ||
      suggestion.action === "open_houses" ||
      suggestion.action === "area_listings" ||
      suggestion.action === "city_search" ||
      suggestion.action === "search_for"
    ) {
      return false;
    }
  }
  return (
    suggestion.type === "place" ||
    suggestion.type === "address" ||
    suggestion.group === "addresses"
  );
}

function suggestionPatchFromAddress(address: {
  formattedAddress: string;
  streetNumber: string | null;
  streetName: string | null;
  unitNumber: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
}): Partial<AutocompleteSuggestion> {
  const streetLabel = [address.streetNumber, address.streetName]
    .filter(Boolean)
    .join(" ");
  const label =
    address.unitNumber && streetLabel
      ? `${streetLabel} Unit ${address.unitNumber}`
      : streetLabel || address.formattedAddress;
  return {
    type: "place",
    group: "addresses",
    label,
    subtitle: [address.city, address.province, address.postalCode]
      .filter(Boolean)
      .join(", "),
    city: address.city ?? undefined,
    province: address.province ?? undefined,
    postalCode: address.postalCode,
    unitNumber: address.unitNumber,
    lat: address.lat ?? undefined,
    lng: address.lng ?? undefined,
    placeId: address.placeId ?? undefined,
  };
}

export function decideSearchAddressNavigation(
  result: ResolveAddressResult,
  options: {
    transactionType?: "SALE" | "LEASE";
    fallbackLat?: number | null;
    fallbackLng?: number | null;
    fallbackCity?: string | null;
  } = {},
): SearchAddressNavDecision {
  const fallbackNearby = nearAddressHref(
    {
      city: options.fallbackCity ?? undefined,
      lat: options.fallbackLat ?? undefined,
      lng: options.fallbackLng ?? undefined,
    },
    options.transactionType,
  );

  if (!result.ok) {
    return {
      kind: "unresolvable",
      nearbyHref: fallbackNearby,
      message:
        result.code === "OUT_OF_SCOPE"
          ? "That address is outside our Ontario coverage."
          : "We could not confirm that exact address. Try Search Nearby or refine the address.",
      suggestionPatch: {},
    };
  }

  if (
    result.listingStatusClass === "ACTIVE_LISTING" &&
    result.activeListing?.path
  ) {
    return {
      kind: "listing",
      href: result.activeListing.path,
      mlsNumber: result.activeListing.mlsNumber,
    };
  }

  const patch = suggestionPatchFromAddress(result.address);
  const nearbyHref =
    nearAddressHref(
      {
        city: result.address.city ?? undefined,
        lat: result.address.lat ?? undefined,
        lng: result.address.lng ?? undefined,
      },
      options.transactionType,
    ) ?? fallbackNearby;

  if (result.listingStatusClass === "NO_ACTIVE_LISTING_FOUND") {
    const path = propertyAddressPath(result.address);
    return {
      kind: "property_prepared",
      prepared: {
        path,
        formattedAddress: result.address.formattedAddress,
        streetNumber: result.address.streetNumber,
        streetName: result.address.streetName,
        unitNumber: result.address.unitNumber,
        city: result.address.city,
        province: result.address.province,
        postalCode: result.address.postalCode,
        lat: result.address.lat,
        lng: result.address.lng,
        placeId: result.address.placeId,
        listingStatusClass: "NO_ACTIVE_LISTING_FOUND",
        preparedAt: new Date().toISOString(),
      },
      nearbyHref,
      suggestionPatch: patch,
    };
  }

  // UNKNOWN — never label off-market; nearby only.
  return {
    kind: "nearby",
    nearbyHref,
    reason: result.resolution.errors[0] ?? "listing_status_unknown",
    suggestionPatch: patch,
  };
}

export async function fetchPropertyAddressResolve(input: {
  query: string;
  placeId?: string | null;
  unitNumber?: string | null;
  sessionToken?: string | null;
}): Promise<ResolveAddressResult> {
  const res = await fetch("/api/property-address/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: input.query,
      placeId: input.placeId || undefined,
      unitNumber: input.unitNumber || undefined,
      sessionToken: input.sessionToken || undefined,
    }),
  });
  const data = (await res.json()) as ResolveAddressResult;
  return data;
}

export function rememberPreparedPropertyAddress(
  prepared: PreparedPropertyAddress,
  storage: Pick<Storage, "setItem"> | null = typeof sessionStorage !== "undefined"
    ? sessionStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      PREPARED_PROPERTY_ADDRESS_STORAGE_KEY,
      JSON.stringify(prepared),
    );
  } catch {
    // private mode / quota — ignore
  }
}

export function readPreparedPropertyAddress(
  storage: Pick<Storage, "getItem"> | null = typeof sessionStorage !== "undefined"
    ? sessionStorage
    : null,
): PreparedPropertyAddress | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREPARED_PROPERTY_ADDRESS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PreparedPropertyAddress;
  } catch {
    return null;
  }
}

/** Deduplicate address/place rows (label + city). Keeps first occurrence. */
export function dedupeAddressSuggestions(
  items: AutocompleteSuggestion[],
): AutocompleteSuggestion[] {
  const seen = new Set<string>();
  const out: AutocompleteSuggestion[] = [];
  for (const item of items) {
    if (item.type !== "place" && item.type !== "address" && item.group !== "addresses") {
      out.push(item);
      continue;
    }
    const key = `${(item.label ?? "").toLowerCase().trim()}|${(item.city ?? "").toLowerCase().trim()}|${(item.unitNumber ?? "").toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
