"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Bath, Bed, Car, Megaphone, ArrowDown, ArrowUp } from "lucide-react";
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
import { ListingAgentCard } from "@/components/listings/ListingAgentCard";
import { ListingRelatedSection } from "@/components/listings/ListingRelatedSection";
import { ListingMobileSideMenu } from "@/components/listings/ListingMobileSideMenu";
import { ListingDetailCoachMarks } from "@/components/listings/ListingDetailCoachMarks";
import { ListingDetailSectionNav } from "@/components/listings/ListingDetailSectionNav";
import { ListingSheetDocumentFlags } from "@/components/listings/ListingSheetDocumentFlags";
import { ListingMobileActionBar } from "@/components/listings/ListingMobileActionBar";
import { ListingMobileNotes } from "@/components/listings/ListingMobileNotes";
import { ListingAccountChromeProvider } from "@/components/listings/ListingAccountChromeProvider";
import { ListingAccessGate } from "@/components/listings/ListingAccessGate";
import { RecordRecentView } from "@/components/listings/RecordRecentView";
import { SeoLocationBridge } from "@/components/site/SeoLocationContext";
import { ListingInsightsDeferred } from "@/components/listings/insights/ListingInsightsDeferred";
import { ViewingRequestPanel } from "@/components/listings/ViewingRequestPanel";
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
  /** Workspace public / primary agent for the listing aside. */
  publicAgent?: PublicAgentIdentity | null;
  /**
   * When true (iframe ?sheet=1), set documentElement sheet CSS vars.
   * In-app ListingDetailPanel must leave this false so the browse page chrome
   * under the overlay is not rewritten.
   */
  applyDocumentSheetFlags?: boolean;
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
}: ListingDetailViewProps) {
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
  const { street: streetLine } = formatListingAddressSearchParts(listing);
  const addressLabel = formatListingAddressOneLine(listing);
  const daysOnMarket = daysOnMarketFromListedAt(listing);
  const timingLabel = formatListingTiming(listing);
  const listingFacts = parseListingFacts(listing.facts);
  const bedsPlusLabel = formatBedsPlusLabel(listing.beds, listingFacts);
  const postalDisplay = (() => {
    const raw = listing.postalCode?.trim();
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, "").toUpperCase();
    if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
      return `${compact.slice(0, 3)} ${compact.slice(3)}`;
    }
    return raw.toUpperCase();
  })();
  const cityLine = [listing.city.trim(), province.toUpperCase(), postalDisplay]
    .filter(Boolean)
    .join(", ");
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
      <div className={`w-full min-w-0 space-y-8 bg-[linear-gradient(180deg,rgb(244_247_245)_0%,rgb(255_255_255)_28%,rgb(255_255_255)_100%)] px-4 pb-[calc(2rem+5.25rem+var(--mobile-bottom-nav,0px)+var(--listing-action-pad-bottom))] pt-3 sm:px-6 md:pb-8 lg:px-10 ${isListingSheet ? "md:pt-0" : "md:pt-6"}`}>
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

        <div className={`-mt-5 space-y-3 md:space-y-8 ${isListingSheet ? "md:mt-0" : "md:mt-8"}`}>
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-10">
        <div className="min-w-0 space-y-5 sm:space-y-6">
          <div className="rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-x-8 md:gap-y-5">
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
                    <p className="font-display text-3xl font-bold tracking-tight text-ink/55 sm:text-4xl">
                      {gateSold.title}
                    </p>
                  ) : (
                    <>
                      <p className="font-display text-3xl font-bold tracking-tight text-canopy sm:text-4xl">
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
                <div className="shrink-0 pt-1.5 text-right md:hidden">
                  <p className="text-sm font-semibold leading-snug text-ink/55">
                    {timingLabel}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-ink/55">
                    MLS® {listing.mlsNumber}
                  </p>
                </div>
              </div>
              <div className="mt-2 font-display leading-tight text-ink">
                {detailsLocked ? (
                  <>
                    <h1 className="select-none text-xl font-semibold blur-[5px] md:text-2xl">
                      {streetLine}
                    </h1>
                    {cityLine ? (
                      <p className="mt-1 select-none text-base font-semibold text-ink/70 blur-[5px] md:text-lg">
                        {cityLine}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <h1 className="text-xl font-semibold md:text-2xl">
                      {streetLine}
                    </h1>
                    {cityLine ? (
                      <p className="mt-1 text-base font-semibold text-ink/70 md:text-lg">
                        {cityLine}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              {detailsLocked ? (
                <p className="mt-1 text-base text-ink/55 sm:text-lg">
                  <span className="font-bold text-ink">
                    {propertyTypeLabel(listing.propertyType)}
                  </span>
                  {" · "}
                  {listing.city}
                  {" · "}
                  {gateDetails.title}
                </p>
              ) : (
                <p className="mt-1 text-base text-ink/55 sm:text-lg">
                  <span className="font-bold text-ink">
                    {propertyTypeLabel(listing.propertyType)}
                  </span>
                </p>
              )}
            </div>

            <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto md:shrink-0 md:items-end">
              <div className="hidden text-right md:block">
                <p className="text-sm font-semibold leading-snug text-ink/55">
                  {timingLabel}
                </p>
                <p className="mt-1 text-sm font-semibold leading-snug text-ink/55">
                  MLS® {listing.mlsNumber}
                </p>
              </div>
              {/*
                Mobile: equal columns so the row fits the content width.
                Desktop (md+): keep the original fixed min-widths and gaps.
              */}
              <div
                className={
                  listing.segment !== "COMMERCIAL"
                    ? `grid w-full grid-cols-3 gap-2 md:flex md:w-auto md:items-start md:gap-3 ${detailsLocked ? "select-none blur-[5px]" : ""}`
                    : `flex w-full justify-end md:w-auto md:items-start ${detailsLocked ? "select-none blur-[5px]" : ""}`
                }
              >
                {listing.segment !== "COMMERCIAL" ? (
                  <>
                    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-mist/60 px-2 py-2.5 text-center md:min-w-[5.25rem] md:px-3">
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
                    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-mist/60 px-2 py-2.5 text-center md:min-w-[5.25rem] md:px-3">
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
                <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-mist/60 px-2 py-2.5 text-center md:min-w-[5.25rem] md:px-3">
                  <Car
                    className="size-5 text-canopy md:size-6"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold leading-tight text-ink">
                    {listing.parkingSpaces}{" "}
                    {listing.parkingSpaces === 1 ? "Spot" : "Spots"}
                  </span>
                </div>
              </div>
            </div>
            </div>
            <div className="mt-4 flex w-full items-center justify-between gap-3 border-t border-line/70 pt-4">
              <p className="flex min-w-0 items-start gap-2 text-sm text-ink sm:items-center">
                <Megaphone
                  className="mt-0.5 size-4 shrink-0 text-canopy sm:mt-0"
                  aria-hidden
                />
                <span>
                  Prices are changing. Get a free home estimate
                </span>
              </p>
              <Link
                href="/home-valuation"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-semibold text-canopy underline underline-offset-2 hover:text-canopy-deep"
              >
                Find out now
              </Link>
            </div>
          </div>

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
              { id: "listing-history", label: "History" },
              { id: "listing-insights", label: "Insights" },
              { id: "listing-estimated-value", label: "Estimated Value" },
              { id: "listing-related", label: "Similar" },
              { id: "listing-nearby", label: "Amenities" },
              { id: "listing-open-houses", label: "Open houses" },
            ]}
          />

          <ListingNarrative body={listing.description} />

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

          <ListingRoomsLive mlsNumber={listing.mlsNumber} />

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

          <ListingInsightsDeferred
            mlsNumber={listing.mlsNumber}
            callbackPath={canonicalPath}
            needsEmailVerification={verifyLocked}
          />

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

          <NearbyAmenitiesDeferred lat={listing.lat} lng={listing.lng} />

          <ListingOpenHousesLive mlsNumber={listing.mlsNumber} />
        </div>

        <aside className="min-w-0 space-y-5 sm:space-y-6">
          {detailsLocked ? (
            <VowAcceptCard callbackPath={canonicalPath} />
          ) : null}
          <ListingNotesPanel
            mlsNumber={listing.mlsNumber}
            signedIn={signedIn}
            initialBody=""
            authCallbackUrl={canonicalPath}
            className="hidden md:block"
          />
          <ListingAgentCard agent={publicAgent} />
          <DriveTimePanel
            mlsNumber={listing.mlsNumber}
            originLat={listing.lat}
            originLng={listing.lng}
            originLabel={streetLine}
          />
          <ListingMobileNotes
            mlsNumber={listing.mlsNumber}
            signedIn={signedIn}
            initialBody=""
            authCallbackUrl={canonicalPath}
          />
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
          />
        </aside>
      </div>

      <ListingDetailFooter isListingSheet={isListingSheet} />
    </div>
    </ListingAccessGate>
    </ListingAccountChromeProvider>
  );
}
