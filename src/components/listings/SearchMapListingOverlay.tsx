"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowLeft,
  Bath,
  Bed,
  Car,
  Loader2,
  Maximize2,
  X,
} from "lucide-react";
import { useClientAccess } from "@/hooks/use-client-access";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { ListingNotesPanel } from "@/components/account/ListingNotesPanel";
import { ListingCardActions } from "@/components/listings/ListingCardActions";
import { ListingFactsPanel } from "@/components/listings/ListingFactsPanel";
import { ListingGalleryLive } from "@/components/listings/ListingGalleryLive";
import { ListingHistoryPanel } from "@/components/listings/ListingHistoryPanel";
import { ListingNarrative } from "@/components/listings/ListingNarrative";
import { ListingQaPanel } from "@/components/listings/ListingQaPanel";
import { ListingRelatedSection } from "@/components/listings/ListingRelatedSection";
import { DriveTimePanel } from "@/components/listings/DriveTimePanel";
import { ViewingRequestPanel } from "@/components/listings/ViewingRequestPanel";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { listingPath } from "@/lib/listings/listing-path";
import {
  formatListPrice,
  formatListingAddressOneLine,
  formatListingBedsLabel,
  formatListingTiming,
  formatPrice,
  daysOnMarketFromListedAt,
  isClosedListingStatus,
  isOnMarketListingStatus,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
  segmentLabel,
} from "@/lib/listings/constants";
import { formatBedsPlusLabel, parseListingFacts } from "@/lib/listings/facts";
import type { HistoryRow } from "@/lib/listings/history-rows";
import {
  buildListingHistoryRows,
  getLatestListPriceChange,
} from "@/lib/listings/history-rows";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { cn } from "@/lib/utils";

type OverlayListing = {
  mlsNumber: string;
  status: ListingCardData["status"];
  transactionType: ListingCardData["transactionType"];
  segment: ListingCardData["segment"];
  propertyType: ListingCardData["propertyType"];
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  baths: number;
  sqft: number | null;
  parkingSpaces: number;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  province: string | null;
  postalCode: string | null;
  description: string;
  brokerageName: string | null;
  taxes: number | null;
  maintenanceFee: number | null;
  yearBuilt: number | null;
  daysOnMarket: number;
  lat: number;
  lng: number;
  listedAt: string;
  soldAt: string | null;
  updatedAtMls: string | null;
  /** PropTx fact sheet JSON from Listing.facts */
  facts?: unknown;
  media: Array<{ id: string; url: string; isPrimary?: boolean }>;
  openHouses: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    notes: string | null;
  }>;
  history: Array<{
    id: string;
    event: string;
    price: number | null;
    originalPrice?: number | null;
    contractDate: string;
    lastUpdatedAt?: string | null;
    externalMls?: string | null;
    visibility?: string | null;
  }>;
};

/** Full listing detail experience opened from map view — scrolls inside the popup. */
export function SearchMapListingOverlay({
  listing: card,
  onClose,
}: {
  listing: ListingCardData;
  onClose: () => void;
}) {
  const titleId = useId();
  const access = useClientAccess();
  const signedIn = access.isSignedIn;
  const hasClientAccess = access.hasClientAccess;
  const lockReason = access.needsEmailVerification ? "verify" : "sign-in";
  const [entered, setEntered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [detail, setDetail] = useState<OverlayListing | null>(null);
  const [addressHistoryRows, setAddressHistoryRows] = useState<
    HistoryRow[] | null
  >(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const release = acquireScrollLock();
    const frame = window.requestAnimationFrame(() => setEntered(true));

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      window.cancelAnimationFrame(frame);
      release();
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setAddressHistoryRows(null);
    setLoadError(false);

    void (async () => {
      try {
        const res = await fetch(`/api/listings/${card.mlsNumber}`);
        if (!res.ok) throw new Error("not found");
        const data = (await res.json()) as {
          listing?: OverlayListing;
          historyRows?: HistoryRow[];
        };
        if (!cancelled && data.listing) {
          setDetail(data.listing);
          setAddressHistoryRows(
            Array.isArray(data.historyRows) ? data.historyRows : null,
          );
        } else if (!cancelled) {
          setLoadError(true);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [card.mlsNumber]);

  const listing = detail;
  const isClosed = isClosedListingStatus(
    listing?.status ?? card.status,
  );
  const isInactive = !isOnMarketListingStatus(listing?.status ?? card.status);
  const detailsLocked = isInactive && !hasClientAccess;
  const isCommercial =
    (listing?.segment ?? card.segment) === "COMMERCIAL";
  const addressLabel = formatListingAddressOneLine(listing ?? card);
  const bedsLabel =
    (listing
      ? formatBedsPlusLabel(listing.beds, parseListingFacts(listing.facts))
      : null) ?? formatListingBedsLabel(card);

  const coverTagLabel = listingStatusLabel(
    listing?.status ?? card.status,
    listing?.transactionType ?? card.transactionType,
  );
  const segment = listing?.segment ?? card.segment ?? "RESIDENTIAL";
  const segmentTagMeta = {
    label: segmentLabel(segment),
    tone:
      segment === "COMMERCIAL"
        ? ("commercial" as const)
        : segment === "PRE_CONSTRUCTION"
          ? ("preconstruction" as const)
          : ("residential" as const),
  };

  const latestPriceChange = useMemo(() => {
    if (!listing) return null;
    return getLatestListPriceChange(listing.history, listing.mlsNumber, {
      includeRestricted: hasClientAccess,
    });
  }, [listing, hasClientAccess]);

  const historyRows = useMemo(() => {
    if (addressHistoryRows) return addressHistoryRows;
    if (!listing) return [];
    return buildListingHistoryRows({
      mlsNumber: listing.mlsNumber,
      listPrice: listing.listPrice,
      listedAt: listing.listedAt,
      updatedAtMls: listing.updatedAtMls,
      soldAt: listing.soldAt,
      soldPrice: listing.soldPrice,
      status: listing.status,
      transactionType: listing.transactionType,
      history: listing.history,
    });
  }, [addressHistoryRows, listing]);

  const upcomingOpenHouses = useMemo(() => {
    if (!listing) return [];
    const now = Date.now();
    return listing.openHouses.filter(
      (oh) => new Date(oh.endsAt).getTime() >= now,
    );
  }, [listing]);

  const similarHomesHref = useMemo(() => {
    const source = listing ?? card;
    const params = new URLSearchParams();
    params.set("status", "ACTIVE");
    params.set("transactionType", source.transactionType);
    params.set("city", source.city);
    if (source.community) params.set("community", source.community);
    if ("segment" in source && source.segment) {
      params.set("segment", source.segment);
    }
    params.set("propertyType", source.propertyType);
    params.set("minBeds", String(Math.floor(source.beds)));
    return `/search?${params.toString()}`;
  }, [listing, card]);

  const photos = listing
    ? listing.media.map((m) => ({ id: m.id, url: m.url }))
    : card.primaryImageUrl
      ? [{ id: "cover", url: card.primaryImageUrl }]
      : [];

  const shareTitle = formatListingAddressOneLine(card);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80]"
      role="presentation"
    >
      <div
        className={cn(
          "absolute inset-0 bg-ink/50 transition-opacity duration-200",
          entered ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
        onMouseDown={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute inset-0 flex flex-col bg-mist transition duration-200 sm:inset-2 sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl md:inset-3 lg:inset-4",
          entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-2 py-2 sm:rounded-t-2xl sm:px-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-ink/70 transition hover:bg-mist hover:text-ink"
            aria-label="Back to search"
          >
            <ArrowLeft className="size-5" aria-hidden />
            <span className="hidden sm:inline">Back to search</span>
          </button>
          <div className="min-w-0 flex-1">
            <p
              id={titleId}
              className="truncate text-sm font-semibold text-ink"
            >
              {addressLabel}
            </p>
            <p className="truncate text-xs text-ink/50">
              {card.city}
              {card.community ? ` · ${card.community}` : ""}
            </p>
          </div>
          <ListingCardActions
            mlsNumber={card.mlsNumber}
            title={shareTitle}
            listingStatus={card.status}
            path={listingPath(card)}
            shareMenuPlacement="down"
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-full text-ink/70 transition hover:bg-mist hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-4 sm:px-6 sm:py-6 lg:max-w-7xl">
            <ListingGalleryLive
              addressLabel={addressLabel}
              mlsNumber={card.mlsNumber}
              callbackPath={listingPath(card)}
              coverTag={coverTagLabel}
              coverTagClassName={listingStatusBadgeClass(
                listing?.status ?? card.status,
              )}
              segmentTag={segmentTagMeta}
              allowBooking={!isInactive}
              detailsLocked={detailsLocked}
              needsEmailVerification={access.needsEmailVerification}
              mapSubject={
                Number.isFinite(card.lat) && Number.isFinite(card.lng)
                  ? {
                      mlsNumber: card.mlsNumber,
                      lat: listing?.lat ?? card.lat,
                      lng: listing?.lng ?? card.lng,
                      addressLabel,
                      city: card.city,
                      listPrice: listing?.listPrice ?? card.listPrice,
                      transactionType:
                        listing?.transactionType ?? card.transactionType,
                      status: listing?.status ?? card.status,
                      propertyType:
                        listing?.propertyType ?? card.propertyType,
                      beds: listing?.beds ?? card.beds,
                      bedsLabel:
                        listing != null
                          ? formatBedsPlusLabel(
                              listing.beds,
                              parseListingFacts(listing.facts),
                            )
                          : (card.bedsLabel ?? null),
                      baths: listing?.baths ?? card.baths,
                      sqft: listing?.sqft ?? card.sqft,
                      primaryImageUrl:
                        photos[0]?.url ?? card.primaryImageUrl,
                      unitNumber: listing?.unitNumber ?? card.unitNumber,
                      addressLine:
                        listing?.addressLine ?? card.addressLine,
                      postalCode:
                        listing?.postalCode ?? card.postalCode,
                      province: listing?.province ?? card.province,
                    }
                  : undefined
              }
              photos={photos}
            />

            {!listing && !loadError ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink/55">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading listing details…
              </div>
            ) : null}

            {loadError && !listing ? (
              <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink/60">
                Couldn’t load full details.{" "}
                <Link
                  href={listingPath(card)}
                  className="font-semibold text-canopy hover:underline"
                >
                  Open listing page
                </Link>
              </div>
            ) : null}

            {listing ? (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="min-w-0 space-y-6">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-3">
                        {isClosed && listing.soldPrice != null ? (
                          <SoldForPrice
                            listPrice={listing.listPrice}
                            soldPrice={listing.soldPrice}
                            status={listing.status}
                            transactionType={listing.transactionType}
                            tone="light"
                            locked={detailsLocked}
                            lockReason={lockReason}
                            size="lg"
                          />
                        ) : detailsLocked ? (
                          <p className="text-3xl font-bold tracking-tight text-ink/55">
                            {lockReason === "verify"
                              ? "Email verification required"
                              : "Sign in required"}
                          </p>
                        ) : (
                          <p className="text-3xl font-bold tracking-tight text-canopy sm:text-4xl">
                            {formatListPrice(
                              listing.listPrice,
                              listing.transactionType,
                            )}
                          </p>
                        )}
                        {latestPriceChange && !detailsLocked ? (
                          <span
                            className={
                              latestPriceChange.delta < 0
                                ? "inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger"
                                : "inline-flex items-center gap-1 rounded-full bg-canopy/10 px-2.5 py-1 text-[11px] font-bold text-canopy-deep"
                            }
                          >
                            {latestPriceChange.delta < 0 ? "−" : "+"}
                            {formatPrice(Math.abs(latestPriceChange.delta))}
                          </span>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-right text-sm font-medium leading-snug text-ink/55">
                        {formatListingTiming(listing)}
                      </p>
                    </div>

                    <h2 className="text-lg font-medium text-ink/80">
                      {detailsLocked ? (
                        <span className="select-none blur-[5px]">
                          {addressLabel}
                        </span>
                      ) : (
                        addressLabel
                      )}
                    </h2>

                    <p className="text-sm text-ink/55">
                      {propertyTypeLabel(listing.propertyType)}
                      {" · "}
                      MLS® {listing.mlsNumber}
                    </p>

                    <div
                      className={cn(
                        "grid gap-2 pt-1",
                        isCommercial ? "grid-cols-2" : "grid-cols-4",
                        detailsLocked && "select-none blur-[5px]",
                      )}
                    >
                      {!isCommercial ? (
                        <>
                          <div className="flex flex-col items-center gap-1.5 text-center">
                            <Bed className="size-6 text-ink" aria-hidden />
                            <span className="text-sm font-semibold">
                              {bedsLabel.includes("+")
                                ? bedsLabel
                                : `${bedsLabel} ${bedsLabel === "1" ? "Bed" : "Beds"}`}
                            </span>
                          </div>
                          <div className="flex flex-col items-center gap-1.5 text-center">
                            <Bath className="size-6 text-ink" aria-hidden />
                            <span className="text-sm font-semibold">
                              {listing.baths}{" "}
                              {listing.baths === 1 ? "Bath" : "Baths"}
                            </span>
                          </div>
                        </>
                      ) : null}
                      <div className="flex flex-col items-center gap-1.5 text-center">
                        <Maximize2 className="size-6 text-ink" aria-hidden />
                        <span className="text-sm font-semibold">
                          {listing.sqft
                            ? `${listing.sqft.toLocaleString()} SqFt`
                            : "n/a SqFt"}
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-1.5 text-center">
                        <Car className="size-6 text-ink" aria-hidden />
                        <span className="text-sm font-semibold">
                          {listing.parkingSpaces}{" "}
                          {listing.parkingSpaces === 1
                            ? "Parking"
                            : "Parkings"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <ListingNarrative body={listing.description} />

                  <ListingQaPanel
                    mlsNumber={listing.mlsNumber}
                    addressLine={addressLabel}
                    city={listing.city}
                    title="Ask about this home"
                    hint="Ask a question grounded in this listing."
                  />

                  <DriveTimePanel
                    originLat={listing.lat}
                    originLng={listing.lng}
                  />

                  <ListingHistoryPanel
                    mlsNumber={listing.mlsNumber}
                    addressLabel={`${addressLabel}, ${listing.city}`}
                    propertyType={listing.propertyType}
                    transactionType={listing.transactionType}
                    callbackPath={listingPath(listing)}
                    canSeeRestricted={hasClientAccess}
                    signedIn={signedIn}
                    enableAddressHistoryEnrich
                    rows={historyRows}
                  />

                  <ListingFactsPanel
                    facts={listing.facts}
                    propertyTypeLabel={propertyTypeLabel(listing.propertyType)}
                    mlsNumber={listing.mlsNumber}
                    community={listing.community}
                    postalCode={listing.postalCode}
                    taxesLabel={
                      listing.taxes ? formatPrice(listing.taxes) : null
                    }
                    maintenanceLabel={
                      listing.maintenanceFee
                        ? `${formatPrice(listing.maintenanceFee)}/mo`
                        : null
                    }
                    parkingSpaces={listing.parkingSpaces}
                    yearBuilt={listing.yearBuilt}
                    sqftLabel={
                      listing.sqft
                        ? `${listing.sqft.toLocaleString()} sqft`
                        : null
                    }
                    daysOnMarket={daysOnMarketFromListedAt(listing)}
                    brokerageName={listing.brokerageName}
                    beds={listing.beds}
                    baths={listing.baths}
                  />

                  <ListingRelatedSection
                    subject={{
                      mlsNumber: listing.mlsNumber,
                      city: listing.city,
                      community: listing.community,
                      propertyType: listing.propertyType,
                      beds: listing.beds,
                      bedsLabel: bedsLabel,
                      transactionType: listing.transactionType,
                      segment: listing.segment ?? "RESIDENTIAL",
                    }}
                    signedIn={signedIn}
                  />

                  {upcomingOpenHouses.length > 0 ? (
                    <section className="space-y-3">
                      <h3 className="font-display text-2xl text-ink">
                        Open houses
                      </h3>
                      <ul className="space-y-2">
                        {upcomingOpenHouses.map((oh) => (
                          <li
                            key={oh.id}
                            className="rounded-xl border border-signal/20 bg-signal/5 px-4 py-3 text-sm"
                          >
                            {new Date(oh.startsAt).toLocaleString("en-CA", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}{" "}
                            –{" "}
                            {new Date(oh.endsAt).toLocaleTimeString("en-CA", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {oh.notes ? ` · ${oh.notes}` : ""}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <MlsDisclaimer />
                </div>

                <aside className="min-w-0 space-y-6 lg:sticky lg:top-0 lg:self-start">
                  <ListingNotesPanel
                    mlsNumber={listing.mlsNumber}
                    signedIn={signedIn}
                    initialBody=""
                    authCallbackUrl={listingPath(listing)}
                  />
                  <ViewingRequestPanel
                    mlsNumber={listing.mlsNumber}
                    callbackPath={listingPath(listing)}
                    inactive={isInactive}
                    similarHomesHref={similarHomesHref}
                    city={listing.city}
                    community={listing.community}
                    transactionType={listing.transactionType}
                    segment={listing.segment}
                    signedIn={signedIn}
                    contact={
                      access.email
                        ? {
                            name: null,
                            email: access.email,
                          }
                        : undefined
                    }
                  />
                </aside>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
