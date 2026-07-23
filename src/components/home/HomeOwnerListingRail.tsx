import Link from "next/link";
import { HomeListingRail } from "@/components/home/HomeListingRail";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";

export function HomeOwnerListingRail({
  items,
  emptyLabel,
}: {
  items: ListingCardData[];
  emptyLabel?: string;
}) {
  if (items.length === 0 && !emptyLabel) return null;

  return (
    <div className="space-y-3">
      <HomeListingRail
        title="For sale or lease by owner"
        href="/search?dataSource=fsbo&transactionType=ALL"
        items={items}
        emptyLabel={emptyLabel}
      />
      <p className="text-sm text-ink/60">
        Own a property?{" "}
        <Link href="/owner/new" className="font-semibold text-canopy">
          List with Houzzat →
        </Link>
      </p>
    </div>
  );
}
