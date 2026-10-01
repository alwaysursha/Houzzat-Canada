"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Bath, Bed, Car, Ruler, Search, Video } from "lucide-react";
import { SaveListingButton } from "@/components/account/SaveListingButton";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { WatchListingButton } from "@/components/account/WatchListingButton";
import { ListingNotesPanel } from "@/components/account/ListingNotesPanel";
import { ListingDetailFooter } from "@/components/listings/ListingDetailFooter";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { VowAcceptCard } from "@/components/account/VowAcceptCard";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
import { ListingFactsPanel } from "@/components/listings/ListingFactsPanel";
import { ListingGalleryLive } from "@/components/listings/ListingGalleryLive";
import {
  ListingOpenHousesLive,
  ListingRoomsLive,
} from "@/components/listings/ListingRoomsOpenHousesLive";
import { ListingHistoryPanel } from "@/components/listings/ListingHistoryPanel";
import { ListingNarrative } from "@/components/listings/ListingNarrative";
import { ShareListingButton } from "@/components/listings/ShareListingButton";
import { ListingStickyBar } from "@/components/listings/ListingStickyBar";
import { RoutePlannerToggleButton } from "@/components/route-planner/RoutePlannerToggleButton";
import { NearbyAmenitiesDeferred } from "@/components/listings/NearbyAmenitiesDeferred";
import { DriveTimePanel } from "@/components/listings/DriveTimePanel";
import { ListingRelatedSection } from "@/components/listings/ListingRelatedSection";
import { ListingMobileSideMenu } from "@/components/listings/ListingMobileSideMenu";
import { ListingDetailCoachMarks } from "@/components/listings/ListingDetailCoachMarks";
import { ListingDetailPanels } from "@/components/listings/ListingDetailPanels";
import { ListingSheetDocumentFlags } from "@/components/listings/ListingSheetDocumentFlags";
import { ListingMobileActionBar } from "@/components/listings/ListingMobileActionBar";
import { ListingMobileNotes } from "@/components/listings/ListingMobileNotes";
import { ListingAccountChromeProvider } from "@/components/listings/ListingAccountChromeProvider";
import { ListingAccessGate } from "@/components/listings/ListingAccessGate";
import { RecordRecentView } from "@/components/listings/RecordRecentView";
import { SeoLocationBridge } from "@/components/site/SeoLocationContext";
import {
  ListingEstimateLine,
  ListingInsightsDeferred,
} from "@/components/listings/insights/ListingInsightsDeferred";
import { ViewingRequestPanel, MobilePublicAgentSection } from "@/components/listings/ViewingRequestPanel";
import type { ViewingContactDefaults } from "@/components/listings/ViewingBookingModal";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import type { AccessGateCopy } from "@/lib/account-access";
import {
  formatListingTiming,
  formatListPrice,
  formatPrice,
  formatListingAddressSearchParts,
  formatListingAddressOneLine,
  daysOnMarketFromListedAt,
  isClosedListingStatus,
  isOnMarketListingStatus,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
  segmentLabel,
} from "@/lib/listings/constants";
import {
  formatBedsPlusLabel,
  formatLivingAreaRangeLabel,
  parseListingFacts,
  formatListingSqftLabel,
} from "@/lib/listings/facts";
import { getLatestListPriceChange } from "@/lib/listings/history-rows";
import type { HistoryRow } from "@/lib/listings/history-rows";
import type { GalleryMedia } from "@/lib/listings/resolve-gallery";
import type { ListingDetail } from "@/lib/listings/types";
import type { PublicAgentIdentity } from "@/lib/tenancy/resolve-public-agent-identity";
import {
  homesForSaleCityPath,
  homesForSaleCommunityPath,
} from "@/lib/geo/area-paths";
import { interceptListingSheetExitClick } from "@/lib/listings/navigate-listing";

export type ListingDetailViewProps = {
  listing: ListingDetail;
  galleryPhotos: GalleryMedia[];
  livePhotosPromise: Promise<Array<{ id: string; url: string }>> | null;
  listingHistoryRows: HistoryRow[];
  isListingSheet: boolean;
  signedIn: boolean;
  sessionContact?: ViewingContactDefaults;
  canSeeRestricted: boolean;
  detailsLocked: boolean;
  verifyLocked: boolean;
  gateDetails: AccessGateCopy;
  gateSold: AccessGateCopy;
  canonicalPath: string;
  /**
   * Workspace public agent (primary/professional identity).
   * Not the customer's assigned lead, and not the listing brokerage.
   */
  publicAgent?: PublicAgentIdentity | null;
  /**
   * When true (iframe ?sheet=1), set documentElement sheet CSS vars.
   * In-app ListingDetailPanel must leave this false so the browse page chrome
   * under the overlay is not rewritten.
   */
  applyDocumentSheetFlags?: boolean;
  /** Hostname-resolved WhatsApp digits — never a global env number. */
  expertWhatsApp?: string | null;
};

function formatFactCount(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString("en-CA", { maximumFractionDigits: 1 });
}

/** MLS living-area range only. Never an exact or midpoint square footage. */
function summaryRangeSqftCaption(range: string | null | undefined): string | null {
  const formatted = formatLivingAreaRangeLabel(range);
  if (!formatted) return null;
  return `${formatted} sqft`;
}

/** Mobile summary only: `1500-2000sqft`. Desktop keeps the spaced range. */
function summaryCompactRangeSqft(range: string | null | undefined): string | null {
  const formatted = formatLivingAreaRangeLabel(range);
  if (!formatted) return null;
  const match = formatted.match(/(\d[\d,]*)\s*[–—-]\s*(\d[\d,]*)/);
  if (!match) return null;
  return `${match[1]!.replace(/,/g, "")}-${match[2]!.replace(/,/g, "")}sqft`;
}

type SummaryFactIconKind = "bed" | "bath" | "sqft" | "parking";

function SummaryFactIcon({ kind }: { kind: SummaryFactIconKind }) {
  const className =
    "size-7 shrink-0 text-canopy md:size-6 lg:size-7 xl:size-8";
  switch (kind) {
    case "bed":
      return <Bed className={className} aria-hidden />;
    case "bath":
      return <Bath className={className} aria-hidden />;
    case "sqft":
      return <Ruler className={className} aria-hidden />;
    case "parking":
      return <Car className={className} aria-hidden />;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown summary fact: ${exhaustive}`);
    }
  }
}

function SummaryPropertyFacts({
  segment,
  bedsLabel,
  beds,
  baths,
  livingAreaRange,
  parkingSpaces,
  locked,
}: {
  segment: string;
  bedsLabel: string | null;
  beds: number;
  baths: number;
  livingAreaRange: string | null | undefined;
  parkingSpaces: number;
  locked: boolean;
}) {
  const facts: {
    key: string;
    icon: SummaryFactIconKind;
    mobile: string;
    desktop: string;
  }[] = [];
  if (segment !== "COMMERCIAL") {
    const bedValue =
      bedsLabel?.trim() ||
      (Number.isFinite(beds) ? formatFactCount(beds) : "");
    if (bedValue) {
      facts.push({
        key: "beds",
        icon: "bed",
        mobile: `${bedValue} ${bedValue === "1" ? "Bed" : "Beds"}`,
        desktop: `${bedValue} ${bedValue === "1" ? "Bedroom" : "Bedrooms"}`,
      });
    }
    if (Number.isFinite(baths)) {
      const bathCount = formatFactCount(baths);
      facts.push({
        key: "baths",
        icon: "bath",
        mobile: `${bathCount} ${baths === 1 ? "Bath" : "Baths"}`,
        desktop: `${bathCount} ${baths === 1 ? "Bathroom" : "Bathrooms"}`,
      });
    }
  }
  const sqftMobile = summaryCompactRangeSqft(livingAreaRange);
  const sqftDesktop = summaryRangeSqftCaption(livingAreaRange);
  if (sqftMobile && sqftDesktop) {
    facts.push({
      key: "sqft",
      icon: "sqft",
      mobile: sqftMobile,
      desktop: sqftDesktop,
    });
  }
  if (Number.isFinite(parkingSpaces)) {
    const parking = `${formatFactCount(parkingSpaces)} ${
      parkingSpaces === 1 ? "Spot" : "Spots"
    }`;
    facts.push({
      key: "parking",
      icon: "parking",
      mobile: parking,
      desktop: parking,
    });
  }
  if (facts.length === 0) return null;

  return (
    <div
      aria-label="Property facts"
      className={`flex w-full items-start justify-center gap-x-3 px-2 md:flex-nowrap md:items-center md:justify-end md:gap-x-4 md:px-0 lg:gap-x-6 xl:gap-x-8 ${locked ? "select-none blur-[5px]" : ""}`}
    >
      {facts.map((fact) => (
        <div
          key={fact.key}
          className="flex flex-col items-center gap-1.5 text-center md:w-auto md:shrink-0 md:flex-row md:flex-nowrap md:gap-2 lg:gap-2.5 md:text-left"
        >
          <SummaryFactIcon kind={fact.icon} />
          <span className="whitespace-nowrap text-[15px] font-semibold leading-none tracking-tight text-ink md:hidden">
            {fact.mobile}
          </span>
          <span className="hidden whitespace-nowrap font-semibold leading-none tracking-tight text-ink md:inline md:text-base lg:text-lg xl:text-xl">
            {fact.desktop}
          </span>
        </div>
      ))}
    </div>
  );
}

function DesktopListingActions({
  mlsNumber,
  shareTitle,
  callbackPath,
  signedIn,
  inactive,
  city,
  community,
  transactionType,
  segment,
  similarHomesHref,
}: {
  mlsNumber: string;
  shareTitle: string;
  callbackPath: string;
  signedIn: boolean;
  inactive: boolean;
  city: string;
  community: string | null;
  transactionType: "SALE" | "LEASE";
  segment: string;
  similarHomesHref: string;
}) {
  const watchSegment =
    segment === "COMMERCIAL" ? "COMMERCIAL" : ("RESIDENTIAL" as const);
  return (
    <div className="hidden flex-wrap items-center gap-2 md:flex">
      <SaveListingButton
        mlsNumber={mlsNumber}
        initiallySaved={false}
        signedIn={signedIn}
        authCallbackUrl={callbackPath}
      />
      {inactive ? (
        <>
          {city ? (
            <WatchAreaButton
              city={city}
              community={community ?? undefined}
              transactionType={transactionType}
              segment={watchSegment}
              signedIn={signedIn}
              idleLabel="Watch this area"
              authCallbackUrl={callbackPath}
            />
          ) : null}
          <Link
            href={similarHomesHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:bg-mist"
          >
            <Search className="size-3.5" aria-hidden />
            Find similar homes
          </Link>
        </>
      ) : (
        <>
          <WatchListingButton
            mlsNumber={mlsNumber}
            initiallyWatching={false}
            signedIn={signedIn}
            idleLabel="Watch property"
            activeLabel="Watching"
            authCallbackUrl={callbackPath}
          />
          {city ? (
            <WatchAreaButton
              city={city}
              community={community ?? undefined}
              transactionType={transactionType}
              segment={watchSegment}
              signedIn={signedIn}
              idleLabel="Watch area"
              authCallbackUrl={callbackPath}
            />
          ) : null}
          <RoutePlannerToggleButton
            mlsNumber={mlsNumber}
            listingStatus="ACTIVE"
            size="button"
            className="h-9 w-auto px-3 text-sm"
          />
        </>
      )}
      <ShareListingButton
        mlsNumber={mlsNumber}
        title={shareTitle}
        path={callbackPath}
      />
    </div>
  );
}

/**
 * Listing detail presentation shared by /listing/... RSC and ListingDetailPanel.
 * Data loading stays in the page / panel API.
 */
export function ListingDetailView({
  listing,
  galleryPhotos,
  livePhotosPromise,
  listingHistoryRows,
  isListingSheet,
  signedIn,
  sessionContact,
  canSeeRestricted,
  detailsLocked,
  verifyLocked,
  gateDetails,
  gateSold,
  canonicalPath,
  publicAgent = null,
  applyDocumentSheetFlags = true,
  expertWhatsApp = null,
}: ListingDetailViewProps) {
  const [mobileInquiryOpen, setMobileInquiryOpen] = useState(false);
  useEffect(() => {
    if (!isListingSheet) return;
    const root = document.documentElement;
    root.style.setProperty("--listing-sticky-bar-height", "0px");
    return () => {
      root.style.removeProperty("--listing-sticky-bar-height");
    };
  }, [isListingSheet]);
  const personalizationCities: string[] = [];
  const showClosedPrice =
    isClosedListingStatus(listing.status) &&
    (listing.soldPrice != null || !canSeeRestricted);
  const isInactive = !isOnMarketListingStatus(listing.status);
  const estimateEligible =
    listing.status === "ACTIVE" &&
    listing.transactionType === "SALE" &&
    !showClosedPrice &&
    !detailsLocked;
  const similarHomesHref = (() => {
    const params = new URLSearchParams();
    params.set("status", "ACTIVE");
    params.set("transactionType", listing.transactionType);
    params.set("city", listing.city);
    if (listing.community) params.set("community", listing.community);
    if (listing.segment) params.set("segment", listing.segment);
    params.set("propertyType", listing.propertyType);
    params.set("minBeds", String(Math.floor(listing.beds)));
    return `/search?${params.toString()}`;
  })();
  const latestPriceChange = getLatestListPriceChange(
    listing.history,
    listing.mlsNumber,
    { includeRestricted: canSeeRestricted },
  );
  const province = listing.province?.trim() || "ON";
  const { street: streetLine, locality: addressLocality } =
    formatListingAddressSearchParts(listing);
  const addressLabel = formatListingAddressOneLine(listing);
  const addressSearchLabel = addressLocality
    ? `${streetLine}, ${addressLocality}`
    : streetLine;
  const daysOnMarket = daysOnMarketFromListedAt(listing);
  const timingLabel = formatListingTiming(listing);
  const listingFacts = parseListingFacts(listing.facts);
  const bedsPlusLabel = formatBedsPlusLabel(listing.beds, listingFacts);
  const taxesLabel = listing.taxes
    ? listingFacts?.taxYear
      ? `${formatPrice(listing.taxes)} / ${listingFacts.taxYear}`
      : formatPrice(listing.taxes)
    : null;
  const crumbs: { label: string; href?: string }[] = [
    { label: province, href: "/search" },
    {
      label: listing.city,
      href: homesForSaleCityPath(listing.city),
    },
  ];
  const communityHref = listing.community
    ? homesForSaleCommunityPath(listing.city, listing.community)
    : null;
  if (communityHref && listing.community) {
    crumbs.push({
      label: listing.community,
      href: communityHref,
    });
  }
  crumbs.push({ label: streetLine });

  const coverTagLabel = listingStatusLabel(
    listing.status,
    listing.transactionType,
  );
  const segmentTagMeta = {
    label: segmentLabel(listing.segment),
    tone:
      listing.segment === "COMMERCIAL"
        ? ("commercial" as const)
        : listing.segment === "PRE_CONSTRUCTION"
          ? ("preconstruction" as const)
          : ("residential" as const),
  };

  return (
    <ListingAccountChromeProvider
      mlsNumber={listing.mlsNumber}
      signedIn={signedIn}
    >
    <ListingAccessGate
      mlsNumber={listing.mlsNumber}
      callbackPath={canonicalPath}
      signedIn={signedIn}
    >
      <SeoLocationBridge
        city={listing.city}
        community={listing.community}
      />
      <RecordRecentView mlsNumber={listing.mlsNumber} />
      <ListingDetailCoachMarks />
      {applyDocumentSheetFlags ? (
        <Suspense fallback={null}>
          <ListingSheetDocumentFlags />
        </Suspense>
      ) : null}
      <ListingMobileSideMenu
        mlsNumber={listing.mlsNumber}
        shareTitle={addressLabel}
        callbackPath={canonicalPath}
        initiallySaved={false}
        initiallyWatching={false}
        signedIn={signedIn}
        city={listing.city}
        community={listing.community}
        transactionType={listing.transactionType}
        segment={listing.segment}
        inactive={isInactive}
        similarHomesHref={similarHomesHref}
      />
      <ListingMobileActionBar
        mlsNumber={listing.mlsNumber}
        callbackPath={canonicalPath}
        initiallyWatching={false}
        signedIn={signedIn}
        inactive={isInactive}
        similarHomesHref={similarHomesHref}
        city={listing.city}
        community={listing.community}
        transactionType={listing.transactionType}
        segment={listing.segment}
        contact={sessionContact}
      />
      <div className={`w-full min-w-0 space-y-3 bg-[linear-gradient(180deg,rgb(244_247_245)_0%,rgb(255_255_255)_28%,rgb(255_255_255)_100%)] px-4 pb-[calc(2rem+5.25rem+var(--mobile-bottom-nav,0px)+var(--listing-action-pad-bottom))] sm:px-6 md:space-y-8 md:pb-8 md:pt-6 lg:px-10 ${isListingSheet ? "pt-0" : "pt-3"}`}>
        {/*
          Sticky bar must be a descendant of this tall page section (including the
          grid below), not a short breadcrumbs+gallery wrapper — otherwise sticky
          ends when the gallery scrolls away.
        */}
        <ListingStickyBar
          crumbs={crumbs}
          mlsNumber={listing.mlsNumber}
          shareTitle={addressLabel}
          callbackPath={canonicalPath}
          initiallySaved={false}
          initiallyWatching={false}
          signedIn={signedIn}
          city={listing.city}
          community={listing.community}
          transactionType={listing.transactionType}
          segment={listing.segment}
          inactive={isInactive}
          similarHomesHref={similarHomesHref}
          sheetMode={isListingSheet}
        />

        <div className="space-y-3 md:space-y-4">
          {!isListingSheet ? (
            <div className="-mx-4 empty:hidden sm:-mx-6 lg:-mx-10">
              <HomepagePersonalizationBanner
                cities={personalizationCities}
                forceShow
              />
              <SavedSearchChipBar forceShow cities={personalizationCities} />
            </div>
          ) : null}

          <ListingGalleryLive
            addressLabel={addressLabel}
            mlsNumber={listing.mlsNumber}
            livePhotosPromise={livePhotosPromise}
            callbackPath={canonicalPath}
            coverTag={coverTagLabel}
            coverTagClassName={listingStatusBadgeClass(listing.status)}
            segmentTag={segmentTagMeta}
            virtualTourUrl={listingFacts?.virtualTourUrl}
            allowBooking={!isInactive}
            detailsLocked={detailsLocked}
            needsEmailVerification={verifyLocked}
            mapSubject={
              Number.isFinite(listing.lat) && Number.isFinite(listing.lng)
                ? {
                    mlsNumber: listing.mlsNumber,
                    lat: listing.lat,
                    lng: listing.lng,
                    addressLabel: formatListingAddressOneLine(listing),
                    city: listing.city,
                    listPrice: listing.listPrice,
                    transactionType: listing.transactionType,
                    status: listing.status,
                    propertyType: listing.propertyType,
                    beds: listing.beds,
                    bedsLabel: bedsPlusLabel,
                    baths: listing.baths,
                    sqft: listing.sqft,
                    primaryImageUrl: listing.media[0]?.url ?? null,
                    unitNumber: listing.unitNumber,
                    addressLine: listing.addressLine,
                    postalCode: listing.postalCode,
                    province: listing.province,
                  }
                : undefined
            }
            contact={sessionContact}
            photos={galleryPhotos}
          />
        </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start lg:gap-x-10 lg:gap-y-8">
          <div className="flex flex-col gap-5 border-0 bg-transparent px-0 py-1 lg:col-span-2">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 w-full md:flex-1">
              <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-3">
                <div className="flex min-w-0 items-center justify-between gap-3 md:contents">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  {showClosedPrice ? (
                    <SoldForPrice
                      listPrice={listing.listPrice}
                      soldPrice={listing.soldPrice}
                      status={listing.status}
                      transactionType={listing.transactionType}
                      tone="light"
                      locked={!canSeeRestricted}
                      lockReason={verifyLocked ? "verify" : "sign-in"}
                      size="lg"
                    />
                  ) : detailsLocked ? (
                    <p className="font-sans text-3xl font-semibold tracking-tight text-ink/55">
                      <span className="mr-2 text-base font-medium text-ink/45">
                        {listing.transactionType === "LEASE"
                          ? "Rent:"
                          : "Listed:"}
                      </span>
                      {gateSold.title}
                    </p>
                  ) : (
                    <>
                      <p className="font-sans text-3xl font-semibold tracking-tight text-canopy md:text-[2.5rem] md:leading-none">
                        {formatListPrice(
                          listing.listPrice,
                          listing.transactionType,
                        )}
                      </p>
                      {latestPriceChange ? (
                        <span
                          className={
                            latestPriceChange.delta < 0
                              ? "inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-danger"
                              : "inline-flex items-center gap-1 rounded-full bg-canopy/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-canopy-deep"
                          }
                          title={
                            latestPriceChange.delta < 0
                              ? `Reduced from ${formatPrice(latestPriceChange.originalPrice)}`
                              : `Increased from ${formatPrice(latestPriceChange.originalPrice)}`
                          }
                        >
                          {latestPriceChange.delta < 0 ? (
                            <ArrowDown className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowUp className="size-3.5" aria-hidden />
                          )}
                          {latestPriceChange.delta < 0 ? "−" : "+"}
                          {formatPrice(Math.abs(latestPriceChange.delta))}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
                <ListingEstimateLine
                  mlsNumber={listing.mlsNumber}
                  eligible={estimateEligible}
                  compact
                  className="md:hidden"
                />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right md:hidden">
                  <p className="text-base font-semibold leading-none text-ink/85">
                    {timingLabel}
                  </p>
                  {detailsLocked ? null : (
                    <p className="text-[15px] font-medium leading-none text-ink/55">
                      MLS® {listing.mlsNumber}
                    </p>
                  )}
                </div>
              </div>
              <ListingEstimateLine
                mlsNumber={listing.mlsNumber}
                eligible={estimateEligible}
                className="hidden md:block"
              />
              <div className="mt-2 font-sans leading-snug text-ink">
                {detailsLocked ? (
                    <h1 className="select-none text-xl font-semibold blur-[5px]">
                    {addressSearchLabel}
                  </h1>
                ) : (
                  <>
                    <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                      {streetLine}
                    </h1>
                    <p className="mt-1 text-[15px] font-medium leading-snug text-ink/80 md:text-sm md:text-ink/60">
                      {listing.city.trim()}
                      {communityHref && listing.community ? (
                        <>
                          {" · "}
                          <Link
                            href={communityHref}
                            onClick={(event) =>
                              interceptListingSheetExitClick(
                                event,
                                communityHref,
                              )
                            }
                            className="font-semibold text-canopy underline-offset-2 hover:underline"
                          >
                            {listing.community}
                          </Link>
                        </>
                      ) : null}
                      {`, ${province}`}
                      {listing.postalCode?.trim()
                        ? ` ${listing.postalCode.trim()}`
                        : ""}
                    </p>
                  </>
                )}
              </div>
              {detailsLocked ? (
                <p className="mt-1.5 text-sm text-ink/50">
                  {propertyTypeLabel(listing.propertyType)}
                  {" · "}
                  {listing.city}
                  {" · "}
                  {gateDetails.title}
                </p>
              ) : (
                <p className="mt-1.5 text-[17px] font-semibold leading-snug text-ink md:text-sm md:font-normal md:text-ink/50">
                  {propertyTypeLabel(listing.propertyType)}
                  <span className="hidden md:inline">
                    {" · "}
                    MLS® {listing.mlsNumber}
                  </span>
                </p>
              )}
            </div>

            <div className="hidden w-full min-w-0 flex-col gap-3 md:flex lg:w-auto lg:shrink-0 lg:items-end">
              <p className="hidden text-right text-base font-semibold leading-snug text-ink/75 md:block">
                {timingLabel}
              </p>
            </div>
            </div>
            <SummaryPropertyFacts
              segment={listing.segment}
              bedsLabel={bedsPlusLabel}
              beds={listing.beds}
              baths={listing.baths}
              livingAreaRange={listingFacts?.livingAreaRange}
              parkingSpaces={listing.parkingSpaces}
              locked={detailsLocked}
            />
            {!detailsLocked && listingFacts?.virtualTourUrl?.trim() ? (
              <a
                href={listingFacts.virtualTourUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink md:hidden"
              >
                <Video className="size-4 text-canopy" aria-hidden />
                Virtual tour
              </a>
            ) : null}
            <DesktopListingActions
              mlsNumber={listing.mlsNumber}
              shareTitle={addressLabel}
              callbackPath={canonicalPath}
              signedIn={signedIn}
              inactive={isInactive}
              city={listing.city}
              community={listing.community}
              transactionType={listing.transactionType}
              segment={listing.segment}
              similarHomesHref={similarHomesHref}
            />
          </div>

          <ListingDetailPanels
            overview={<ListingNarrative body={listing.description} />}
            details={
              <div className="flex flex-col gap-5">
                <ListingFactsPanel
                  facts={listing.facts}
                  propertyTypeLabel={propertyTypeLabel(listing.propertyType)}
                  mlsNumber={listing.mlsNumber}
                  community={listing.community}
                  postalCode={listing.postalCode}
                  taxesLabel={taxesLabel}
                  maintenanceLabel={
                    listing.maintenanceFee
                      ? `${formatPrice(listing.maintenanceFee)}/mo`
                      : null
                  }
                  parkingSpaces={listing.parkingSpaces}
                  yearBuilt={listing.yearBuilt}
                  sqftLabel={formatListingSqftLabel({
                    sqft: listing.sqft,
                    livingAreaRange: listingFacts?.livingAreaRange,
                    unit: "sqft",
                  })}
                  daysOnMarket={daysOnMarket}
                  brokerageName={listing.brokerageName}
                  beds={listing.beds}
                  baths={listing.baths}
                />
                <ListingRoomsLive mlsNumber={listing.mlsNumber} />
                <ListingOpenHousesLive mlsNumber={listing.mlsNumber} />
              </div>
            }
            history={
              <ListingHistoryPanel
                mlsNumber={listing.mlsNumber}
                addressLabel={addressLabel}
                propertyType={listing.propertyType}
                transactionType={listing.transactionType}
                callbackPath={canonicalPath}
                canSeeRestricted={canSeeRestricted}
                signedIn={signedIn}
                needsEmailVerification={verifyLocked}
                enableAddressHistoryEnrich
                rows={listingHistoryRows}
              />
            }
            insights={
              <ListingInsightsDeferred
                mlsNumber={listing.mlsNumber}
                callbackPath={canonicalPath}
                needsEmailVerification={verifyLocked}
              />
            }
            neighbourhood={
              <div className="flex flex-col gap-5">
                <DriveTimePanel originLat={listing.lat} originLng={listing.lng} />
                <NearbyAmenitiesDeferred lat={listing.lat} lng={listing.lng} />
              </div>
            }
            comparableSold={
              <ListingRelatedSection
                presentation="comparable-sold"
                subject={{
                  mlsNumber: listing.mlsNumber,
                  city: listing.city,
                  community: listing.community,
                  propertyType: listing.propertyType,
                  beds: listing.beds,
                  bedsLabel: bedsPlusLabel,
                  transactionType: listing.transactionType,
                  segment: listing.segment,
                }}
                signedIn={signedIn}
              />
            }
            similarHomes={
              <ListingRelatedSection
                presentation="similar"
                subject={{
                  mlsNumber: listing.mlsNumber,
                  city: listing.city,
                  community: listing.community,
                  propertyType: listing.propertyType,
                  beds: listing.beds,
                  bedsLabel: bedsPlusLabel,
                  transactionType: listing.transactionType,
                  segment: listing.segment,
                }}
                signedIn={signedIn}
              />
            }
            agentSection={
              <div className="md:hidden">
                <MobilePublicAgentSection
                  agent={publicAgent}
                  expertWhatsApp={expertWhatsApp}
                  mlsNumber={listing.mlsNumber}
                  addressLine={addressLabel}
                  city={listing.city}
                  inactive={isInactive}
                  onContactAgent={
                    isInactive ? () => setMobileInquiryOpen(true) : undefined
                  }
                />
              </div>
            }
          />

        <aside className="min-w-0 space-y-5 sm:space-y-6">
          {detailsLocked ? (
            <VowAcceptCard callbackPath={canonicalPath} />
          ) : null}
          <ViewingRequestPanel
            className="hidden md:block"
            mlsNumber={listing.mlsNumber}
            callbackPath={canonicalPath}
            inactive={isInactive}
            similarHomesHref={similarHomesHref}
            city={listing.city}
            community={listing.community}
            transactionType={listing.transactionType}
            segment={listing.segment}
            signedIn={signedIn}
            contact={sessionContact}
            mobileInquiryOpen={isInactive && mobileInquiryOpen}
            publicAgent={publicAgent}
            expertWhatsApp={expertWhatsApp}
            addressLine={addressLabel}
          />
          <ListingNotesPanel
            mlsNumber={listing.mlsNumber}
            signedIn={signedIn}
            initialBody=""
            authCallbackUrl={canonicalPath}
            className="hidden md:block"
          />
          <ListingMobileNotes
            mlsNumber={listing.mlsNumber}
            signedIn={signedIn}
            initialBody=""
            authCallbackUrl={canonicalPath}
          />
        </aside>
      </div>

      <ListingDetailFooter isListingSheet={isListingSheet} />
    </div>
    </ListingAccessGate>
    </ListingAccountChromeProvider>
  );
}
