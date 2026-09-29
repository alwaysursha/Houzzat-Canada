"use client";

import { Bath, Bed, Heart, Maximize2 } from "lucide-react";
import { useSavedListingToggle } from "@/components/account/useSavedListingToggle";
import { ListingCardActions } from "@/components/listings/ListingCardActions";
import { ListingLink } from "@/components/listings/ListingLink";
import { ListingPhoto } from "@/components/listings/ListingPhoto";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import {
  formatListPrice,
  formatListingAddress,
  formatListingAddressOneLine,
  formatListingBedsLabel,
  isClosedListingStatus,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import { formatListingSqftLabel } from "@/lib/listings/facts";
import { listingPath } from "@/lib/listings/listing-path";
import { cn } from "@/lib/utils";

function formatStat(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Search result card. Photo stays clear of the facts.
 * The link opens the canonical listing sheet.
 */
export function SearchResultCard({
  listing,
  active = false,
  onFocus,
  horizontal = false,
  lockedPreview = false,
}: {
  listing: ListingCardData;
  active?: boolean;
  onFocus?: () => void;
  /** Mobile list: thumbnail beside the facts. */
  horizontal?: boolean;
  /** Sold/leased teaser for visitors. Still opens the listing. */
  lockedPreview?: boolean;
}) {
  const [street, cityLine] = formatListingAddress(listing);
  const commercial = listing.segment === "COMMERCIAL";
  const closed = isClosedListingStatus(listing.status);
  const showClosedPrice = closed && listing.soldPrice != null;
  const showStatus = listing.status !== "ACTIVE";
  const sqft = formatListingSqftLabel({
    sqft: listing.sqft,
    livingAreaRange: listing.livingAreaRange,
    unit: "sqft",
  });
  const path = listingPath(listing);
  const shareTitle = formatListingAddressOneLine(listing);
  const { saved, pending: savePending, ready, toggle } = useSavedListingToggle({
    mlsNumber: listing.mlsNumber,
    authCallbackUrl: path,
  });

  return (
    <article
      className={cn(
        "group relative isolate z-0 flex min-w-0 overflow-hidden rounded-xl border bg-surface transition",
        horizontal ? "flex-row" : "flex-col",
        active
          ? "border-canopy shadow-sm ring-1 ring-canopy/25"
          : "border-line/80 hover:border-ink/15",
      )}
    >
      <div
        className={cn(
          "search-result-photo relative isolate z-0 shrink-0 overflow-hidden bg-mist",
          horizontal ? "search-result-photo-h self-stretch" : "w-full",
        )}
        style={{ transform: "translateZ(0)" }}
      >
        {horizontal ? (
          <style>{`.search-result-photo-h{width:7.25rem}@media(min-width:640px){.search-result-photo-h{width:8.5rem}}`}</style>
        ) : null}
        <ListingLink
          href={path}
          aria-label={`${street}, ${cityLine}`}
          onMouseEnter={onFocus}
          onFocus={onFocus}
          className={cn(
          "relative block h-full bg-mist",
          horizontal ? "min-h-[7rem]" : "aspect-[16/10] w-full",
          lockedPreview && "blur-[3px] saturate-75",
        )}
        >
          {listing.primaryImageUrl ? (
            <ListingPhoto
              src={listing.primaryImageUrl}
              alt=""
              fill
              className="object-cover"
              sizes={horizontal ? "136px" : "(max-width: 1023px) 100vw, 28vw"}
            />
          ) : null}
        </ListingLink>
        <button
          type="button"
          aria-label={saved ? "Remove saved property" : "Save property"}
          aria-busy={savePending || !ready}
          disabled={savePending || !ready}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void toggle({ flyFrom: event.currentTarget });
          }}
          className={cn(
            "absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-full border border-white/80 bg-surface/95 text-ink shadow-sm transition hover:text-canopy",
            saved && "text-canopy",
          )}
        >
          <Heart
            className={cn("size-3.5", saved && "fill-canopy text-canopy")}
            strokeWidth={2.25}
            aria-hidden
          />
        </button>
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col", horizontal && "py-2")}>
        <ListingLink
          href={path}
          onMouseEnter={onFocus}
          onFocus={onFocus}
          className={cn(
            "block min-w-0",
            horizontal ? "px-2.5 pt-0.5" : "px-3 pt-2.5",
            lockedPreview && "blur-[2px]",
          )}
        >
          <p className="truncate text-lg font-semibold leading-none tracking-tight text-ink">
            {showClosedPrice ? (
              <SoldForPrice
                soldPrice={listing.soldPrice}
                listPrice={listing.listPrice}
                status={listing.status}
                transactionType={listing.transactionType}
                size="sm"
              />
            ) : (
              formatListPrice(listing.listPrice, listing.transactionType)
            )}
          </p>
          <p className="mt-1.5 truncate text-sm font-medium text-ink">{street}</p>
          <p className="truncate text-xs text-ink/50">{cityLine}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink/70">
            {commercial ? null : (
              <>
                <span className="inline-flex items-center gap-1">
                  <Bed className="size-3.5 text-ink/40" aria-hidden />
                  {formatListingBedsLabel(listing)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Bath className="size-3.5 text-ink/40" aria-hidden />
                  {formatStat(listing.baths)}
                </span>
              </>
            )}
            {sqft ? (
              <span className="inline-flex items-center gap-1">
                <Maximize2 className="size-3.5 text-ink/40" aria-hidden />
                {sqft}
              </span>
            ) : null}
          </p>
          <p className="mt-1 truncate text-xs text-ink/45">
            {propertyTypeLabel(listing.propertyType)}
          </p>
          {showStatus ? (
            <p className="mt-1.5">
              <span
                className={cn(
                  "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  listingStatusBadgeClass(listing.status),
                )}
              >
                {listingStatusLabel(listing.status, listing.transactionType)}
              </span>
            </p>
          ) : null}
          {listing.brokerageName || listing.mlsNumber ? (
            <p className="mt-1.5 truncate text-[10px] leading-snug text-ink/40">
              {listing.brokerageName ? `${listing.brokerageName} · ` : null}
              MLS® {listing.mlsNumber}
            </p>
          ) : null}
        </ListingLink>
        <div className={cn("mt-auto", horizontal ? "px-1.5 pb-1" : "px-1.5 pb-1.5")}>
          <ListingCardActions
            mlsNumber={listing.mlsNumber}
            title={shareTitle}
            listingStatus={listing.status}
            path={path}
            quiet
            omitHeart
            shareMenuPlacement="up"
          />
        </div>
      </div>
    </article>
  );
}
