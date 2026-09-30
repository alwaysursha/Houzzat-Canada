import type {
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import {
  formatListingAddressSearchLine,
  isOnMarketListingStatus,
} from "@/lib/listings/constants";
import { addressQueryKeepsAllTokens } from "@/lib/listings/search-match";
import type {
  AutocompleteOptions,
  AutocompleteSuggestion,
} from "@/lib/listings/types";
import { listingPath } from "@/lib/listings/listing-path";
import {
  buildTypesenseListingAuthorityFilter,
  composeTypesenseFilterWithAuthority,
  isListingEntitlementEnforcementEnabled,
  type TypesenseAuthorityFilterResult,
} from "@/lib/tenancy/listing-entitlement";
import type { WorkspaceListingEntitlement } from "@/lib/tenancy/listing-entitlement/types";
import {
  getTypesenseCollectionName,
  getTypesenseSearchClient,
} from "@/lib/typesense/client";
import { typesenseFlagEnabled } from "@/lib/typesense/env";
import {
  applyNeonListingStatuses,
  loadNeonListingStatusesByMls,
} from "@/lib/typesense/hydrate-status";

type TypesenseHit = {
  document: {
    mlsNumber: string;
    addressLine: string;
    unitNumber?: string;
    city: string;
    community?: string;
    province?: string;
    postalCode?: string;
    transactionType?: string;
    listPrice?: number;
    beds?: number;
    bedsLabel?: string;
    baths?: number;
    parkingSpaces?: number;
    status?: string;
    propertyType?: string;
    brokerageName?: string;
    listedAt?: number;
    updatedAtMls?: number;
    daysOnMarket?: number;
    coverImageUrl?: string;
    location?: [number, number];
  };
};

type TypesenseFacetCount = {
  counts?: Array<{ value: string; count: number }>;
  field_name?: string;
};

/** Text discovery may show any authorized status. Transaction stays a separate filter. */
function discoveryAuthorityFilter(
  entitlement: WorkspaceListingEntitlement,
): TypesenseAuthorityFilterResult {
  const active = buildTypesenseListingAuthorityFilter(
    entitlement,
    "ACTIVE_LISTINGS",
  );
  const sold = buildTypesenseListingAuthorityFilter(entitlement, "SOLD");
  if (active.kind === "empty" && sold.kind === "empty") return { kind: "empty" };
  if (active.kind === "empty") return sold;
  if (sold.kind === "empty") return active;
  if (active.filterBy === sold.filterBy) return active;
  return {
    kind: "filter",
    filterBy: `(${active.filterBy} || ${sold.filterBy})`,
  };
}

function searchParamsBase(txn?: ListingTransactionType) {
  const params = new URLSearchParams();
  if (txn) params.set("transactionType", txn);
  return params;
}

function unixToIso(seconds?: number): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function hitToSuggestion(
  doc: TypesenseHit["document"],
  q: string,
  looksLikeMls: boolean,
): AutocompleteSuggestion {
  const street = formatListingAddressSearchLine({
    addressLine: doc.addressLine,
    unitNumber: doc.unitNumber,
    city: doc.city,
    community: doc.community,
    province: doc.province || "ON",
    postalCode: doc.postalCode,
  });
  const mlsMatch = doc.mlsNumber.toLowerCase().includes(q.toLowerCase());
  const [lat, lng] = doc.location ?? [undefined, undefined];
  const imageUrl = doc.coverImageUrl
    ? listingPhotoSrc(doc.coverImageUrl) ?? doc.coverImageUrl
    : null;

  return {
    type: mlsMatch && looksLikeMls ? "mls" : "listing",
    group: mlsMatch && looksLikeMls ? "mls" : "listings",
    label: street,
    subtitle: `MLS® ${doc.mlsNumber}`,
    mlsNumber: doc.mlsNumber,
    city: doc.city,
    community: doc.community ?? null,
    province: doc.province || "ON",
    unitNumber: doc.unitNumber ?? null,
    lat,
    lng,
    href: listingPath({
      mlsNumber: doc.mlsNumber,
      addressLine: doc.addressLine,
      unitNumber: doc.unitNumber,
      city: doc.city,
    }),
    listPrice: doc.listPrice,
    beds: doc.beds,
    bedsLabel: doc.bedsLabel ?? null,
    baths: doc.baths,
    parkingSpaces: doc.parkingSpaces,
    status: doc.status as ListingStatus | undefined,
    propertyType: doc.propertyType as PropertyType | undefined,
    imageUrl,
    transactionType: doc.transactionType as ListingTransactionType | undefined,
    brokerageName: doc.brokerageName ?? null,
    listedAt: unixToIso(doc.listedAt),
    updatedAtMls: unixToIso(doc.updatedAtMls),
    daysOnMarket: doc.daysOnMarket ?? null,
  };
}

/**
 * Typesense-backed autocomplete. Returns null when disabled or on hard failure
 * so the caller can fall back to Neon.
 */
export async function typesenseAutocomplete(
  query: string,
  options?: AutocompleteOptions,
): Promise<AutocompleteSuggestion[] | null> {
  if (!typesenseFlagEnabled("TYPESENSE_AUTOCOMPLETE")) return null;

  const q = query.trim();
  if (q.length < 1) return [];

  const txn = options?.transactionType;
  const looksLikeMls =
    /^[A-Za-z]?\d[\w-]{2,}$/.test(q) || /^[A-Za-z]\d/i.test(q);

  try {
    const client = getTypesenseSearchClient();
    const collection = getTypesenseCollectionName();
    const filterParts: string[] = [];
    if (txn) filterParts.push(`transactionType:=${txn}`);
    const baseFilter = filterParts.length
      ? filterParts.join(" && ")
      : undefined;

    const enforce = isListingEntitlementEnforcementEnabled(
      options?.entitlementFilteringEnabled,
    );
    let filterBy = baseFilter;
    if (enforce) {
      const authority = discoveryAuthorityFilter(
        options?.entitlement ?? { workspaceId: "", authorities: [] },
      );
      const composed = composeTypesenseFilterWithAuthority(
        baseFilter,
        authority,
      );
      if (composed.kind === "empty") {
        return [];
      }
      filterBy = composed.filterBy;
    }

    const result = await client
      .collections(collection)
      .documents()
      .search({
        q,
        query_by:
          "mlsNumber,addressLine,unitNumber,city,community,postalCode",
        query_by_weights: "4,3,2,2,2,1",
        per_page: 28,
        prefix: true,
        num_typos: 1,
        typo_tokens_threshold: 3,
        ...(addressQueryKeepsAllTokens(q) ? { drop_tokens_threshold: 0 } : {}),
        filter_by: filterBy,
        sort_by: "_text_match:desc,listedAt:desc",
        include_fields:
          "mlsNumber,addressLine,unitNumber,city,community,province,postalCode,transactionType,listPrice,beds,bedsLabel,baths,parkingSpaces,status,propertyType,brokerageName,listedAt,updatedAtMls,daysOnMarket,coverImageUrl,location",
        facet_by: "city,community",
        max_facet_values: 8,
        exhaustive_search: false,
      });

    const hits = (result.hits ?? []) as TypesenseHit[];
    const docs = hits.map((h) => h.document);

    const neonByMls = await loadNeonListingStatusesByMls(
      docs.map((d) => d.mlsNumber),
    );
    const hydratedDocs = applyNeonListingStatuses(docs, neonByMls);

    // Keep on-market (Active + Sold/Leased Conditional) ahead of off-market hits.
    const ranked = [
      ...hydratedDocs.filter((d) =>
        isOnMarketListingStatus(d.status ?? "ACTIVE"),
      ),
      ...hydratedDocs.filter(
        (d) => !isOnMarketListingStatus(d.status ?? "ACTIVE"),
      ),
    ];

    const mlsHits: AutocompleteSuggestion[] = [];
    const listingHits: AutocompleteSuggestion[] = [];

    for (const doc of ranked) {
      const row = hitToSuggestion(doc, q, looksLikeMls);
      if (row.type === "mls") mlsHits.push(row);
      else listingHits.push(row);
    }

    const facetCounts = (result.facet_counts ?? []) as TypesenseFacetCount[];
    const cityFacet =
      facetCounts.find((f) => f.field_name === "city")?.counts ?? [];
    const communityFacet =
      facetCounts.find((f) => f.field_name === "community")?.counts ?? [];

    const citySuggestions: AutocompleteSuggestion[] = cityFacet
      .filter((c) => c.value.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 4)
      .map((c) => {
        const coords =
          ranked.find((d) => d.city === c.value)?.location ??
          docs.find((d) => d.city === c.value)?.location;
        const params = searchParamsBase(txn);
        params.set("city", c.value);
        if (coords) {
          params.set("lat", String(coords[0]));
          params.set("lng", String(coords[1]));
        }
        return {
          type: "city" as const,
          group: "cities" as const,
          label: c.value,
          subtitle: "City · ON",
          city: c.value,
          province: "ON",
          lat: coords?.[0],
          lng: coords?.[1],
          href: `/search?${params.toString()}`,
        };
      });

    const communitySuggestions: AutocompleteSuggestion[] = communityFacet
      .filter((c) => c.value && c.value.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 4)
      .map((c) => {
        const match =
          ranked.find((d) => d.community === c.value) ??
          docs.find((d) => d.community === c.value);
        const params = searchParamsBase(txn);
        if (match?.city) params.set("city", match.city);
        params.set("community", c.value);
        if (match?.location) {
          params.set("lat", String(match.location[0]));
          params.set("lng", String(match.location[1]));
        }
        return {
          type: "community" as const,
          group: "communities" as const,
          label: c.value,
          subtitle: `${match?.city ?? "ON"}, ON`,
          city: match?.city,
          community: c.value,
          province: "ON",
          lat: match?.location?.[0],
          lng: match?.location?.[1],
          href: `/search?${params.toString()}`,
        };
      });

    return [
      ...mlsHits.slice(0, 3),
      ...listingHits.slice(0, 4),
      ...citySuggestions,
      ...communitySuggestions,
    ].slice(0, 14);
  } catch (error) {
    console.error("[typesense/autocomplete]", error);
    return null;
  }
}
