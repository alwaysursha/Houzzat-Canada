import Link from "next/link";
import { ListingCard } from "@/components/listings/ListingCard";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";

export function HomeListingRail({
  title,
  subtitle,
  href,
  items,
  emptyLabel,
}: {
  title: string;
  subtitle?: string;
  href: string;
  items: ListingCardData[];
  emptyLabel?: string;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-ink/60">{subtitle}</p>
          ) : null}
        </div>
        <Link href={href} className="text-sm font-semibold text-canopy">
          See all →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink/50">{emptyLabel ?? "Nothing here yet."}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((listing) => (
            <ListingCard key={listing.mlsNumber} listing={listing} />
          ))}
        </div>
      )}
    </section>
  );
}
