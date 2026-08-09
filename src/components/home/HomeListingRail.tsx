import Link from "next/link";
import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";
import { ListingCard } from "@/components/listings/ListingCard";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";

export function HomeListingRail({
  id,
  title,
  subtitle,
  href,
  items,
  emptyLabel,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  href: string;
  items: ListingCardData[];
  emptyLabel?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-[calc(var(--site-header-stack)+env(safe-area-inset-top,0px)+1.25rem)] space-y-5"
    >
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
        <FreeSwipeRail label={title}>
          {items.map((listing) => (
            <ListingCard key={listing.mlsNumber} listing={listing} />
          ))}
        </FreeSwipeRail>
      )}
    </section>
  );
}
