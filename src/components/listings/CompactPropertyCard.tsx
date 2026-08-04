"use client";

import Link from "next/link";
import { ListingPhoto } from "@/components/listings/ListingPhoto";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import {
  formatListingAddress,
  formatListingTiming,
  isClosedListingStatus,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
  formatListPrice,
} from "@/lib/listings/constants";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import { cn } from "@/lib/utils";

function formatStat(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildStatsLine(listing: ListingCardData) {
  const parts: string[] = [propertyTypeLabel(listing.propertyType)];
  const isCommercial = listing.segment === "COMMERCIAL";

  if (!isCommercial) {
    parts.push(
      `${formatStat(listing.beds)} bd`,
      `${formatStat(listing.baths)} ba`,
    );
  }
  if (listing.sqft != null) {
    parts.push(`${listing.sqft.toLocaleString()} sqft`);
  } else if (listing.parkingSpaces > 0) {
    parts.push(`${listing.parkingSpaces} parking`);
  }

  return parts.join(" · ");
}

/**
 * compact-property-card — Concept B overlay poster.
 * Use for continuous related rails and other dense browsing strips.
 */
export function CompactPropertyCard({
  listing,
  className,
  active,
  onFocus,
  onOpen,
  lockReason = "sign-in",
}: {
  listing: ListingCardData;
  className?: string;
  active?: boolean;
  onFocus?: () => void;
  /** When set, card opens this instead of navigating to the listing page. */
  onOpen?: () => void;
  /** Visitor vs verify-locked sold price gate copy. */
  lockReason?: "sign-in" | "verify";
}) {
  const isClosed = isClosedListingStatus(listing.status);
  const showClosedPrice = isClosed && listing.soldPrice != null;
  const [street, cityLine] = formatListingAddress(listing);
  const place = listing.community
    ? `${listing.community}, ${listing.city}`
    : cityLine;

  return (
    <article
      data-compact-card
      className={cn(
        "group relative h-[340px] w-full min-w-0 shrink-0 overflow-hidden rounded-[14px] border bg-ink shadow-[0_1px_0_rgba(20,32,28,0.06)] transition duration-300 hover:-translate-y-0.5",
        active
          ? "border-canopy ring-2 ring-canopy/35"
          : "border-white/10 hover:border-canopy/40",
        className,
      )}
    >
      <Link
        href={`/listing/${listing.mlsNumber}`}
        className="absolute inset-0 block"
        aria-label={`${street}, ${place}`}
        onMouseEnter={onFocus}
        onFocus={onFocus}
        onClick={
          onOpen
            ? (event) => {
                event.preventDefault();
                onOpen();
              }
            : undefined
        }
      >
        {listing.primaryImageUrl ? (
          <ListingPhoto
            src={listing.primaryImageUrl}
            alt=""
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 bg-mist" />
        )}

        <div
          className="absolute inset-0 bg-gradient-to-b from-ink/45 via-ink/10 to-transparent"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent"
          aria-hidden
        />

        <span
          className={cn(
            "absolute left-3 top-3 rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide shadow-md",
            listingStatusBadgeClass(listing.status),
          )}
        >
          {listingStatusLabel(listing.status, listing.transactionType)}
        </span>

        <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_0_12px_rgba(0,0,0,0.55)]">
            {listing.mlsNumber}
          </span>
          {listing.ownerTag ? (
            <span className="text-xs font-bold uppercase tracking-wide text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_0_12px_rgba(0,0,0,0.55)]">
              {listing.ownerTag}
            </span>
          ) : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-3.5 pt-16">
          <div className="min-w-0">
            {isClosed ? (
              <SoldForPrice
                listPrice={listing.listPrice}
                soldPrice={listing.soldPrice}
                status={listing.status}
                transactionType={listing.transactionType}
                tone="dark"
                locked={!showClosedPrice}
                lockReason={lockReason}
                size="md"
              />
            ) : (
              <p className="text-[1.65rem] font-bold leading-none tracking-tight text-white">
                {formatListPrice(listing.listPrice, listing.transactionType)}
              </p>
            )}
          </div>

          <p className="text-sm font-medium text-white/80">
            {formatListingTiming(listing)}
          </p>

          <div className="min-w-0 space-y-1">
            <p className="truncate text-base font-semibold leading-snug text-white">
              {street}
            </p>
            <p className="truncate text-sm font-medium text-white/80">
              {place}
            </p>
          </div>

          <div className="space-y-1.5 border-t border-white/20 pt-2">
            <p className="truncate text-sm font-medium tracking-wide text-white/90">
              {buildStatsLine(listing)}
            </p>
            {listing.brokerageName ? (
              <p className="truncate text-xs font-medium leading-snug text-white/70">
                {listing.brokerageName}
              </p>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}

export function CompactPropertyCardSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-[340px] w-full min-w-0 shrink-0 animate-pulse rounded-[14px] bg-mist",
        className,
      )}
      aria-hidden
    />
  );
}
