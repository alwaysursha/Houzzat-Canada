import type { ListingCard } from "@/lib/listings/types";
import { HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE } from "@/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_PUBLIC_SHOWCASE_FEATURED_COUNT } from "@/lib/tenancy/templates/high-octane-public-showcase";

export const ROYAL_FEATURED_LIMIT = 3;

/**
 * Keep the first homes returned by home-rails.
 * That rail is active residential sales, newest first. It does not accept
 * price-descending order, so this must not re-rank the page as "most expensive"
 * and must not fill an empty luxury set with cheaper homes.
 * HIGH OCTANE's public showcase shows six synthetic cards. Real inventory stays at three.
 */
export function takeRoyalFeaturedListings(items: ListingCard[]): ListingCard[] {
  const showcase = items.some(
    (item) => item.dataSource === HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE,
  );
  return items.slice(
    0,
    showcase ? HIGH_OCTANE_PUBLIC_SHOWCASE_FEATURED_COUNT : ROYAL_FEATURED_LIMIT,
  );
}
