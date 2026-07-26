"use client";

import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { CompactPropertyCard } from "@/components/listings/CompactPropertyCard";
import { ListingCard } from "@/components/listings/ListingCard";
import { cn } from "@/lib/utils";
import type { SearchViewMode } from "@/components/listings/SearchFilterChips";

export function SearchResultsPane({
  items,
  activeMls,
  onFocus,
  onOpenListing,
  signedIn,
  pending,
  view,
  emptyHint,
}: {
  items: ListingCardData[];
  activeMls: string | null;
  onFocus: (mls: string) => void;
  onOpenListing?: (mls: string) => void;
  signedIn: boolean;
  pending: boolean;
  view: SearchViewMode;
  emptyHint: string;
}) {
  const grid = view === "cards";
  const compact = view === "split";

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div
        className={cn(
          grid &&
            "grid grid-cols-1 content-start items-start gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
          compact &&
            "grid grid-cols-1 content-start gap-3 p-3 min-[1200px]:grid-cols-2",
          !grid && !compact && "space-y-2.5 p-3",
        )}
      >
        {items.map((listing) =>
          compact ? (
            <CompactPropertyCard
              key={listing.mlsNumber}
              listing={listing}
              active={listing.mlsNumber === activeMls}
              onFocus={() => onFocus(listing.mlsNumber)}
              onOpen={
                onOpenListing
                  ? () => onOpenListing(listing.mlsNumber)
                  : undefined
              }
            />
          ) : (
            <ListingCard
              key={listing.mlsNumber}
              listing={listing}
              active={listing.mlsNumber === activeMls}
              onFocus={() => onFocus(listing.mlsNumber)}
              onOpen={
                onOpenListing
                  ? () => onOpenListing(listing.mlsNumber)
                  : undefined
              }
              lockedPreview={
                !signedIn && listing.status !== "ACTIVE" ? "link" : false
              }
            />
          ),
        )}
        {items.length === 0 && !pending ? (
          <div
            className={cn(
              "rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink/55",
              (grid || compact) && "col-span-full",
            )}
          >
            {emptyHint}
          </div>
        ) : null}
      </div>
    </div>
  );
}
