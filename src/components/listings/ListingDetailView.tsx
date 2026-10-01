"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Bath, Bed, Car, Maximize2, ArrowDown, ArrowUp, Video } from "lucide-react";
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
import { ListingStickyBar } from "@/components/listings/ListingStickyBar";
import { NearbyAmenitiesDeferred } from "@/components/listings/NearbyAmenitiesDeferred";
import { DriveTimePanel } from "@/components/listings/DriveTimePanel";
import { ListingRelatedSection } from "@/components/listings/ListingRelatedSection";
import { ListingMobileSideMenu } from "@/components/listings/ListingMobileSideMenu";
import { ListingDetailCoachMarks } from "@/components/listings/ListingDetailCoachMarks";
import { ListingDetailSectionNav } from "@/components/listings/ListingDetailSectionNav";
import { ListingSheetDocumentFlags } from "@/components/listings/ListingSheetDocumentFlags";
import { ListingMapViewButton } from "@/components/listings/ListingMapView";
import { ListingMobileActionBar } from "@/components/listings/ListingMobileActionBar";
import { ListingMobileNotes } from "@/components/listings/ListingMobileNotes";
import { ListingAccountChromeProvider } from "@/components/listings/ListingAccountChromeProvider";
import { ListingAccessGate } from "@/components/listings/ListingAccessGate";
import { RecordRecentView } from "@/components/listings/RecordRecentView";
import { SeoLocationBridge } from "@/components/site/SeoLocationContext";
import { ListingInsightsDeferred } from "@/components/listings/insights/ListingInsightsDeferred";
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
  const personalizationCities: string[] = [];
  const showClosedPrice =
    isClosedListingStatus(listing.status) &&
    (listing.soldPrice != null || !canSeeRestricted);
  const isInactive = !isOnMarketListingStatus(listing.status);
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
  const sqftLabel = formatListingSqftLabel({
    sqft: listing.sqft,
    livingAreaRange: listingFacts?.livingAreaRange,
    unit: "SqFt",
  });
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
      <div className="w-full min-w-0 space-y-8 bg-[linear-gradient(180deg,rgb(244_247_245)_0%,rgb(255_255_255)_28%,rgb(255_255_255)_100%)] px-4 pb-[calc(2rem+5.25rem+var(--mobile-bottom-nav,0px)+var(--listing-action-pad-bottom))] pt-3 sm:px-6 md:pb-8 md:pt-6 lg:px-10">
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

        <div className="-mt-5 space-y-3 md:mt-8 md:space-y-8">
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-10">
        <div className="min-w-0 flex flex-col gap-5 sm:gap-6">
          <div className="order-1 flex flex-col gap-4 border-0 bg-transparent px-0 py-1 md:order-none md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-x-8 md:gap-y-5 md:rounded-2xl md:border md:border-line/40 md:bg-surface md:px-5 md:py-5">
            <div className="min-w-0 w-full md:flex-1">
              <div className="flex items-start justify-between gap-3">
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
                      <p className="font-sans text-3xl font-semibold tracking-tight text-canopy">
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
                <p className="shrink-0 pt-1.5 text-right text-sm font-medium leading-snug text-ink/55 md:hidden">
                  {timingLabel}
                </p>
              </div>
              <div className="mt-2 font-sans leading-snug text-ink">
                {detailsLocked ? (
                    <h1 className="select-none text-xl font-semibold blur-[5px]">
                    {addressSearchLabel}
                  </h1>
                ) : (
                  <>
                    <h1 className="text-xl font-semibold tracking-tight">
                      {streetLine}
                    </h1>
                    <p className="mt-1 text-sm font-medium text-ink/60">
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
                            className="text-canopy hover:underline"
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
                <p className="mt-1.5 text-sm text-ink/50">
                  {propertyTypeLabel(listing.propertyType)}
                  {" · "}
                  MLS® {listing.mlsNumber}
                </p>
              )}
            </div>

            <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto md:shrink-0 md:items-end">
              <p className="hidden text-right text-sm font-medium leading-snug text-ink/55 md:block">
                {timingLabel}
              </p>
              <div className={detailsLocked ? "select-none blur-[5px]" : undefined}>
                <p className="text-sm font-semibold text-ink md:hidden">
                  {[
                    listing.segment !== "COMMERCIAL"
                      ? bedsPlusLabel
                        ? bedsPlusLabel.includes("+")
                          ? bedsPlusLabel
                          : `${bedsPlusLabel} ${bedsPlusLabel === "1" ? "Bed" : "Beds"}`
                        : `${listing.beds} ${listing.beds === 1 ? "Bed" : "Beds"}`
                      : null,
                    listing.segment !== "COMMERCIAL"
                      ? `${listing.baths} ${listing.baths === 1 ? "Bath" : "Baths"}`
                      : null,
                    sqftLabel,
                    `${listing.parkingSpaces} ${listing.parkingSpaces === 1 ? "Parking" : "Parkings"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {/*
                Mobile: equal columns so the row fits the content width.
                Desktop (md+): keep the original fixed min-widths and gaps.
              */}
              <div
                className={
                  listing.segment !== "COMMERCIAL"
                    ? `hidden w-full gap-2 md:flex md:w-auto md:items-start md:gap-3 ${detailsLocked ? "select-none blur-[5px]" : ""}`
                    : `hidden w-full gap-2 md:flex md:w-auto md:items-start md:gap-3 ${detailsLocked ? "select-none blur-[5px]" : ""}`
                }
              >
                {listing.segment !== "COMMERCIAL" ? (
                  <>
                    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-mist/35 px-2 py-2.5 text-center md:min-w-[5.25rem] md:px-3">
                      <Bed
                        className="size-5 text-canopy md:size-6"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="text-sm font-semibold leading-tight text-ink">
                        {bedsPlusLabel
                          ? bedsPlusLabel.includes("+")
                            ? bedsPlusLabel
                            : `${bedsPlusLabel} ${bedsPlusLabel === "1" ? "Bed" : "Beds"}`
                          : `${listing.beds} ${listing.beds === 1 ? "Bed" : "Beds"}`}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-mist/35 px-2 py-2.5 text-center md:min-w-[5.25rem] md:px-3">
                      <Bath
                        className="size-5 text-canopy md:size-6"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="text-sm font-semibold leading-tight text-ink">
                        {listing.baths} {listing.baths === 1 ? "Bath" : "Baths"}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-mist/35 px-2 py-2.5 text-center md:min-w-[5.25rem] md:px-3">
                  <Maximize2
                    className="size-5 text-canopy md:size-6"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold leading-tight text-ink">
                    {sqftLabel ?? "n/a SqFt"}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-mist/35 px-2 py-2.5 text-center md:min-w-[5.25rem] md:px-3">
                  <Car
                    className="size-5 text-canopy md:size-6"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold leading-tight text-ink">
                    {listing.parkingSpaces}{" "}
                    {listing.parkingSpaces === 1 ? "Parking" : "Parkings"}
                  </span>
                </div>
              </div>
            </div>
            {!detailsLocked &&
            (listingFacts?.virtualTourUrl?.trim() ||
              (Number.isFinite(listing.lat) && Number.isFinite(listing.lng))) ? (
              <div className="flex gap-2 md:hidden">
                {Number.isFinite(listing.lat) && Number.isFinite(listing.lng) ? (
                  <ListingMapViewButton
                    subject={{
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
                    }}
                    className="h-11 min-w-0 flex-1 justify-center rounded-xl border-line bg-surface text-sm shadow-none hover:translate-y-0 hover:bg-mist"
                  />
                ) : null}
                {listingFacts?.virtualTourUrl?.trim() ? (
                  <a
                    href={listingFacts.virtualTourUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-sm font-semibold text-ink"
                  >
                    <Video className="size-4 text-canopy" aria-hidden />
                    Virtual tour
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="order-2 md:contents">
          <ListingDetailSectionNav
            layout={
              isListingSheet
                ? applyDocumentSheetFlags
                  ? "iframe"
                  : "panel"
                : "page"
            }
            sheetMode={isListingSheet}
            items={[
              { id: "listing-about", label: "About" },
              { id: "listing-details", label: "Details" },
              { id: "listing-rooms", label: "Rooms" },
              { id: "listing-insights", label: "Insights" },
              { id: "listing-estimated-value", label: "Estimated Value" },
              { id: "listing-history", label: "History" },
              { id: "listing-nearby", label: "Amenities" },
              { id: "listing-open-houses", label: "Open houses" },
              { id: "listing-related", label: "Similar" },
            ]}
          />
          </div>

          <div className="order-3 md:contents">
          <ListingNarrative body={listing.description} />
          </div>

          <div className="order-5 md:contents">
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
            sqftLabel={
              formatListingSqftLabel({
                sqft: listing.sqft,
                livingAreaRange: listingFacts?.livingAreaRange,
                unit: "sqft",
              })
            }
            daysOnMarket={daysOnMarket}
            brokerageName={listing.brokerageName}
            beds={listing.beds}
            baths={listing.baths}
          />
          </div>

          <div className="order-6 md:contents">
          <ListingRoomsLive mlsNumber={listing.mlsNumber} />
          </div>

          <div className="order-8 md:contents">
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
          </div>

          <div className="order-7 md:contents">
          <ListingInsightsDeferred
            mlsNumber={listing.mlsNumber}
            callbackPath={canonicalPath}
            needsEmailVerification={verifyLocked}
          />
          </div>

          <div className="order-11 md:hidden">
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

          <div className="order-12 md:contents">
          <ListingRelatedSection
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
            initialMode="SAME_AREA"
            signedIn={signedIn}
          />
          </div>

          <div className="order-9 flex flex-col gap-5 md:contents">
            <h2 className="font-sans text-lg font-semibold tracking-tight text-ink md:hidden">
              Location
            </h2>
            <DriveTimePanel originLat={listing.lat} originLng={listing.lng} />
            <NearbyAmenitiesDeferred lat={listing.lat} lng={listing.lng} />
          </div>

          <div className="order-10 md:contents">
          <ListingOpenHousesLive mlsNumber={listing.mlsNumber} />
          </div>
        </div>

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
