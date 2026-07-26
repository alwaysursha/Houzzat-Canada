"use client";

import Image from "next/image";
import Link from "next/link";
import { Bath, Bed, Maximize2, X } from "lucide-react";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import {
  formatListPrice,
  formatListingTiming,
  isClosedListingStatus,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import { cn } from "@/lib/utils";

/** Compact floating card shown when a map price pin is selected. */
export function SearchMapPopupCard({
  listing,
  onClose,
  onOpen,
  className,
}: {
  listing: ListingCardData;
  onClose?: () => void;
  /** When set, card opens this instead of navigating to the listing page. */
  onOpen?: () => void;
  className?: string;
}) {
  const street = listing.unitNumber
    ? `${listing.unitNumber} – ${listing.addressLine}`
    : listing.addressLine;
  const place = listing.community
    ? `${listing.community}, ${listing.city}`
    : listing.city;
  const isClosed = isClosedListingStatus(listing.status);
  const isCommercial = listing.segment === "COMMERCIAL";

  const body = (
    <>
      <div className="relative h-36 bg-mist">
        {listing.primaryImageUrl ? (
          <Image
            src={listing.primaryImageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="320px"
          />
        ) : null}
        <span
          className={cn(
            "absolute left-2.5 top-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow",
            listingStatusBadgeClass(listing.status),
          )}
        >
          {listingStatusLabel(listing.status, listing.transactionType)}
        </span>
      </div>

      <div className="space-y-1 px-3 py-2.5">
        <p className="text-base font-bold text-canopy">
          {isClosed && listing.soldPrice != null ? (
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
        <p className="text-sm font-semibold leading-snug text-ink">{street}</p>
        <p className="text-xs text-ink/55">{place}</p>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink/60">
          <span>{propertyTypeLabel(listing.propertyType)}</span>
          {!isCommercial ? (
            <>
              <span className="inline-flex items-center gap-1">
                <Bed className="size-3" aria-hidden />
                {listing.beds}
              </span>
              <span className="inline-flex items-center gap-1">
                <Bath className="size-3" aria-hidden />
                {listing.baths}
              </span>
            </>
          ) : null}
          {listing.sqft != null ? (
            <span className="inline-flex items-center gap-1">
              <Maximize2 className="size-3" aria-hidden />
              {listing.sqft.toLocaleString()}
            </span>
          ) : null}
        </p>
        <p className="pt-0.5 text-[11px] text-ink/45">
          {formatListingTiming(listing)}
        </p>
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "relative w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-xl",
        className,
      )}
    >
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-full bg-ink/55 text-white backdrop-blur-sm transition hover:bg-ink/75"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}

      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full text-left transition hover:bg-mist/40"
        >
          {body}
        </button>
      ) : (
        <Link href={`/listing/${listing.mlsNumber}`} className="block">
          {body}
        </Link>
      )}
    </div>
  );
}
