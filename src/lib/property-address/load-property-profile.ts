/**
 * Server-side /property/{slug} load. Re-resolves address identity; never trusts
 * slug / lat / sessionStorage alone.
 */

import { nearAddressHref } from "@/lib/listings/address-suggest";
import { isOffMarketPropertySearchEnabled } from "@/lib/property-address/feature-flag";
import {
  loadNeighbourhoodInsights,
  type NeighbourhoodInsights,
} from "@/lib/property-address/neighbourhood-insights";
import {
  propertyAddressPath,
  propertyAddressSlug,
} from "@/lib/property-address/property-path";
import {
  resolvePropertyAddress,
  type ResolveAddressDeps,
  type ResolvedAddressParts,
} from "@/lib/property-address/resolve-address";
import { homeValuationPrefillHref } from "@/lib/property-address/valuation-prefill";
import type { WorkspaceListingEntitlement } from "@/lib/tenancy/listing-entitlement";
import type { AddressListingStatusClass } from "@/lib/property-address/classify";

export type PropertyProfileSearchParams = {
  address?: string | string[];
  unit?: string | string[];
  placeId?: string | string[];
  lat?: string | string[];
  lng?: string | string[];
  province?: string | string[];
  postal?: string | string[];
};

export type PropertyProfileModel = {
  address: ResolvedAddressParts;
  listingStatusClass: AddressListingStatusClass;
  statusHeadline: string;
  statusDetail: string;
  nearbyHref: string | null;
  canonicalPath: string;
  activeListingPath: string | null;
  neighbourhood: NeighbourhoodInsights;
  /** Server-built from resolved address — never from raw client coords alone. */
  homeValuationHref: string;
};

export type LoadPropertyProfileResult =
  | { kind: "disabled" }
  | { kind: "redirect_listing"; href: string }
  | { kind: "redirect_canonical"; href: string }
  | { kind: "ok"; profile: PropertyProfileModel }
  | { kind: "unresolvable"; message: string };

function firstParam(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function statusCopy(
  listingStatusClass: AddressListingStatusClass,
): { headline: string; detail: string } {
  switch (listingStatusClass) {
    case "NO_ACTIVE_LISTING_FOUND":
      return {
        headline: "No active MLS listing found in our data.",
        detail:
          "This address is not currently shown as an active MLS® listing in our inventory. Claiming does not verify ownership.",
      };
    case "UNKNOWN":
      return {
        headline: "Property information",
        detail:
          "We could not confirm current MLS® listing status for this address. Search nearby homes or claim this address if you are the homeowner exploring a sale.",
      };
    case "ACTIVE_LISTING":
      return {
        headline: "Active MLS listing",
        detail: "Redirecting to the listing page.",
      };
    default: {
      const _exhaustive: never = listingStatusClass;
      return _exhaustive;
    }
  }
}

/**
 * Pure slug check for tests — canonical slug must match the URL segment.
 */
export function propertySlugMatchesResolved(
  urlSlug: string,
  address: {
    streetNumber?: string | null;
    streetName?: string | null;
    unitNumber?: string | null;
    city?: string | null;
    formattedAddress?: string | null;
  },
): boolean {
  const expected = propertyAddressSlug(address);
  const left = urlSlug.trim().toLowerCase();
  const right = expected.toLowerCase();
  return Boolean(left && right && left === right);
}

export async function loadPropertyProfile(input: {
  slug: string;
  searchParams: PropertyProfileSearchParams;
  entitlement: WorkspaceListingEntitlement | undefined;
  deps?: ResolveAddressDeps;
  /** Test seam — defaults to entitled active-only neighbourhood loader. */
  loadNeighbourhoodInsights?: typeof loadNeighbourhoodInsights;
}): Promise<LoadPropertyProfileResult> {
  if (!isOffMarketPropertySearchEnabled()) {
    return { kind: "disabled" };
  }

  const addressQuery = firstParam(input.searchParams.address);
  if (!addressQuery || addressQuery.length < 5) {
    return {
      kind: "unresolvable",
      message:
        "This property link is missing a verified address. Search again from the home page.",
    };
  }

  const unit = firstParam(input.searchParams.unit);
  const placeId = firstParam(input.searchParams.placeId);

  const resolved = await resolvePropertyAddress(
    {
      query: addressQuery,
      unitNumber: unit,
      placeId,
    },
    { entitlement: input.entitlement, deps: input.deps },
  );

  if (!resolved.ok) {
    return {
      kind: "unresolvable",
      message:
        resolved.code === "OUT_OF_SCOPE"
          ? "That address is outside our Ontario coverage."
          : "We could not confirm that exact address. Try searching again.",
    };
  }

  if (
    resolved.listingStatusClass === "ACTIVE_LISTING" &&
    resolved.activeListing?.path
  ) {
    return { kind: "redirect_listing", href: resolved.activeListing.path };
  }

  if (!propertySlugMatchesResolved(input.slug, resolved.address)) {
    const canonical = propertyAddressPath(resolved.address);
    return { kind: "redirect_canonical", href: canonical };
  }

  // Optional coord sanity — reject wildly mismatched query lat/lng (tamper).
  // Only parse when params are present — Number(null) === 0 is finite.
  const latRaw = firstParam(input.searchParams.lat);
  const lngRaw = firstParam(input.searchParams.lng);
  if (latRaw && lngRaw) {
    const urlLat = Number(latRaw);
    const urlLng = Number(lngRaw);
    if (
      Number.isFinite(urlLat) &&
      Number.isFinite(urlLng) &&
      resolved.address.lat != null &&
      resolved.address.lng != null
    ) {
      const dLat = Math.abs(urlLat - resolved.address.lat);
      const dLng = Math.abs(urlLng - resolved.address.lng);
      if (dLat > 0.05 || dLng > 0.05) {
        return {
          kind: "unresolvable",
          message:
            "This property link does not match a verified location. Search again from the home page.",
        };
      }
    }
  }

  const copy = statusCopy(resolved.listingStatusClass);
  const nearbyHref = nearAddressHref(
    {
      city: resolved.address.city ?? undefined,
      lat: resolved.address.lat ?? undefined,
      lng: resolved.address.lng ?? undefined,
    },
    "SALE",
  );

  const loadInsights =
    input.loadNeighbourhoodInsights ?? loadNeighbourhoodInsights;
  const neighbourhood = await loadInsights({
    city: resolved.address.city,
    community: resolved.address.community,
    entitlement: input.entitlement,
  });

  return {
    kind: "ok",
    profile: {
      address: resolved.address,
      listingStatusClass: resolved.listingStatusClass,
      statusHeadline: copy.headline,
      statusDetail: copy.detail,
      nearbyHref,
      canonicalPath: propertyAddressPath(resolved.address),
      activeListingPath: null,
      neighbourhood,
      homeValuationHref: homeValuationPrefillHref(resolved.address),
    },
  };
}
