"use client";

import type { ReactNode } from "react";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { SearchResultCard } from "@/components/listings/SearchResultCard";
import { SearchResultsHeading } from "@/components/listings/SearchResultsContext";
import { cn } from "@/lib/utils";

export type SearchEmptyAction = {
  label: string;
  onClick: () => void;
  tone?: "default" | "primary";
};

export function SearchResultsPane({
  items,
  activeMls,
  onFocus,
  signedIn,
  hasClientAccess = signedIn,
  pending,
  horizontal,
  mobileFullWidth = false,
  title,
  countLabel,
  countHeadline,
  emphasizeCount = false,
  wideGrid = false,
  emptyHint,
  emptyActions,
  headingTrailing,
  /** Reserve space so the fixed Chat FAB does not cover actions on narrow search. */
  mobileChatClearance = false,
}: {
  items: ListingCardData[];
  activeMls: string | null;
  onFocus: (mls: string) => void;
  /** Session present (save / account CTAs). */
  signedIn: boolean;
  /** VOW unlock — false for visitors and verify-locked. */
  hasClientAccess?: boolean;
  pending: boolean;
  /** Mobile split list: thumbnail beside the facts. */
  horizontal?: boolean;
  /** Mobile cards view: stacked full-width cards. */
  mobileFullWidth?: boolean;
  title: string;
  countLabel: string;
  countHeadline?: string;
  emphasizeCount?: boolean;
  /** Cards view on a wide screen: more than two columns when the pane is wide. */
  wideGrid?: boolean;
  emptyHint: string;
  /** Existing filter-adjustment actions when the result set is empty. */
  emptyActions?: SearchEmptyAction[];
  /** Desktop sort (and related) controls in the results heading. */
  headingTrailing?: ReactNode;
  mobileChatClearance?: boolean;
}) {
  return (
    <div
      className="h-full overflow-y-auto overscroll-contain bg-mist/50"
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
      <SearchResultsHeading
        title={title}
        countLabel={countLabel}
        countHeadline={countHeadline}
        emphasizeCount={emphasizeCount}
        trailing={headingTrailing}
      />
      <div
        className={cn(
          "search-result-grid grid content-start items-start gap-3 p-3 pt-1.5 sm:gap-4 sm:p-4 sm:pt-2",
          (horizontal || mobileFullWidth) && "search-result-grid-single grid-cols-1",
          mobileFullWidth && "gap-2.5 px-2 pt-1 sm:gap-4 sm:px-4 sm:pt-2",
          wideGrid && "search-result-grid-wide",
        )}
        style={
          mobileChatClearance
            ? {
                // Chat FAB: bottom = nav + 4.75rem, size-11 (+ gap) — keep last cards clear.
                paddingBottom:
                  "calc(var(--mobile-bottom-nav, 0px) + 4.75rem + 2.75rem + 0.75rem)",
              }
            : undefined
        }
      >
        {items.map((listing) => (
          <SearchResultCard
            key={listing.mlsNumber}
            listing={listing}
            active={listing.mlsNumber === activeMls}
            onFocus={() => onFocus(listing.mlsNumber)}
            horizontal={horizontal}
            mobileFullWidth={mobileFullWidth}
            lockedPreview={!hasClientAccess && listing.status !== "ACTIVE"}
          />
        ))}
        {items.length === 0 && !pending ? (
          <div className="col-span-full mx-auto max-w-md px-3 py-8 text-center sm:py-10">
            <p className="text-base font-semibold tracking-tight text-ink/80">
              No listings match this search.
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/45">
              {emptyHint}
            </p>
            {emptyActions && emptyActions.length > 0 ? (
              <div
                className="mt-4 flex flex-col items-stretch gap-2 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center"
                style={
                  mobileChatClearance
                    ? {
                        // Keep full-width empty actions out of the Chat FAB column.
                        paddingRight: "3.5rem",
                      }
                    : undefined
                }
              >
                {emptyActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className={cn(
                      "inline-flex h-10 items-center justify-center rounded-full px-3.5 text-xs font-semibold transition sm:h-9",
                      action.tone === "primary"
                        ? "bg-canopy text-white shadow-sm hover:bg-canopy/90"
                        : "border border-line/90 bg-surface text-ink/70 hover:border-canopy/35 hover:text-ink",
                    )}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
