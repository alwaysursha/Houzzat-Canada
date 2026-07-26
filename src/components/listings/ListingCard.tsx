import Link from "next/link";
import Image from "next/image";
import { Bath, Bed, Calendar, Car, Maximize2 } from "lucide-react";
import { ListingCardActions } from "@/components/listings/ListingCardActions";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import {
  formatListingTiming,
  formatListPrice,
  formatListingAddress,
  formatOpenHouseChip,
  isClosedListingStatus,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import { cn } from "@/lib/utils";

function formatStat(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDistanceKm(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

export function ListingCard({
  listing,
  active,
  onFocus,
  lockedPreview = false,
  distanceKm,
}: {
  listing: ListingCardData;
  active?: boolean;
  onFocus?: () => void;
  /**
   * Soft-lock preview: photo/details blurred.
   * `true` — non-interactive (homepage sold rail).
   * `"link"` — still navigates to the listing (search teasers).
   */
  lockedPreview?: boolean | "link";
  /** Only pass for near-me rails — hidden everywhere else. */
  distanceKm?: number;
}) {
  const isLocked = Boolean(lockedPreview);
  const blockInteraction = lockedPreview === true;
  const isCommercial = listing.segment === "COMMERCIAL";
  const isLease = listing.transactionType === "LEASE";
  const isClosed = isClosedListingStatus(listing.status);
  const showClosedPrice = isClosed && listing.soldPrice != null;
  const addressLines = formatListingAddress(listing);
  const shareTitle = `${listing.addressLine}, ${listing.city}`;

  const body = (
    <>
      <div
        className={cn(
          "relative aspect-[4/3] bg-mist",
          isLocked && "blur-[4px] saturate-75",
        )}
      >
        {listing.primaryImageUrl ? (
          <Image
            src={listing.primaryImageUrl}
            alt={listing.addressLine}
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
          />
        ) : null}
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1.5">
          {listing.openHouses.length > 0 ? (
            <div className="space-y-0 rounded-md bg-signal px-2.5 py-1.5 text-white shadow-sm">
              {listing.openHouses.map((oh, index) => (
                <p
                  key={`${oh.startsAt}-${oh.endsAt}`}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold tracking-wide",
                    index > 0 && "mt-1.5 border-t border-white/30 pt-1.5",
                  )}
                >
                  <Calendar
                    className="size-3.5 shrink-0 stroke-[2.5]"
                    aria-hidden
                  />
                  <span>{formatOpenHouseChip(oh.startsAt, oh.endsAt)}</span>
                </p>
              ))}
            </div>
          ) : null}
          {listing.isMock ? (
            <span className="rounded-md bg-amber px-2.5 py-1 text-xs font-bold tracking-wide text-white shadow-sm">
              Demo
            </span>
          ) : null}
        </div>
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md px-3.5 py-1.5 text-sm font-bold tracking-wide shadow-md",
              listingStatusBadgeClass(listing.status),
            )}
          >
            {listingStatusLabel(listing.status, listing.transactionType)}
          </span>
          {listing.ownerTag ? (
            <span className="rounded-md bg-signal px-3.5 py-1.5 text-sm font-bold tracking-wide text-white shadow-md">
              {listing.ownerTag}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-4 pt-4">
        <div
          className={cn(
            "flex items-start justify-between gap-3",
            isLocked && "blur-[0.6px]",
          )}
        >
          {isClosed ? (
            <SoldForPrice
              listPrice={listing.listPrice}
              soldPrice={listing.soldPrice}
              status={listing.status}
              transactionType={listing.transactionType}
              tone="light"
              locked={!showClosedPrice}
              size="md"
            />
          ) : (
            <p className="text-sm font-semibold text-ink">
              {isLease ? "Rent:" : "Listed:"}{" "}
              <span className="text-xl font-bold tracking-tight text-canopy">
                {formatListPrice(listing.listPrice, listing.transactionType)}
              </span>
            </p>
          )}
          <div className="shrink-0 space-y-0.5 pt-1 text-right text-sm font-semibold">
            <p className="text-ink/65">{formatListingTiming(listing)}</p>
            {distanceKm != null ? (
              <p className="text-canopy">{formatDistanceKm(distanceKm)}</p>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "text-[15px] leading-snug text-ink",
            isLocked && "blur-[0.6px]",
          )}
        >
          {addressLines.map((line, index) => (
            <p key={`${line}-${index}`}>
              {line}
              {index < addressLines.length - 1 ? "," : ""}
            </p>
          ))}
        </div>
        <p
          className={cn(
            "text-sm font-medium text-ink/75",
            isLocked && "blur-[2.5px]",
          )}
        >
          {propertyTypeLabel(listing.propertyType)}
        </p>

        <ul
          className={cn(
            "mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[15px] font-semibold text-ink",
            isLocked && "blur-[2.5px]",
          )}
        >
          {!isCommercial ? (
            <>
              <li className="flex items-center gap-1.5">
                <Bed
                  className="size-[18px] stroke-[2.25] text-canopy"
                  aria-hidden
                />
                <span>{formatStat(listing.beds)}</span>
                <span className="sr-only">bedrooms</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Bath
                  className="size-[18px] stroke-[2.25] text-canopy"
                  aria-hidden
                />
                <span>{formatStat(listing.baths)}</span>
                <span className="sr-only">bathrooms</span>
              </li>
            </>
          ) : null}
          {listing.sqft != null ? (
            <li className="flex items-center gap-1.5">
              <Maximize2
                className="size-[18px] stroke-[2.25] text-canopy"
                aria-hidden
              />
              <span>
                {listing.sqft.toLocaleString()}{" "}
                <span className="text-[13px] font-medium text-ink/65">sqft</span>
              </span>
            </li>
          ) : null}
          <li className="flex items-center gap-1.5">
            <Car
              className="size-[18px] stroke-[2.25] text-canopy"
              aria-hidden
            />
            <span>{listing.parkingSpaces}</span>
            <span className="sr-only">parking spaces</span>
          </li>
        </ul>
      </div>
    </>
  );

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-surface transition",
        active
          ? "border-canopy shadow-md ring-2 ring-canopy/20"
          : "border-line hover:border-canopy/50 hover:shadow-sm",
        blockInteraction && "pointer-events-none select-none",
      )}
    >
      {blockInteraction ? (
        <div className="flex flex-1 flex-col">{body}</div>
      ) : (
        <Link
          href={`/listing/${listing.mlsNumber}`}
          onMouseEnter={onFocus}
          onFocus={onFocus}
          className="flex flex-1 flex-col"
        >
          {body}
        </Link>
      )}

      <div
        className={cn(
          "mt-3 flex items-center justify-between gap-3 border-t border-line px-4 py-3",
          isLocked && "blur-[2.5px]",
        )}
      >
        {blockInteraction ? (
          <div className="flex gap-1.5">
            <span className="size-9 rounded-lg border border-line bg-mist" />
            <span className="size-9 rounded-lg border border-line bg-mist" />
          </div>
        ) : (
          <ListingCardActions
            mlsNumber={listing.mlsNumber}
            title={shareTitle}
            listingStatus={listing.status}
          />
        )}
        <p className="min-w-0 truncate text-right text-xs font-semibold uppercase tracking-wide text-ink/55">
          MLS# {listing.mlsNumber}
        </p>
      </div>

      {listing.brokerageName ? (
        <p
          className={cn(
            "border-t border-line bg-mist/60 px-4 py-2 text-[11px] leading-snug text-ink/60",
            isLocked && "blur-[2.5px]",
          )}
        >
          {listing.brokerageName}
        </p>
      ) : null}
    </article>
  );
}
