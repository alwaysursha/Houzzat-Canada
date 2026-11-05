import type { ListingCard } from "@/lib/listings/types";
import { HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE } from "@/lib/tenancy/templates/high-octane-development-listings";
import { takeRoyalFeaturedListings } from "./royal-featured-listings";

export function isDemonstrationListing(item: ListingCard): boolean {
  return item.dataSource === HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE;
}

/** Homes already occupying Featured Listings, so a later rail does not repeat them. */
export function listingsAfterFeatured(items: ListingCard[]): ListingCard[] {
  const featured = new Set(
    takeRoyalFeaturedListings(items).map((item) => item.mlsNumber),
  );
  return items.filter((item) => !featured.has(item.mlsNumber));
}

/**
 * Upcoming open houses from authorized inventory.
 * Demonstration records are omitted: a sample showing is not a public open house.
 * An event stays only while endsAt >= now, matching the rooms-open-houses API.
 */
export function upcomingOpenHouseListings(
  items: ListingCard[],
  now = Date.now(),
): ListingCard[] {
  return items.filter((item) => {
    if (isDemonstrationListing(item)) return false;
    return item.openHouses.some((openHouse) => {
      const endsAt = new Date(openHouse.endsAt).getTime();
      return Number.isFinite(endsAt) && endsAt >= now;
    });
  });
}

/** Sold rows this workspace is allowed to return. Sample inventory is never sold activity. */
export function authorizedSoldListings(items: ListingCard[]): ListingCard[] {
  return items.filter((item) => !isDemonstrationListing(item));
}

/** Lease rows from authorized inventory. Sample sales are not rental inventory. */
export function authorizedLeaseListings(items: ListingCard[]): ListingCard[] {
  return items.filter(
    (item) => !isDemonstrationListing(item) && item.transactionType === "LEASE",
  );
}

/**
 * Authenticated recommendations. Any demonstration card suppresses the set so
 * sample inventory is not presented as personal market activity.
 */
export function recommendationListings(
  items: ListingCard[],
  excludeMls: ReadonlySet<string>,
): ListingCard[] {
  if (items.length === 0 || items.some(isDemonstrationListing)) return [];
  return items.filter((item) => !excludeMls.has(item.mlsNumber));
}
