import type { ListingCard } from "@/lib/listings/types";

export const ROYAL_FEATURED_LIMIT = 3;

/**
 * Keep the first homes returned by home-rails.
 * That rail is active residential sales, newest first. It does not accept
 * price-descending order, so this must not re-rank the page as "most expensive"
 * and must not fill an empty luxury set with cheaper homes.
 */
export function takeRoyalFeaturedListings(items: ListingCard[]): ListingCard[] {
  return items.slice(0, ROYAL_FEATURED_LIMIT);
}
