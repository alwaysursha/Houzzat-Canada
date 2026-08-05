import type {
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import type {
  AutocompleteOptions,
  AutocompleteSuggestion,
} from "@/lib/listings/types";
import {
  getTypesenseCollectionName,
  getTypesenseSearchClient,
} from "@/lib/typesense/client";
import { typesenseFlagEnabled } from "@/lib/typesense/env";

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
    baths?: number;
    status?: string;
    propertyType?: string;
    coverImageUrl?: string;
    location?: [number, number];
  };
};

type TypesenseFacetCount = {
  counts?: Array<{ value: string; count: number }>;
  field_name?: string;
};

function searchParamsBase(txn?: ListingTransactionType) {
  const params = new URLSearchParams();
  if (txn) params.set("transactionType", txn);
  return params;
}

function hitToSuggestion(
  doc: TypesenseHit["document"],
  q: string,
  looksLikeMls: boolean,
): AutocompleteSuggestion {
  const street = doc.unitNumber
    ? `${doc.addressLine} Unit ${doc.unitNumber}`
    : doc.addressLine;
  const locality = [doc.city, doc.province || "ON", doc.postalCode]
    .filter(Boolean)
    .join(", ");
  const mlsMatch = doc.mlsNumber.toLowerCase().includes(q.toLowerCase());
  const [lat, lng] = doc.location ?? [undefined, undefined];
  const imageUrl = doc.coverImageUrl
    ? listingPhotoSrc(doc.coverImageUrl) ?? doc.coverImageUrl
    : null;

  return {
    type: mlsMatch && looksLikeMls ? "mls" : "listing",
    group: mlsMatch && looksLikeMls ? "mls" : "listings",
    label: street,
    subtitle: [locality, doc.community, `MLS® ${doc.mlsNumber}`]
      .filter(Boolean)
      .join(" · "),
    mlsNumber: doc.mlsNumber,
    city: doc.city,
    community: doc.community ?? null,
    province: doc.province || "ON",
    unitNumber: doc.unitNumber ?? null,
    lat,
    lng,
    href: `/listing/${doc.mlsNumber}`,
    listPrice: doc.listPrice,
    beds: doc.beds,
    baths: doc.baths,
    status: doc.status as ListingStatus | undefined,
    propertyType: doc.propertyType as PropertyType | undefined,
    imageUrl,
    transactionType: doc.transactionType as ListingTransactionType | undefined,
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
        filter_by: filterParts.length ? filterParts.join(" && ") : undefined,
        sort_by: "_text_match:desc,listedAt:desc",
        facet_by: "city,community",
        max_facet_values: 8,
        exhaustive_search: false,
      });

    const hits = (result.hits ?? []) as TypesenseHit[];
    const docs = hits.map((h) => h.document);

    const ranked = [
      ...docs.filter((d) => d.status === "ACTIVE"),
      ...docs.filter((d) => d.status !== "ACTIVE"),
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
