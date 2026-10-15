/**
 * Home Valuation address verification helpers (presentation / UX only).
 * Does not change sold-comp valuation math.
 *
 * Accept only precise civic locations — never invent coords or use a street
 * centroid as a house pin.
 */

import { parseExactAddressQuery } from "@/lib/listings/search-match";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import type { ResolveAddressResult } from "@/lib/property-address/resolve-address";

export type VerifiedValuationLocation = {
  address: string;
  city: string;
  community: string | null;
  province: string | null;
  lat: number;
  lng: number;
  placeId: string | null;
  streetNumber: string;
};

export const VALUATION_ADDRESS_RESELECT_MESSAGE =
  "Please select your address from the suggestions, or enter a full civic address we can verify.";

export const VALUATION_ADDRESS_UNVERIFIED_MESSAGE =
  "We could not verify that exact home location. Pick a suggestion from the list, or check the street number and city.";

function leadingCivicNumber(label: string | null | undefined): string | null {
  const parsed = parseExactAddressQuery(label ?? "");
  if (parsed?.streetNumber?.trim()) return parsed.streetNumber.trim();
  const m = /^\s*(\d+[A-Za-z]?)\b/.exec(label ?? "");
  return m?.[1] ?? null;
}

/** True when city + coordinates + civic street number are all present. */
export function isVerifiedValuationLocation(input: {
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
  houseNumber?: string | null;
}): boolean {
  if (!input.city?.trim()) return false;
  if (input.lat == null || input.lng == null) return false;
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return false;
  const civic =
    input.houseNumber?.trim() || leadingCivicNumber(input.label);
  return Boolean(civic);
}

export function formatValuationAddressLine(input: {
  label: string;
  city?: string | null;
  province?: string | null;
}): string {
  const label = input.label.trim();
  if (input.city?.trim() && input.province?.trim()) {
    return `${label}, ${input.city.trim()}, ${input.province.trim()}`;
  }
  if (input.city?.trim()) return `${label}, ${input.city.trim()}`;
  return label;
}

/**
 * Build a verified valuation location from an autocomplete / Places suggestion.
 * Returns null when city, coords, or civic number are missing (street-level).
 */
export function verifiedLocationFromSuggestion(
  suggestion: AutocompleteSuggestion & { houseNumber?: string | null },
): VerifiedValuationLocation | null {
  const city = suggestion.city?.trim() || null;
  const lat = suggestion.lat;
  const lng = suggestion.lng;
  const label = (suggestion.label || suggestion.subtitle || "").trim();
  const houseNumber =
    suggestion.houseNumber?.trim() || leadingCivicNumber(label);
  if (
    !isVerifiedValuationLocation({
      city,
      lat,
      lng,
      label,
      houseNumber,
    })
  ) {
    return null;
  }
  return {
    address: formatValuationAddressLine({
      label,
      city,
      province: suggestion.province,
    }),
    city: city!,
    community: suggestion.community?.trim() || null,
    province: suggestion.province?.trim() || null,
    lat: lat!,
    lng: lng!,
    placeId: suggestion.placeId?.trim() || null,
    streetNumber: houseNumber!,
  };
}

/**
 * Accept a property-address resolve result only when it is a precise civic match
 * with coordinates. Rejects low-confidence / street-centroid outcomes.
 */
export function verifiedLocationFromResolve(
  result: ResolveAddressResult,
): VerifiedValuationLocation | null {
  if (!result.ok) return null;
  if (result.confidence === "low") return null;
  const a = result.address;
  if (!a.city?.trim()) return null;
  if (a.lat == null || a.lng == null) return null;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return null;
  if (!a.streetNumber?.trim()) return null;
  return {
    address: a.formattedAddress.trim(),
    city: a.city.trim(),
    community: a.community?.trim() || null,
    province: a.province?.trim() || null,
    lat: a.lat,
    lng: a.lng,
    placeId: a.placeId?.trim() || null,
    streetNumber: a.streetNumber.trim(),
  };
}

/** Normalize for “did the user edit away from the verified line?” checks. */
export function normalizeAddressQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function addressQueryMatchesVerified(
  query: string,
  verifiedAddress: string,
): boolean {
  const q = normalizeAddressQuery(query);
  const v = normalizeAddressQuery(verifiedAddress);
  if (!q || !v) return false;
  return q === v || q.startsWith(v) || v.startsWith(q);
}
