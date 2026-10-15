/**
 * Future /property/{slug} URL helpers. Phase 2 prepares these; Phase 3 navigates.
 */

function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function propertyAddressSlug(input: {
  streetNumber?: string | null;
  streetName?: string | null;
  unitNumber?: string | null;
  city?: string | null;
  formattedAddress?: string | null;
}): string {
  const streetBits = [input.streetNumber?.trim(), input.streetName?.trim()]
    .filter(Boolean)
    .join(" ");
  let street = streetBits;
  const unit = input.unitNumber?.trim();
  if (unit && street && !new RegExp(`\\b${unit}\\b`, "i").test(street)) {
    street = `${street} Unit ${unit}`;
  }
  if (!street && input.formattedAddress?.trim()) {
    street = input.formattedAddress.split(",")[0]?.trim() || "property";
  }
  const city = input.city?.trim() || "ontario";
  return `${slugifySegment(street || "property")}-${slugifySegment(city)}`
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Canonical /property/{slug} path.
 * `address` is required for server-side re-resolve — never trust slug alone.
 */
export function propertyAddressPath(
  input: {
    streetNumber?: string | null;
    streetName?: string | null;
    unitNumber?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    formattedAddress?: string | null;
    lat?: number | null;
    lng?: number | null;
    placeId?: string | null;
  },
): string {
  const slug = propertyAddressSlug(input) || "property";
  const params = new URLSearchParams();
  const address = input.formattedAddress?.trim();
  if (address) params.set("address", address);
  if (input.lat != null && Number.isFinite(input.lat)) {
    params.set("lat", String(input.lat));
  }
  if (input.lng != null && Number.isFinite(input.lng)) {
    params.set("lng", String(input.lng));
  }
  if (input.unitNumber?.trim()) params.set("unit", input.unitNumber.trim());
  if (input.placeId?.trim()) params.set("placeId", input.placeId.trim());
  if (input.province?.trim()) params.set("province", input.province.trim());
  if (input.postalCode?.trim()) params.set("postal", input.postalCode.trim());
  const qs = params.toString();
  return qs ? `/property/${slug}?${qs}` : `/property/${slug}`;
}
