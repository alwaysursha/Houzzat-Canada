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
  hasClientAccess = signedIn,
  needsEmailVerification = false,
  pending,
  view,
  emptyHint,
}: {
  items: ListingCardData[];
  activeMls: string | null;
  onFocus: (mls: string) => void;
  onOpenListing?: (mls: string) => void;
  /** Session present (save / account CTAs). */
  signedIn: boolean;
  /** VOW unlock — false for visitors and verify-locked. */
  hasClientAccess?: boolean;
  /** Past grace, unverified — sold gates say verify, not sign-in. */
  needsEmailVerification?: boolean;
  pending: boolean;
  view: SearchViewMode;
  emptyHint: string;
}) {
  const lockReason = needsEmailVerification ? "verify" : "sign-in";
  const grid = view === "cards";
  const compact = view === "split";

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div
        className={cn(
          grid &&
            "grid grid-cols-1 content-start items-start gap-3 p-3 pb-4 sm:grid-cols-2 sm:gap-4 sm:p-4 xl:grid-cols-3 2xl:grid-cols-4",
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
              lockReason={lockReason}
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
                !hasClientAccess && listing.status !== "ACTIVE" ? "link" : false
              }
              lockReason={lockReason}
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
