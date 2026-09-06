import { Bath, Bed, Calendar, Car, Maximize2 } from "lucide-react";
import { ListingCardActions } from "@/components/listings/ListingCardActions";
import { ListingLink } from "@/components/listings/ListingLink";
import { ListingPhoto } from "@/components/listings/ListingPhoto";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import { useTemplatePresentation } from "@/components/templates/TemplatePresentationProvider";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import {
  formatListingBedsLabel,
  formatListingTiming,
  formatListPrice,
  formatListingAddress,
  formatListingAddressOneLine,
  formatOpenHouseChip,
  isClosedListingStatus,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import { formatListingSqftLabel } from "@/lib/listings/facts";
import { AGENT_SIGNATURE_TEMPLATE_ID } from "@/lib/tenancy/templates";
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
  onOpen,
  lockedPreview = false,
  lockReason = "sign-in",
  distanceKm,
}: {
  listing: ListingCardData;
  active?: boolean;
  onFocus?: () => void;
  /** When set, card opens this instead of navigating to the listing page. */
  onOpen?: () => void;
  /**
   * Soft-lock preview: photo/details blurred.
   * `true` — non-interactive (homepage sold rail).
   * `"link"` — still navigates to the listing (search teasers).
   */
  lockedPreview?: boolean | "link";
  /** Visitor vs verify-locked sold price gate copy. */
  lockReason?: "sign-in" | "verify";
  /** Only pass for near-me rails — hidden everywhere else. */
  distanceKm?: number;
}) {
  const { templateId } = useTemplatePresentation();
  const signature = templateId === AGENT_SIGNATURE_TEMPLATE_ID;
  const isLocked = Boolean(lockedPreview);
  const blockInteraction = lockedPreview === true;
  const isCommercial = listing.segment === "COMMERCIAL";
  const isLease = listing.transactionType === "LEASE";
  const isClosed = isClosedListingStatus(listing.status);
  const showClosedPrice = isClosed && listing.soldPrice != null;
  const addressLines = formatListingAddress(listing);
  const shareTitle = formatListingAddressOneLine(listing);

  const body = (
    <>
      <div
        className={cn(
          "relative shrink-0 bg-mist",
          signature ? "aspect-[5/4]" : "aspect-[4/3]",
          isLocked && "blur-[4px] saturate-75",
        )}
      >
        {listing.primaryImageUrl ? (
          <ListingPhoto
            src={listing.primaryImageUrl}
            alt={listing.addressLine}
            fill
            className={cn(
              "object-cover transition duration-500 group-hover:scale-[1.03]",
              signature && "duration-700 group-hover:scale-[1.04]",
            )}
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
          />
        ) : null}
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1.5">
          {listing.openHouses.length > 0 ? (
            <div
              className={cn(
                "space-y-0 px-2.5 py-1.5 text-white",
                signature
                  ? "bg-ink/85"
                  : "rounded-md bg-signal shadow-sm",
              )}
            >
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
              "px-3 py-1 text-xs font-semibold tracking-wide",
              signature
                ? "bg-surface/95 text-ink"
                : cn(
                    "rounded-md px-3.5 py-1.5 text-sm font-bold shadow-md",
                    listingStatusBadgeClass(listing.status),
                  ),
            )}
          >
            {listingStatusLabel(listing.status, listing.transactionType)}
          </span>
          {listing.ownerTag ? (
            <span
              className={cn(
                "px-3 py-1 text-xs font-semibold tracking-wide text-white",
                signature
                  ? "bg-ink/80"
                  : "rounded-md bg-signal px-3.5 py-1.5 text-sm font-bold shadow-md",
              )}
            >
              {listing.ownerTag}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "flex shrink-0 flex-col gap-2 px-4 pt-4",
          signature && "gap-2.5 pt-5",
        )}
      >
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
              lockReason={lockReason}
              size="md"
            />
          ) : (
            <p
              className={cn(
                "font-semibold text-ink",
                signature
                  ? "text-[11px] uppercase tracking-[0.12em] text-ink/50"
                  : "text-sm",
              )}
            >
              {isLease ? "Rent" : "Listed"}
              {signature ? "" : ":"}{" "}
              <span
                className={cn(
                  "font-bold tracking-tight",
                  signature
                    ? "mt-1 block font-display text-2xl font-normal text-ink sm:text-3xl"
                    : "text-xl text-canopy",
                )}
              >
                {formatListPrice(listing.listPrice, listing.transactionType)}
              </span>
            </p>
          )}
          <div
            className={cn(
              "shrink-0 space-y-0.5 pt-1 text-right text-sm font-semibold",
              signature && "text-xs font-medium text-ink/45",
            )}
          >
            <p className={signature ? undefined : "text-ink/65"}>
              {formatListingTiming(listing)}
            </p>
            {distanceKm != null ? (
              <p className="text-canopy">{formatDistanceKm(distanceKm)}</p>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "text-[15px] leading-snug text-ink",
            signature && "text-sm leading-relaxed text-ink/80",
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
            signature && "text-xs uppercase tracking-[0.1em] text-ink/45",
            isLocked && "blur-[2.5px]",
          )}
        >
          {propertyTypeLabel(listing.propertyType)}
        </p>

        <ul
          className={cn(
            "mt-1 flex flex-nowrap items-center gap-x-3.5 overflow-hidden text-[14px] font-semibold text-ink sm:gap-x-5 sm:text-[15px]",
            signature && "gap-x-4 text-[13px] font-medium text-ink/70 sm:text-[13px]",
            isLocked && "blur-[2.5px]",
          )}
        >
          {!isCommercial ? (
            <>
              <li className="flex shrink-0 items-center gap-1.5">
                <Bed
                  className={cn(
                    "size-[17px] stroke-[2.25] sm:size-[18px]",
                    signature ? "text-ink/50" : "text-canopy",
                  )}
                  aria-hidden
                />
                <span className="whitespace-nowrap">
                  {formatListingBedsLabel(listing)}
                </span>
                <span className="sr-only">bedrooms</span>
              </li>
              <li className="flex shrink-0 items-center gap-1.5">
                <Bath
                  className={cn(
                    "size-[17px] stroke-[2.25] sm:size-[18px]",
                    signature ? "text-ink/50" : "text-canopy",
                  )}
                  aria-hidden
                />
                <span className="whitespace-nowrap">
                  {formatStat(listing.baths)}
                </span>
                <span className="sr-only">bathrooms</span>
              </li>
            </>
          ) : null}
          {(() => {
            const sqftLabel = formatListingSqftLabel({
              sqft: listing.sqft,
              livingAreaRange: listing.livingAreaRange,
              unit: false,
            });
            if (!sqftLabel) return null;
            return (
              <li className="flex min-w-0 items-center gap-1.5">
                <Maximize2
                  className={cn(
                    "size-[17px] shrink-0 stroke-[2.25] sm:size-[18px]",
                    signature ? "text-ink/50" : "text-canopy",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 truncate whitespace-nowrap">
                  {sqftLabel}{" "}
                  <span className="text-[12.5px] font-medium text-ink/65 sm:text-[13px]">
                    sqft
                  </span>
                </span>
              </li>
            );
          })()}
          <li className="flex shrink-0 items-center gap-1.5">
            <Car
              className={cn(
                "size-[17px] stroke-[2.25] sm:size-[18px]",
                signature ? "text-ink/50" : "text-canopy",
              )}
              aria-hidden
            />
            <span className="whitespace-nowrap">{listing.parkingSpaces}</span>
            <span className="sr-only">parking spaces</span>
          </li>
        </ul>
      </div>
    </>
  );

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden border bg-surface transition",
        signature
          ? "rounded-none border-ink/10 hover:border-ink/30"
          : "rounded-2xl",
        active
          ? "border-canopy shadow-md ring-2 ring-canopy/20"
          : !signature && "border-line hover:border-canopy/50 hover:shadow-sm",
        blockInteraction && "pointer-events-none select-none",
      )}
    >
      {blockInteraction ? (
        <div className="flex flex-col">{body}</div>
      ) : (
        <ListingLink
          href={listingPath(listing)}
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
          className="flex flex-col"
        >
          {body}
        </ListingLink>
      )}

      <div
        className={cn(
          "mt-3 flex items-center justify-between gap-3 border-t border-line px-4 py-3",
          signature && "mt-4 border-ink/10 py-3",
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
            path={listingPath(listing)}
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
            signature && "border-ink/10 bg-transparent text-ink/45",
            isLocked && "blur-[2.5px]",
          )}
        >
          {listing.brokerageName}
        </p>
      ) : null}
    </article>
  );
}
