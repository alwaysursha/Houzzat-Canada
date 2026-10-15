/**
 * Pure helpers for property-address resolution (no I/O).
 */

import { parseExactAddressQuery } from "@/lib/listings/search-match";

export function normalizeUnitNumber(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim().replace(/^#\s*/, "").trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, " ");
}

/** Unit identity: null/empty matches only null/empty; never merges distinct units. */
export function unitsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeUnitNumber(a);
  const right = normalizeUnitNumber(b);
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return left.toLowerCase() === right.toLowerCase();
}

export function normalizeProvince(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const t = value.trim();
  if (t.length <= 3) return t.toUpperCase();
  const map: Record<string, string> = {
    ontario: "ON",
    quebec: "QC",
    "british columbia": "BC",
    alberta: "AB",
    manitoba: "MB",
    saskatchewan: "SK",
    "nova scotia": "NS",
    "new brunswick": "NB",
    "newfoundland and labrador": "NL",
    "prince edward island": "PE",
  };
  return map[t.toLowerCase()] ?? t;
}

/** Ontario residential resolve scope — coords roughly covering ON. */
export function isOntarioCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 41.5 &&
    lat <= 57.1 &&
    lng >= -95.2 &&
    lng <= -74.0
  );
}

export function isOntarioProvince(
  province: string | null | undefined,
): boolean {
  const p = normalizeProvince(province);
  return p === "ON" || p == null;
}

export function formatCanonicalAddress(parts: {
  streetNumber?: string | null;
  streetName?: string | null;
  unitNumber?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  fallbackLabel?: string | null;
}): string {
  const unit = normalizeUnitNumber(parts.unitNumber);
  let street = [parts.streetNumber?.trim(), parts.streetName?.trim()]
    .filter(Boolean)
    .join(" ");
  if (!street && parts.fallbackLabel?.trim()) {
    street = parts.fallbackLabel.trim();
  }
  if (unit && street && !new RegExp(`\\b${escapeRegExp(unit)}\\b`, "i").test(street)) {
    street = `${street} Unit ${unit}`;
  } else if (unit && !street) {
    street = `Unit ${unit}`;
  }
  const province = normalizeProvince(parts.province) ?? "ON";
  const cityLine = [parts.city?.trim(), province, parts.postalCode?.trim()]
    .filter(Boolean)
    .join(", ");
  return [street, cityLine].filter(Boolean).join(", ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split a resolved street label into number + name.
 * Prefer parseExactAddressQuery when the full query is available.
 */
export function splitStreetLabel(label: string): {
  streetNumber: string | null;
  streetName: string | null;
  unitNumber: string | null;
} {
  const parsed = parseExactAddressQuery(label);
  if (parsed) {
    const streetName = [parsed.streetName, parsed.streetType]
      .filter(Boolean)
      .join(" ");
    return {
      streetNumber: parsed.streetNumber,
      streetName: streetName || null,
      unitNumber: parsed.unit,
    };
  }
  const match = label.trim().match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (!match) {
    return { streetNumber: null, streetName: label.trim() || null, unitNumber: null };
  }
  return {
    streetNumber: match[1]!,
    streetName: match[2]!.trim() || null,
    unitNumber: null,
  };
}

export function looksLikeResolveAbuse(query: string): boolean {
  const q = query.trim();
  if (q.length > 200) return true;
  if ((q.match(/https?:\/\//gi) ?? []).length > 0) return true;
  if ((q.match(/[<>{}]/g) ?? []).length >= 2) return true;
  // Repeated punctuation / script-like payloads
  if (/[^\w\s#.,'/-]{4,}/u.test(q)) return true;
  return false;
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCivicNumber(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toLowerCase();
}

function municipalitiesMatch(
  requested: string | null | undefined,
  resolved: string | null | undefined,
): boolean {
  const a = requested?.trim();
  const b = resolved?.trim();
  if (!a) return true;
  if (!b) return false;
  const left = normalizeToken(a);
  const right = normalizeToken(b);
  return left === right || right.includes(left) || left.includes(right);
}

function streetNameTokens(streetName: string): string[] {
  return normalizeToken(streetName)
    .split(" ")
    .filter(
      (t) =>
        t.length > 1 &&
        !/^(st|street|rd|road|ave|avenue|dr|drive|blvd|trail|tr|crt|court|cres|crescent|way|lane|ln|pl|place|on|the|west|east|north|south|w|e|n|s)$/i.test(
          t,
        ),
    );
}

/**
 * Exact civic identity: requested number/street/city/unit vs provider hit.
 * Rejects street centroids, neighbouring houses, and wrong municipalities.
 */
export function evaluateExactAddressIdentity(input: {
  query: string;
  requestedUnit: string | null;
  hit: {
    label: string;
    city?: string | null;
    /** Provider-sourced housenumber only (not fabricated label text). */
    houseNumber?: string | null;
  };
}): { ok: true } | { ok: false; reason: string } {
  const requested = parseExactAddressQuery(input.query);
  if (!requested?.streetNumber) {
    // Non-civic queries are not exact residential resolves.
    return { ok: false, reason: "exact_civic_required" };
  }

  const providerHouse = normalizeCivicNumber(input.hit.houseNumber);
  if (!providerHouse) {
    return { ok: false, reason: "approximate_or_street_level_geocode" };
  }

  const requestedHouse = normalizeCivicNumber(requested.streetNumber);
  if (providerHouse !== requestedHouse) {
    return { ok: false, reason: "civic_number_mismatch" };
  }

  const hitParts = splitStreetLabel(input.hit.label);
  const hitHouseFromLabel = normalizeCivicNumber(hitParts.streetNumber);
  if (hitHouseFromLabel && hitHouseFromLabel !== requestedHouse) {
    return { ok: false, reason: "civic_number_mismatch" };
  }

  const requestedStreet = [requested.streetName, requested.streetType]
    .filter(Boolean)
    .join(" ");
  const hitStreet = hitParts.streetName ?? input.hit.label;
  const tokens = streetNameTokens(requestedStreet);
  const hitNorm = normalizeToken(hitStreet);
  if (tokens.length === 0) {
    if (!hitNorm.includes(normalizeToken(requested.streetName))) {
      return { ok: false, reason: "street_name_mismatch" };
    }
  } else if (!tokens.every((t) => hitNorm.includes(t))) {
    return { ok: false, reason: "street_name_mismatch" };
  }

  if (!municipalitiesMatch(requested.city, input.hit.city)) {
    return { ok: false, reason: "municipality_mismatch" };
  }

  // Requested unit must be preserved on the identity (never silently dropped
  // when the provider returns a different building-level hit without unit).
  if (input.requestedUnit) {
    const labelUnit = normalizeUnitNumber(hitParts.unitNumber);
    // Provider labels often omit unit; explicit request unit is kept by caller.
    // Only fail when the label asserts a conflicting unit.
    if (labelUnit && !unitsMatch(input.requestedUnit, labelUnit)) {
      return { ok: false, reason: "unit_mismatch" };
    }
  }

  return { ok: true };
}
