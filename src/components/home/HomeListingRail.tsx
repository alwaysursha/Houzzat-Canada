import Link from "next/link";
import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";
import { HomeRailCardsSkeleton } from "@/components/home/HomeRailCardsSkeleton";
import { ListingCard } from "@/components/listings/ListingCard";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";

export function HomeListingRail({
  id,
  title,
  subtitle,
  href,
  items,
  emptyLabel,
  loading = false,
  /** Accessible label when `title` is omitted (heading hidden). */
  railLabel,
}: {
  id?: string;
  title?: string;
  subtitle?: string;
  href: string;
  items: ListingCardData[];
  emptyLabel?: string;
  loading?: boolean;
  railLabel?: string;
}) {
  const accessibleLabel = title?.trim() || railLabel?.trim() || "Listings";

  return (
    <section
      id={id}
      aria-label={title?.trim() ? undefined : accessibleLabel}
      className="scroll-mt-[calc(var(--site-header-stack)+env(safe-area-inset-top,0px)+1.25rem)] space-y-5"
    >
      <div
        className={
          title?.trim()
            ? "flex flex-wrap items-end justify-between gap-3"
            : "flex flex-wrap items-center justify-end gap-3"
        }
      >
        {title?.trim() ? (
          <div>
            <h2 className="font-display text-2xl text-ink">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-ink/60">{subtitle}</p>
            ) : null}
          </div>
        ) : null}
        <Link href={href} className="text-sm font-semibold text-canopy">
          See all →
        </Link>
      </div>
      {loading && items.length === 0 ? (
        <HomeRailCardsSkeleton label={`Loading ${accessibleLabel}`} />
      ) : items.length === 0 ? (
        <p className="text-sm text-ink/50">{emptyLabel ?? "Nothing here yet."}</p>
      ) : (
        <FreeSwipeRail label={accessibleLabel}>
          {items.map((listing) => (
            <ListingCard key={listing.mlsNumber} listing={listing} />
          ))}
        </FreeSwipeRail>
      )}
    </section>
  );
}
