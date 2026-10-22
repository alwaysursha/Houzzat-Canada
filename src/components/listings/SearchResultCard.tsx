"use client";

import { Bath, Bed, Heart, Maximize2 } from "lucide-react";
import { useSavedListingToggle } from "@/components/account/useSavedListingToggle";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
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
import { syncViewListingGate } from "@/lib/auth/view-listing-intent";
import { listingPath } from "@/lib/listings/listing-path";
import { useRoyalCollectionSearchSkin } from "@/components/templates/royal-collection-one/use-royal-search-skin";
import royalSearchStyles from "@/components/templates/royal-collection-one/royal-search.module.css";
import { royalCollectionSearchCardFacts } from "@/lib/tenancy/templates/royal-collection-search-card";
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
  /** Mobile cards view: full-width stacked photo + larger type. */
  mobileFullWidth = false,
  lockedPreview = false,
}: {
  listing: ListingCardData;
  active?: boolean;
  onFocus?: () => void;
  /** Mobile split list: thumbnail beside the facts. */
  horizontal?: boolean;
  /** Mobile cards view: stacked full-width card. */
  mobileFullWidth?: boolean;
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
  const { openAuth } = useAuthModal();

  function openListingSignIn() {
    const callbackPath = `${window.location.pathname}${window.location.search}`;
    syncViewListingGate({
      blocked: true,
      mlsNumber: listing.mlsNumber,
      callbackPath,
      host: window.location.hostname,
      now: Date.now(),
      store: browserCaptureIntentStore(),
    });
    openAuth({
      mode: "sign-in",
      intent: "VIEW_LISTING",
      callbackUrl: callbackPath,
    });
  }

  const stackedMobile = mobileFullWidth && !horizontal;
  const royal = useRoyalCollectionSearchSkin();
  const royalFacts = royal ? royalCollectionSearchCardFacts(listing) : null;
  const statusLabel = showStatus
    ? listingStatusLabel(listing.status, listing.transactionType)
    : listing.transactionType === "LEASE"
      ? "For lease"
      : "For sale";

  if (royal && royalFacts) {
    const asking =
      lockedPreview
        ? "Restricted"
        : showClosedPrice
          ? null
          : royalFacts.price;
    return (
      <article
        className={cn(
          royalSearchStyles.card,
          royalSearchStyles.liveCard,
          horizontal && royalSearchStyles.liveCardRow,
        )}
      >
        <div className={cn(royalSearchStyles.media, royalSearchStyles.liveMedia)}>
          <ListingLink
            href={path}
            funnelPathClass="search_card"
            aria-label={`${street}, ${cityLine}`}
            onMouseEnter={onFocus}
            onFocus={onFocus}
            className="absolute inset-0 block"
          >
            {royalFacts.photoUrl ? (
              <ListingPhoto
                src={royalFacts.photoUrl}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 1023px) 100vw, 28vw"
              />
            ) : (
              <span className={royalSearchStyles.photoFallback}>Photograph not on file</span>
            )}
          </ListingLink>
          <span className={royalSearchStyles.badge}>{statusLabel}</span>
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
              "absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center border border-white/80 bg-white/95 text-[#0B1F3A]",
              saved && "text-[#145A46]",
            )}
          >
            <Heart
              className={cn("size-3.5", saved && "fill-[#145A46] text-[#145A46]")}
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        </div>
        <div className={royalSearchStyles.body}>
          <ListingLink
            href={path}
            funnelPathClass="search_card"
            onMouseEnter={onFocus}
            onFocus={onFocus}
            className="block min-w-0"
          >
            <p className={royalSearchStyles.meta}>
              {royalFacts.beds ? <span>{royalFacts.beds} Beds</span> : null}
              {royalFacts.baths ? <span>{royalFacts.baths} Baths</span> : null}
              {royalFacts.sqft ? <span>{royalFacts.sqft}</span> : null}
            </p>
            {royalFacts.city ? <p className={royalSearchStyles.city}>{royalFacts.city}</p> : null}
            {asking ? <p className={royalSearchStyles.price}>{asking}</p> : null}
            {showClosedPrice ? (
              <p className={royalSearchStyles.price}>
                <SoldForPrice
                  soldPrice={listing.soldPrice}
                  listPrice={listing.listPrice}
                  status={listing.status}
                  transactionType={listing.transactionType}
                  size="sm"
                />
              </p>
            ) : null}
            {!asking && !showClosedPrice && !lockedPreview ? (
              <p className={royalSearchStyles.price}>Price not on file</p>
            ) : null}
            {royalFacts.street ? <p className={royalSearchStyles.address}>{royalFacts.street}</p> : null}
            {royalFacts.propertyType ? (
              <p className={royalSearchStyles.city}>{royalFacts.propertyType}</p>
            ) : null}
            {royalFacts.brokerage ? (
              <p className={royalSearchStyles.brokerage}>Listed by {royalFacts.brokerage}</p>
            ) : null}
            {listing.mlsNumber ? (
              <p className={royalSearchStyles.city}>MLS® {listing.mlsNumber}</p>
            ) : null}
          </ListingLink>
          {lockedPreview ? (
            <button
              type="button"
              onClick={openListingSignIn}
              className="mt-2 inline-flex h-9 items-center bg-[#0B1F3A] px-3 text-[10px] font-bold tracking-[0.14em] text-[#C8A66A] uppercase"
            >
              Sign in required
            </button>
          ) : null}
          <div className="mt-auto px-0 pb-0">
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
          funnelPathClass="search_card"
          aria-label={`${street}, ${cityLine}`}
          onMouseEnter={onFocus}
          onFocus={onFocus}
          className={cn(
          "relative block h-full bg-mist",
          horizontal
            ? "min-h-[7rem]"
            : stackedMobile
              ? "aspect-[16/10] w-full min-h-[10.5rem]"
              : "aspect-[16/10] w-full",
        )}
        >
          {listing.primaryImageUrl ? (
            <ListingPhoto
              src={listing.primaryImageUrl}
              alt=""
              fill
              className="object-cover"
              sizes={
                horizontal
                  ? "136px"
                  : "(max-width: 1023px) 100vw, 28vw"
              }
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
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          horizontal && "py-2",
          stackedMobile && "pb-1",
        )}
      >
        <ListingLink
          href={path}
          funnelPathClass="search_card"
          onMouseEnter={onFocus}
          onFocus={onFocus}
          className={cn(
            "block min-w-0",
            horizontal ? "px-2.5 pt-0.5" : stackedMobile ? "px-3 pt-3" : "px-3 pt-2.5",
          )}
        >
          {lockedPreview ? (
            <p className="text-sm font-medium leading-snug text-ink/55">
              Restricted listing
            </p>
          ) : (
            <p
              className={cn(
                "truncate font-semibold leading-none tracking-tight text-ink",
                stackedMobile ? "text-[1.35rem]" : "text-lg",
              )}
            >
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
          )}
          <p
            className={cn(
              "mt-1.5 truncate font-medium text-ink",
              stackedMobile ? "text-[0.95rem]" : "text-sm",
            )}
          >
            {street}
          </p>
          <p
            className={cn(
              "truncate text-ink/50",
              stackedMobile ? "text-sm" : "text-xs",
            )}
          >
            {cityLine}
          </p>
          <p
            className={cn(
              "mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ink/70",
              stackedMobile ? "text-sm" : "text-xs",
            )}
          >
            {commercial ? null : (
              <>
                <span className="inline-flex items-center gap-1">
                  <Bed
                    className={cn(
                      "text-ink/40",
                      stackedMobile ? "size-4" : "size-3.5",
                    )}
                    aria-hidden
                  />
                  {formatListingBedsLabel(listing)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Bath
                    className={cn(
                      "text-ink/40",
                      stackedMobile ? "size-4" : "size-3.5",
                    )}
                    aria-hidden
                  />
                  {formatStat(listing.baths)}
                </span>
              </>
            )}
            {sqft ? (
              <span className="inline-flex items-center gap-1">
                <Maximize2
                  className={cn(
                    "text-ink/40",
                    stackedMobile ? "size-4" : "size-3.5",
                  )}
                  aria-hidden
                />
                {sqft}
              </span>
            ) : null}
          </p>
          <p
            className={cn(
              "mt-1 truncate text-ink/45",
              stackedMobile ? "text-sm" : "text-xs",
            )}
          >
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
          {/* Search cards: MLS® only — brokerage stays on listing detail / disclosure surfaces. */}
          {listing.mlsNumber ? (
            <p className="mt-1.5 truncate text-[10px] leading-snug text-ink/40">
              MLS® {listing.mlsNumber}
            </p>
          ) : null}
        </ListingLink>
        {lockedPreview ? (
          <div className={cn(horizontal ? "px-2.5" : "px-3")}>
            <button
              type="button"
              onClick={openListingSignIn}
              className="mt-2 inline-flex h-8 items-center rounded-full bg-canopy px-3 text-xs font-semibold text-white transition hover:bg-canopy-deep"
            >
              Sign in required
            </button>
          </div>
        ) : null}
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
