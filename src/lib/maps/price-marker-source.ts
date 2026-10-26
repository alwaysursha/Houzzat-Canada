import type { ListingCard } from "@/lib/listings/types";

/** GeoJSON source clustered by MapLibre. HTML price pills are drawn from its leaves. */
export const PRICE_MARKER_SOURCE_ID = "houzzat-price-points";

/** Screen-pixel radius that groups neighbouring prices at regional zoom. */
export const PRICE_CLUSTER_RADIUS = 52;

/** Past this zoom, every listing is its own price pill. */
export const PRICE_CLUSTER_MAX_ZOOM = 15;

export type PriceMarkerProperties = {
  mlsNumber: string;
  status: ListingCard["status"];
  transactionType: ListingCard["transactionType"];
  listPrice: number | null;
};

export type PriceMarkerFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: PriceMarkerProperties;
    geometry: { type: "Point"; coordinates: [number, number] };
  }>;
};

function hasMapCoordinate(listing: Pick<ListingCard, "lat" | "lng">): boolean {
  return (
    Number.isFinite(listing.lat) &&
    Number.isFinite(listing.lng) &&
    !(listing.lat === 0 && listing.lng === 0)
  );
}

/**
 * Points that MapLibre may cluster. The selected listing is omitted so its
 * price pill stays clickable when neighbours collapse into a count.
 */
export function priceMarkerFeatureCollection(
  listings: readonly ListingCard[],
  options?: { excludeMls?: string | null },
): PriceMarkerFeatureCollection {
  const excludeMls = options?.excludeMls ?? null;
  return {
    type: "FeatureCollection",
    features: listings
      .filter(
        (listing) =>
          hasMapCoordinate(listing) && listing.mlsNumber !== excludeMls,
      )
      .map((listing) => ({
        type: "Feature",
        properties: {
          mlsNumber: listing.mlsNumber,
          status: listing.status,
          transactionType: listing.transactionType,
          listPrice: listing.listPrice,
        },
        geometry: {
          type: "Point",
          coordinates: [listing.lng, listing.lat],
        },
      })),
  };
}
