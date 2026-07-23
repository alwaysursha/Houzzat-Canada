import { HomeListingRail } from "@/components/home/HomeListingRail";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";

export function HomeRecentlyViewedRail({
  items,
  emptyLabel,
}: {
  items: ListingCardData[];
  /** When set, the rail stays visible even with no items. */
  emptyLabel?: string;
}) {
  if (items.length === 0 && !emptyLabel) return null;

  return (
    <HomeListingRail
      title="Recently viewed"
      href="/account"
      items={items}
      emptyLabel={emptyLabel}
    />
  );
}
