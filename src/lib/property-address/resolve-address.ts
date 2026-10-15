/**
 * Server-side Ontario residential address resolution.
 *
 * Geocode via Photon / Google Places (billing-gated) with exact civic identity
 * checks (provider housenumber + street + municipality). Active MLS via entitled
 * Neon inventory, then PropTx exact-address probe. Neon-empty alone is never
 * treated as proof of off-market — NO_ACTIVE_LISTING_FOUND requires a completed
 * authoritative PropTx (or equivalent) probe.
 *
 * No Listing writes. No sold prices / history in the response.
 */

import { ON_MARKET_LISTING_STATUSES } from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import {
  canonicalizeStreetSuffixesInQuery,
  parseExactAddressQuery,
} from "@/lib/listings/search-match";
import { photonAddressAutocomplete } from "@/lib/geo/photon-autocomplete";
import type { GooglePlaceSuggestion } from "@/lib/google/places";
import {
  googlePlaceDetails,
  googlePlacesAutocomplete,
} from "@/lib/google/places";
import { getPropTxIdxConfig, getPropTxVowConfig } from "@/lib/proptx/config";
import {
  AddressHistoryLookupError,
  fetchAllPropertiesAtExactAddress,
} from "@/lib/proptx/resolve-listing";
import {
  mapListingStatus,
  mapMlsNumber,
  type PropTxProperty,
} from "@/lib/proptx/map-listing";
import { prisma } from "@/lib/prisma";
import type { WorkspaceListingEntitlement } from "@/lib/tenancy/listing-entitlement";
import { buildPrismaEntitledInventoryWhere } from "@/lib/tenancy/listing-entitlement";
import {
  classifyAddressListingStatus,
  resolveConfidence,
  type AddressListingStatusClass,
  type AddressResolveConfidence,
  type MlsProbeOutcome,
} from "@/lib/property-address/classify";
import {
  evaluateExactAddressIdentity,
  formatCanonicalAddress,
  isOntarioCoordinate,
  isOntarioProvince,
  looksLikeResolveAbuse,
  normalizeProvince,
  normalizeUnitNumber,
  splitStreetLabel,
  unitsMatch,
} from "@/lib/property-address/normalize";

export type ResolveAddressInput = {
  query?: string | null;
  placeId?: string | null;
  unitNumber?: string | null;
  sessionToken?: string | null;
};

export type ResolvedAddressParts = {
  formattedAddress: string;
  streetNumber: string | null;
  streetName: string | null;
  unitNumber: string | null;
  city: string | null;
  /** Verified geocoder neighbourhood/district when provided — never inferred from solds. */
  community: string | null;
  province: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  provider: "photon" | "google" | "query";
};

export type ResolveAddressSuccess = {
  ok: true;
  address: ResolvedAddressParts;
  listingStatusClass: AddressListingStatusClass;
  activeListing: { mlsNumber: string; path: string } | null;
  confidence: AddressResolveConfidence;
  resolution: {
    geocodeOk: boolean;
    mlsProbe: MlsProbeOutcome["kind"];
    errors: string[];
    warnings: string[];
  };
};

export type ResolveAddressFailure = {
  ok: false;
  error: string;
  code:
    | "INVALID_INPUT"
    | "ABUSE_REJECTED"
    | "UNRESOLVABLE"
    | "OUT_OF_SCOPE";
  listingStatusClass: "UNKNOWN";
  resolution: {
    geocodeOk: false;
    mlsProbe: "skipped";
    errors: string[];
    warnings: string[];
  };
};

export type ResolveAddressResult = ResolveAddressSuccess | ResolveAddressFailure;

export type PlaceResolveHit = {
  label: string;
  city?: string | null;
  community?: string | null;
  province?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  provider: "photon" | "google";
  /** Provider housenumber only — null means street/approximate. */
  houseNumber?: string | null;
};

export type NeonActiveListingHit = {
  mlsNumber: string;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  province: string | null;
  postalCode: string | null;
};

export type ResolveAddressDeps = {
  googlePlacesEnabled: () => boolean;
  resolveGooglePlace: (
    placeId: string,
    sessionToken?: string,
  ) => Promise<PlaceResolveHit | null>;
  /** Optional Google Autocomplete for civic confirm when Photon is street-level. */
  resolveGoogleAutocomplete?: (
    query: string,
    sessionToken?: string,
  ) => Promise<Array<{ placeId: string }>>;
  resolvePhotonPlaces: (query: string) => Promise<PlaceResolveHit[]>;
  findNeonActiveAtAddress: (input: {
    streetNumber: string;
    streetName: string;
    city: string | null;
    unitNumber: string | null;
    entitlement: WorkspaceListingEntitlement | undefined;
  }) => Promise<
    | { kind: "ok"; hits: NeonActiveListingHit[] }
    | { kind: "failed"; reason: string }
    | { kind: "not_entitled" }
  >;
  propTxConfigured: () => boolean;
  findPropTxAtExactAddress: (parsed: {
    streetNumber: string;
    streetName: string;
    streetType: string | null;
    unit: string | null;
    city: string | null;
  }) => Promise<
    | { kind: "ok"; rows: PropTxProperty[] }
    | { kind: "failed"; reason: string }
  >;
};

function googlePlacesEnabledDefault(): boolean {
  return (
    process.env.GOOGLE_MAPS_BILLING_ENABLED === "1" &&
    process.env.GOOGLE_PLACES_AUTOCOMPLETE === "1" &&
    Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim())
  );
}

function suggestionToHit(
  suggestion: GooglePlaceSuggestion,
  provider: "photon" | "google",
): PlaceResolveHit {
  return {
    label: suggestion.label,
    city: suggestion.city ?? null,
    community: suggestion.community ?? null,
    province: suggestion.province ?? null,
    postalCode: suggestion.postalCode ?? null,
    lat: suggestion.lat ?? null,
    lng: suggestion.lng ?? null,
    placeId: suggestion.placeId?.trim() || null,
    provider,
    houseNumber: suggestion.houseNumber?.trim() || null,
  };
}

export function pickBestPlaceHit(
  query: string,
  hits: PlaceResolveHit[],
): PlaceResolveHit | null {
  if (hits.length === 0) return null;
  const q = query.toLowerCase().replace(/\s+/g, " ").trim();
  const requested = parseExactAddressQuery(query);
  const requestedHouse = requested?.streetNumber?.toLowerCase() ?? null;
  const scored = hits.map((hit, index) => {
    const label = hit.label.toLowerCase().replace(/\s+/g, " ").trim();
    let score = 100 + index;
    if (label === q) score = 0;
    else if (label.startsWith(q) || q.startsWith(label)) score = 1;
    else if (q.includes(label) || label.includes(q.split(",")[0]!.trim())) {
      score = 2;
    }
    if (hit.lat == null || hit.lng == null) score += 50;
    // Prefer provider-exact civic numbers; penalize street-level hits.
    const house = hit.houseNumber?.trim().toLowerCase() ?? null;
    if (requestedHouse) {
      if (!house) score += 80;
      else if (house !== requestedHouse) score += 100;
      else score -= 20;
    }
    return { hit, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.hit ?? null;
}

export const defaultResolveAddressDeps: ResolveAddressDeps = {
  googlePlacesEnabled: googlePlacesEnabledDefault,
  propTxConfigured: () =>
    Boolean(getPropTxIdxConfig() || getPropTxVowConfig()),
  async resolveGooglePlace(placeId, sessionToken) {
    const place = await googlePlaceDetails(placeId, {
      sessionToken: sessionToken || undefined,
    });
    if (!place) return null;
    return suggestionToHit(place, "google");
  },
  async resolveGoogleAutocomplete(query, sessionToken) {
    const suggestions = await googlePlacesAutocomplete(query, {
      sessionToken: sessionToken || undefined,
    });
    return suggestions
      .map((s) => ({ placeId: s.placeId?.trim() || "" }))
      .filter((s) => Boolean(s.placeId));
  },
  async resolvePhotonPlaces(query) {
    const suggestions = await photonAddressAutocomplete(query);
    return suggestions.map((s) => suggestionToHit(s, "photon"));
  },
  async findNeonActiveAtAddress(input) {
    const inventory = buildPrismaEntitledInventoryWhere({
      entitlement: input.entitlement,
      statuses: [...ON_MARKET_LISTING_STATUSES],
    });
    if (inventory.kind === "empty") {
      return { kind: "not_entitled" };
    }
    try {
      const numberToken = input.streetNumber.trim();
      const city = input.city?.trim();
      const rows = await prisma.listing.findMany({
        where: {
          AND: [
            inventory.where,
            {
              status: { in: [...ON_MARKET_LISTING_STATUSES] },
            },
            numberToken
              ? {
                  OR: [
                    {
                      addressLine: {
                        startsWith: `${numberToken} `,
                        mode: "insensitive",
                      },
                    },
                    {
                      addressLine: {
                        startsWith: `${numberToken},`,
                        mode: "insensitive",
                      },
                    },
                  ],
                }
              : {},
            city
              ? { city: { equals: city, mode: "insensitive" } }
              : {},
          ],
        },
        select: {
          mlsNumber: true,
          addressLine: true,
          unitNumber: true,
          city: true,
          province: true,
          postalCode: true,
        },
        take: 40,
        orderBy: { listedAt: "desc" },
      });

      const streetNeedle = input.streetName.toLowerCase().replace(/\s+/g, " ");
      const hits = rows.filter((row) => {
        if (!unitsMatch(input.unitNumber, row.unitNumber)) return false;
        const line = row.addressLine.toLowerCase().replace(/\s+/g, " ");
        if (!line.includes(numberToken.toLowerCase())) return false;
        // Require street name token overlap (avoid 79 Main vs 79 Grand Flats).
        const nameTokens = streetNeedle
          .split(" ")
          .filter((t) => t.length > 2 && !/^(st|rd|ave|dr|on|the)$/i.test(t));
        if (nameTokens.length === 0) return line.includes(streetNeedle);
        return nameTokens.every((t) => line.includes(t));
      });
      return { kind: "ok", hits };
    } catch (error) {
      return {
        kind: "failed",
        reason: error instanceof Error ? error.message : "neon_query_failed",
      };
    }
  },
  async findPropTxAtExactAddress(parsed) {
    try {
      const rows = await fetchAllPropertiesAtExactAddress(parsed, { max: 20 });
      return { kind: "ok", rows };
    } catch (error) {
      if (error instanceof AddressHistoryLookupError) {
        return { kind: "failed", reason: error.reason };
      }
      return {
        kind: "failed",
        reason: error instanceof Error ? error.message : "proptx_failed",
      };
    }
  },
};

function propTxStr(row: PropTxProperty, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function propTxUnit(row: PropTxProperty): string | null {
  return normalizeUnitNumber(
    propTxStr(row, "UnitNumber", "ApartmentNumber"),
  );
}

function propTxIsOnMarket(row: PropTxProperty): boolean {
  const status = mapListingStatus(row, "SALE");
  return status === "ACTIVE" || status === "SOLD_CONDITIONAL";
}

function activeListingFromNeon(hit: NeonActiveListingHit): {
  mlsNumber: string;
  path: string;
} {
  return {
    mlsNumber: hit.mlsNumber,
    path: listingPath({
      mlsNumber: hit.mlsNumber,
      addressLine: hit.addressLine,
      unitNumber: hit.unitNumber,
      city: hit.city,
      province: hit.province,
      postalCode: hit.postalCode,
    }),
  };
}

function activeListingFromPropTx(row: PropTxProperty): {
  mlsNumber: string;
  path: string;
} | null {
  const mlsNumber = mapMlsNumber(row);
  if (!mlsNumber) return null;
  const addressLine =
    propTxStr(row, "UnparsedAddress") ||
    [
      propTxStr(row, "StreetNumber"),
      propTxStr(row, "StreetName"),
      propTxStr(row, "StreetSuffix"),
    ]
      .filter(Boolean)
      .join(" ") ||
    "Address";
  const city = propTxStr(row, "City", "CityRegion") || "Ontario";
  const unitNumber = propTxUnit(row);
  const province = normalizeProvince(propTxStr(row, "StateOrProvince") ?? "ON");
  const postalCode = propTxStr(row, "PostalCode");
  return {
    mlsNumber,
    path: listingPath({
      mlsNumber,
      addressLine,
      unitNumber,
      city,
      province,
      postalCode,
    }),
  };
}

export function parseResolveAddressInput(
  input: ResolveAddressInput,
):
  | { ok: true; query: string; placeId: string | null; unitNumber: string | null; sessionToken: string | null }
  | { ok: false; code: ResolveAddressFailure["code"]; error: string } {
  const placeId = input.placeId?.trim() || null;
  const query = (input.query ?? "").replace(/\s+/g, " ").trim();
  const unitNumber = normalizeUnitNumber(input.unitNumber);
  const sessionToken = input.sessionToken?.trim() || null;

  if (!placeId && !query) {
    return { ok: false, code: "INVALID_INPUT", error: "query or placeId is required" };
  }
  if (query && query.length < 5 && !placeId) {
    return { ok: false, code: "INVALID_INPUT", error: "query is too short" };
  }
  if (query && looksLikeResolveAbuse(query)) {
    return { ok: false, code: "ABUSE_REJECTED", error: "query rejected" };
  }
  if (placeId && placeId.length > 256) {
    return { ok: false, code: "INVALID_INPUT", error: "placeId is invalid" };
  }
  return { ok: true, query, placeId, unitNumber, sessionToken };
}

async function resolvePlaceHit(
  parsed: {
    query: string;
    placeId: string | null;
    sessionToken: string | null;
  },
  deps: ResolveAddressDeps,
): Promise<
  | { ok: true; hit: PlaceResolveHit }
  | { ok: false; reason: string }
> {
  if (parsed.placeId && deps.googlePlacesEnabled()) {
    try {
      const hit = await deps.resolveGooglePlace(
        parsed.placeId,
        parsed.sessionToken ?? undefined,
      );
      if (hit?.lat != null && hit.lng != null) {
        return { ok: true, hit };
      }
      if (hit) {
        return { ok: false, reason: "google_place_incomplete" };
      }
    } catch {
      return { ok: false, reason: "google_place_failed" };
    }
  } else if (parsed.placeId && !deps.googlePlacesEnabled()) {
    // Fall through to query/Photon — do not treat billing-off as off-market.
  }

  if (!parsed.query) {
    return { ok: false, reason: "place_unresolvable" };
  }

  const photonQuery = canonicalizeStreetSuffixesInQuery(parsed.query);

  try {
    const hits = await deps.resolvePhotonPlaces(photonQuery);
    let best = pickBestPlaceHit(parsed.query, hits);

    // Photon often returns street centroids for Crt/Ct abbreviations even after
    // canonicalization. When Google Places is billing-enabled, confirm the civic
    // address via Autocomplete → Details (provider housenumber required).
    const needsCivicConfirm =
      Boolean(parseExactAddressQuery(parsed.query)?.streetNumber) &&
      (!best?.houseNumber?.trim() || best.lat == null || best.lng == null);
    if (
      needsCivicConfirm &&
      deps.googlePlacesEnabled() &&
      deps.resolveGoogleAutocomplete
    ) {
      try {
        const predictions = await deps.resolveGoogleAutocomplete(
          photonQuery,
          parsed.sessionToken ?? undefined,
        );
        for (const prediction of predictions.slice(0, 3)) {
          const googleHit = await deps.resolveGooglePlace(
            prediction.placeId,
            parsed.sessionToken ?? undefined,
          );
          if (!googleHit?.houseNumber?.trim()) continue;
          if (googleHit.lat == null || googleHit.lng == null) continue;
          const identity = evaluateExactAddressIdentity({
            query: parsed.query,
            requestedUnit: null,
            hit: {
              label: googleHit.label,
              city: googleHit.city,
              houseNumber: googleHit.houseNumber,
            },
          });
          if (identity.ok) {
            return { ok: true, hit: googleHit };
          }
        }
      } catch {
        // Fall through to Photon best / failure — never invent housenumbers.
      }
    }

    if (best?.lat != null && best.lng != null) {
      return { ok: true, hit: best };
    }
    if (hits.length > 0) {
      return { ok: false, reason: "photon_incomplete" };
    }
    return { ok: false, reason: "photon_empty" };
  } catch {
    return { ok: false, reason: "photon_failed" };
  }
}

async function probeActiveListing(input: {
  streetNumber: string;
  streetName: string;
  streetType: string | null;
  city: string | null;
  unitNumber: string | null;
  entitlement: WorkspaceListingEntitlement | undefined;
  deps: ResolveAddressDeps;
}): Promise<{ probe: MlsProbeOutcome; warnings: string[] }> {
  const warnings: string[] = [];
  const neon = await input.deps.findNeonActiveAtAddress({
    streetNumber: input.streetNumber,
    streetName: input.streetName,
    city: input.city,
    unitNumber: input.unitNumber,
    entitlement: input.entitlement,
  });

  if (neon.kind === "failed") {
    return {
      probe: { kind: "failed", reason: neon.reason },
      warnings,
    };
  }
  if (neon.kind === "not_entitled") {
    return {
      probe: { kind: "skipped", reason: "mls_inventory_not_entitled" },
      warnings,
    };
  }
  if (neon.hits.length === 1) {
    return {
      probe: { kind: "active", ...activeListingFromNeon(neon.hits[0]!) },
      warnings,
    };
  }
  if (neon.hits.length > 1) {
    // Multiple on-market rows at same unit — prefer first but warn.
    warnings.push("multiple_active_neon_matches");
    return {
      probe: { kind: "active", ...activeListingFromNeon(neon.hits[0]!) },
      warnings,
    };
  }

  // Neon empty is not authoritative proof of off-market status.
  // Without a successful PropTx (or equivalent) coverage probe → UNKNOWN.
  if (!input.deps.propTxConfigured()) {
    warnings.push("proptx_not_configured");
    return {
      probe: {
        kind: "skipped",
        reason: "authoritative_mls_provider_unavailable",
      },
      warnings,
    };
  }

  const parsedExact = {
    streetNumber: input.streetNumber,
    streetName: input.streetName,
    streetType: input.streetType,
    unit: input.unitNumber,
    city: input.city,
  };
  const proptx = await input.deps.findPropTxAtExactAddress(parsedExact);
  if (proptx.kind === "failed") {
    // Transport/timeout/error → UNKNOWN (never pretend off-market).
    return {
      probe: { kind: "failed", reason: proptx.reason },
      warnings,
    };
  }

  const onMarket = proptx.rows.filter((row) => {
    if (!propTxIsOnMarket(row)) return false;
    return unitsMatch(input.unitNumber, propTxUnit(row));
  });

  if (onMarket.length === 0) {
    return { probe: { kind: "none" }, warnings };
  }

  const listing = activeListingFromPropTx(onMarket[0]!);
  if (!listing) {
    return {
      probe: { kind: "failed", reason: "proptx_active_missing_mls" },
      warnings,
    };
  }
  warnings.push("active_from_proptx_not_neon");
  return { probe: { kind: "active", ...listing }, warnings };
}

/**
 * Resolve a residential street address for future /property profiles,
 * search wiring, and Claim Your Address prefill.
 */
export async function resolvePropertyAddress(
  input: ResolveAddressInput,
  options: {
    entitlement: WorkspaceListingEntitlement | undefined;
    deps?: ResolveAddressDeps;
  },
): Promise<ResolveAddressResult> {
  const deps = options.deps ?? defaultResolveAddressDeps;
  const parsed = parseResolveAddressInput(input);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      code: parsed.code,
      listingStatusClass: "UNKNOWN",
      resolution: {
        geocodeOk: false,
        mlsProbe: "skipped",
        errors: [parsed.code.toLowerCase()],
        warnings: [],
      },
    };
  }

  const place = await resolvePlaceHit(parsed, deps);
  if (!place.ok) {
    return {
      ok: false,
      error: "Could not resolve address.",
      code: "UNRESOLVABLE",
      listingStatusClass: "UNKNOWN",
      resolution: {
        geocodeOk: false,
        mlsProbe: "skipped",
        errors: [place.reason],
        warnings: [],
      },
    };
  }

  const hit = place.hit;
  const lat = hit.lat ?? null;
  const lng = hit.lng ?? null;
  if (lat == null || lng == null || !isOntarioCoordinate(lat, lng)) {
    return {
      ok: false,
      error: "Address is outside the supported Ontario coverage area.",
      code: "OUT_OF_SCOPE",
      listingStatusClass: "UNKNOWN",
      resolution: {
        geocodeOk: false,
        mlsProbe: "skipped",
        errors: ["out_of_scope_coordinates"],
        warnings: [],
      },
    };
  }

  const province = normalizeProvince(hit.province) ?? "ON";
  if (!isOntarioProvince(province)) {
    return {
      ok: false,
      error: "Address is outside the supported Ontario coverage area.",
      code: "OUT_OF_SCOPE",
      listingStatusClass: "UNKNOWN",
      resolution: {
        geocodeOk: false,
        mlsProbe: "skipped",
        errors: ["out_of_scope_province"],
        warnings: [],
      },
    };
  }

  const fromQuery = parsed.query ? parseExactAddressQuery(parsed.query) : null;
  const fromLabel = splitStreetLabel(hit.label);
  // Explicit request unit wins; else query/label unit. Never invent.
  const unitNumber =
    parsed.unitNumber ??
    normalizeUnitNumber(fromQuery?.unit) ??
    normalizeUnitNumber(fromLabel.unitNumber);

  // Exact civic identity — reject street centroids / wrong house / wrong city.
  if (parsed.query) {
    const identity = evaluateExactAddressIdentity({
      query: parsed.query,
      requestedUnit: unitNumber,
      hit: {
        label: hit.label,
        city: hit.city,
        houseNumber: hit.houseNumber,
      },
    });
    if (!identity.ok) {
      return {
        ok: false,
        error: "Could not resolve an exact residential address.",
        code: "UNRESOLVABLE",
        listingStatusClass: "UNKNOWN",
        resolution: {
          geocodeOk: false,
          mlsProbe: "skipped",
          errors: [identity.reason],
          warnings: [],
        },
      };
    }
  } else if (!hit.houseNumber?.trim()) {
    // placeId-only path still requires a provider civic number.
    return {
      ok: false,
      error: "Could not resolve an exact residential address.",
      code: "UNRESOLVABLE",
      listingStatusClass: "UNKNOWN",
      resolution: {
        geocodeOk: false,
        mlsProbe: "skipped",
        errors: ["approximate_or_street_level_geocode"],
        warnings: [],
      },
    };
  }

  const streetNumber =
    hit.houseNumber?.trim() ||
    fromQuery?.streetNumber ||
    fromLabel.streetNumber;
  const streetName = fromQuery
    ? [fromQuery.streetName, fromQuery.streetType].filter(Boolean).join(" ")
    : fromLabel.streetName;
  const streetType = fromQuery?.streetType ?? null;

  const city = hit.city?.trim() || fromQuery?.city || null;
  const postalCode = hit.postalCode?.trim() || null;

  const address: ResolvedAddressParts = {
    formattedAddress: formatCanonicalAddress({
      streetNumber,
      streetName,
      unitNumber,
      city,
      province,
      postalCode,
      fallbackLabel: hit.label,
    }),
    streetNumber,
    streetName,
    unitNumber,
    city,
    community: hit.community?.trim() || null,
    province,
    postalCode,
    lat,
    lng,
    placeId: hit.placeId ?? null,
    provider: hit.provider,
  };

  const errors: string[] = [];
  let warnings: string[] = [];

  if (!streetNumber || !streetName) {
    const listingStatusClass = "UNKNOWN" as const;
    return {
      ok: true,
      address,
      listingStatusClass,
      activeListing: null,
      confidence: resolveConfidence({
        geocodeOk: true,
        hasStreetNumber: Boolean(streetNumber),
        hasCity: Boolean(city),
        hasCoords: true,
        listingStatusClass,
        mlsProbe: "skipped",
      }),
      resolution: {
        geocodeOk: true,
        mlsProbe: "skipped",
        errors: ["incomplete_street_parse"],
        warnings,
      },
    };
  }

  const { probe, warnings: probeWarnings } = await probeActiveListing({
    streetNumber,
    streetName,
    streetType,
    city,
    unitNumber,
    entitlement: options.entitlement,
    deps,
  });
  warnings = [...warnings, ...probeWarnings];

  if (probe.kind === "failed") {
    errors.push(`mls_probe_${probe.reason}`);
  } else if (probe.kind === "skipped") {
    errors.push(probe.reason);
  }

  const listingStatusClass = classifyAddressListingStatus(probe);
  const activeListing =
    probe.kind === "active"
      ? { mlsNumber: probe.mlsNumber, path: probe.path }
      : null;

  return {
    ok: true,
    address,
    listingStatusClass,
    activeListing,
    confidence: resolveConfidence({
      geocodeOk: true,
      hasStreetNumber: true,
      hasCity: Boolean(city),
      hasCoords: true,
      listingStatusClass,
      mlsProbe: probe.kind,
    }),
    resolution: {
      geocodeOk: true,
      mlsProbe: probe.kind,
      errors,
      warnings,
    },
  };
}
