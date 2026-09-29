"use client";

import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { SearchResultCard } from "@/components/listings/SearchResultCard";
import { SearchResultsHeading } from "@/components/listings/SearchResultsContext";
import { cn } from "@/lib/utils";

export function SearchResultsPane({
  items,
  activeMls,
  onFocus,
  signedIn,
  hasClientAccess = signedIn,
  pending,
  horizontal,
  title,
  countLabel,
  wideGrid = false,
  emptyHint,
}: {
  items: ListingCardData[];
  activeMls: string | null;
  onFocus: (mls: string) => void;
  /** Session present (save / account CTAs). */
  signedIn: boolean;
  /** VOW unlock — false for visitors and verify-locked. */
  hasClientAccess?: boolean;
  pending: boolean;
  /** Mobile list: thumbnail beside the facts. */
  horizontal?: boolean;
  title: string;
  countLabel: string;
  /** Cards view on a wide screen: more than two columns when the pane is wide. */
  wideGrid?: boolean;
  emptyHint: string;
}) {
  return (
    <div
      className="h-full overflow-y-auto overscroll-contain bg-mist/40"
      style={{ containerType: "inline-size" }}
    >
      <style>{`
        @container (min-width: 40rem) {
          .search-result-grid:not(.search-result-grid-single) {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @container (min-width: 68rem) {
          .search-result-grid.search-result-grid-wide:not(.search-result-grid-single) {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @container (min-width: 90rem) {
          .search-result-grid.search-result-grid-wide:not(.search-result-grid-single) {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
      `}</style>
      <SearchResultsHeading title={title} countLabel={countLabel} />
      <div
        className={cn(
          "search-result-grid grid content-start items-start gap-3 p-3 pt-1.5 sm:gap-4 sm:p-4 sm:pt-2",
          horizontal && "search-result-grid-single grid-cols-1",
          wideGrid && "search-result-grid-wide",
        )}
      >
        {items.map((listing) => (
          <SearchResultCard
            key={listing.mlsNumber}
            listing={listing}
            active={listing.mlsNumber === activeMls}
            onFocus={() => onFocus(listing.mlsNumber)}
            horizontal={horizontal}
            lockedPreview={!hasClientAccess && listing.status !== "ACTIVE"}
          />
        ))}
        {items.length === 0 && !pending ? (
          <div className="col-span-full px-2 py-6 text-center">
            <p className="text-sm font-medium text-ink/70">
              No listings match this search.
            </p>
            <p className="mt-1 text-sm text-ink/45">{emptyHint}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
