/**
 * Server-validated Home Valuation prefill from a resolved property address.
 * Never treat client query params as proof of a verified address without resolve.
 */

import type { ResolvedAddressParts } from "@/lib/property-address/resolve-address";
import {
  resolvePropertyAddress,
  type ResolveAddressDeps,
} from "@/lib/property-address/resolve-address";
import type { WorkspaceListingEntitlement } from "@/lib/tenancy/listing-entitlement";

export type HomeValuationPrefill = {
  address: string;
  city: string;
  community: string | null;
  province: string | null;
  postalCode: string | null;
  unitNumber: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  from: "property";
};

/**
 * Build /home-valuation href from a server-resolved address only.
 */
export function homeValuationPrefillHref(address: ResolvedAddressParts): string {
  const params = new URLSearchParams();
  params.set("from", "property");
  if (address.formattedAddress.trim()) {
    params.set("address", address.formattedAddress.trim());
  }
  if (address.city?.trim()) params.set("city", address.city.trim());
  if (address.community?.trim()) {
    params.set("community", address.community.trim());
  }
  if (address.province?.trim()) params.set("province", address.province.trim());
  if (address.postalCode?.trim()) {
    params.set("postal", address.postalCode.trim());
  }
  if (address.unitNumber?.trim()) params.set("unit", address.unitNumber.trim());
  if (address.placeId?.trim()) params.set("placeId", address.placeId.trim());
  if (address.lat != null && Number.isFinite(address.lat)) {
    params.set("lat", String(address.lat));
  }
  if (address.lng != null && Number.isFinite(address.lng)) {
    params.set("lng", String(address.lng));
  }
  return `/home-valuation?${params.toString()}`;
}

export function prefillFromResolvedAddress(
  address: ResolvedAddressParts,
): HomeValuationPrefill | null {
  if (!address.formattedAddress.trim() || !address.city?.trim()) return null;
  return {
    address: address.formattedAddress.trim(),
    city: address.city.trim(),
    community: address.community?.trim() || null,
    province: address.province,
    postalCode: address.postalCode,
    unitNumber: address.unitNumber,
    lat: address.lat,
    lng: address.lng,
    placeId: address.placeId,
    from: "property",
  };
}

function firstParam(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

/**
 * Re-resolve client query params for from=property. Fail closed → null prefill.
 */
export async function loadHomeValuationPrefillFromRequest(input: {
  searchParams: Record<string, string | string[] | undefined>;
  entitlement: WorkspaceListingEntitlement | undefined;
  deps?: ResolveAddressDeps;
}): Promise<HomeValuationPrefill | null> {
  const from = firstParam(input.searchParams.from);
  if (from !== "property") return null;

  const addressQuery = firstParam(input.searchParams.address);
  if (!addressQuery || addressQuery.length < 5) return null;

  const resolved = await resolvePropertyAddress(
    {
      query: addressQuery,
      unitNumber: firstParam(input.searchParams.unit),
      placeId: firstParam(input.searchParams.placeId),
    },
    { entitlement: input.entitlement, deps: input.deps },
  );
  if (!resolved.ok) return null;

  // Reject wildly mismatched client coords (tamper).
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
      if (
        Math.abs(urlLat - resolved.address.lat) > 0.05 ||
        Math.abs(urlLng - resolved.address.lng) > 0.05
      ) {
        return null;
      }
    }
  }

  return prefillFromResolvedAddress(resolved.address);
}
