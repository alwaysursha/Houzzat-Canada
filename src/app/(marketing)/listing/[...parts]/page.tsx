import { Suspense, cache } from "react";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Bath, Bed, Car, Maximize2, ArrowDown, ArrowUp } from "lucide-react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { ListingNotesPanel } from "@/components/account/ListingNotesPanel";
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
import { ListingQaPanel } from "@/components/listings/ListingQaPanel";
import { ListingStickyBar } from "@/components/listings/ListingStickyBar";
import { NearbyAmenitiesDeferred } from "@/components/listings/NearbyAmenitiesDeferred";
import { DriveTimePanel } from "@/components/listings/DriveTimePanel";
import { ListingRelatedSection } from "@/components/listings/ListingRelatedSection";
import { ListingMobileSideMenu } from "@/components/listings/ListingMobileSideMenu";
import { ListingDetailCoachMarks } from "@/components/listings/ListingDetailCoachMarks";
import { ListingDetailSectionNav } from "@/components/listings/ListingDetailSectionNav";
import { ListingSheetDocumentFlags } from "@/components/listings/ListingSheetDocumentFlags";
import { ListingMobileActionBar } from "@/components/listings/ListingMobileActionBar";
import { ListingMobileNotes } from "@/components/listings/ListingMobileNotes";
import { ListingAccountChromeProvider } from "@/components/listings/ListingAccountChromeProvider";
import { RecordRecentView } from "@/components/listings/RecordRecentView";
import { SeoLocationBridge } from "@/components/site/SeoLocationContext";
import { ListingInsightsDeferred } from "@/components/listings/insights/ListingInsightsDeferred";
import { ViewingRequestPanel } from "@/components/listings/ViewingRequestPanel";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import { buildAddressListingHistoryRows } from "@/lib/listings/address-history";
import { getLatestListPriceChange } from "@/lib/listings/history-rows";
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
import { getListingProvider } from "@/lib/listings/provider";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import { persistNeonListingMediaCap } from "@/lib/listings/persist-neon-media";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";
import { fetchListingPhotosFromPropTx } from "@/lib/proptx/listing-photos";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import { lookupAndUpsertOnDemand } from "@/lib/proptx/on-demand-lookup";
import {
  accessGateCopy,
  needsEmailVerification,
  resolveClientAccess,
} from "@/lib/account-access";
import { hasVowAccess } from "@/lib/vow";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { getExpertWhatsAppNumber } from "@/lib/whatsapp";
import {
  homesForSaleCityPath,
  homesForSaleCommunityPath,
} from "@/lib/geo/area-seo";
import {
  listingAddressSlug,
  listingPageTitle,
  listingPath,
} from "@/lib/listings/listing-path";

/** Per-request: VOW/IDX gates, sold/history redaction, session access. */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ parts: string[] }> };

/**
 * Single catch-all avoids OpenNext/Workerd route collisions from sibling
 * dynamic segments (`/listing/[mls]` + `/listing/[slug]/[mls]`).
 *
 * - `/listing/X13637722` → 301 to canonical slug path
 * - `/listing/161-eden-oak-trail-kitchener/X13637722` → detail page
 */
function parseListingParts(parts: string[] | undefined): {
  slug: string | null;
  mlsNumber: string;
} {
  if (!parts || parts.length === 0 || parts.length > 2) {
    notFound();
  }
  if (parts.length === 1) {
    return { slug: null, mlsNumber: parts[0]! };
  }
  return { slug: parts[0]!, mlsNumber: parts[1]! };
}

/**
 * Request-scoped listing load shared by generateMetadata + page.
 * Normalize MLS before cache() so case/whitespace variants hit one entry.
 * Auth/VOW stay outside — this loader is MLS inventory only.
 */
const loadListingByMlsCached = cache(async (mlsNumber: string) => {
  const provider = getListingProvider();
  let listing = await provider.getByMlsForDetailPage(mlsNumber);
  if (!listing) {
    const pulled = await lookupAndUpsertOnDemand(mlsNumber);
    if (pulled.mlsNumbers.length > 0) {
      listing = await provider.getByMlsForDetailPage(mlsNumber);
    }
  }
  return listing;
});

function loadListingByMls(mlsNumber: string) {
  return loadListingByMlsCached(mlsNumber.trim().toUpperCase());
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { parts } = await params;
  const { mlsNumber, slug } = parseListingParts(parts);
  const listing = await loadListingByMls(mlsNumber);
  if (!listing) return { title: "Listing" };

  // Legacy MLS-only URL — metadata still points at the canonical SEO URL.
  void slug;

  const cover =
    listing.media.find((media) => media.isPrimary) ?? listing.media[0] ?? null;
  const title = listingPageTitle(listing);
  const description = listing.description.slice(0, 160);
  const canonicalPath = listingPath(listing);
  const url = `${SITE_URL}${canonicalPath}`;
  const images = cover?.url
    ? [
        {
          url: cover.url,
          width: 1200,
          height: 630,
          alt: title,
        },
      ]
    : [];

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_CA",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: cover?.url ? [cover.url] : [],
    },
  };
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ sheet?: string | string[] }> }) {
  const { parts } = await params;
  const sp = await searchParams;
  const sheetParam = sp.sheet;
  const isListingSheet =
    sheetParam === "1" ||
    (Array.isArray(sheetParam) && sheetParam.includes("1"));
  const { mlsNumber, slug } = parseListingParts(parts);
  const listing = await loadListingByMls(mlsNumber);
  if (!listing) notFound();

  const canonicalPath = listingPath(listing);
  const expectedSlug = listingAddressSlug(listing) || "listing";

  // Legacy `/listing/MLS` or stale slug → permanent redirect to canonical.
  if (slug == null || slug !== expectedSlug) {
    permanentRedirect(canonicalPath);
  }

  const session = await auth();
  // Access fields only on SSR — save/watch/note/phone/prefs load after paint.
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          emailVerified: true,
          createdAt: true,
        },
      })
    : null;
  const sessionContact = user
    ? {
        name: session?.user?.name ?? null,
        email: session?.user?.email ?? null,
        phone: null as string | null,
      }
    : undefined;

  // MLS listing pages are public in IDX mode; VOW-only legacy still requires login.
  if (
    isVowOnlyMlsMode() &&
    listing.dataSource !== "fsbo" &&
    !hasVowAccess(user)
  ) {
    if (needsEmailVerification(user)) {
      redirect(
        `/auth/verify-email?callbackUrl=${encodeURIComponent(canonicalPath)}`,
      );
    }
    redirect(
      `/auth/sign-in?callbackUrl=${encodeURIComponent(canonicalPath)}`,
    );
  }

  const access = resolveClientAccess(user);
  const vowOk = access.hasClientAccess;
  const verifyLocked = access.needsEmailVerification;
  const gateDetails = accessGateCopy(access, "details");
  const gateSold = accessGateCopy(access, "sold");

  // Neon-only SSR gallery (≤5). Never await PropTx here — start it in parallel
  // and pass the promise to the client so enrich skips an extra API hop.
  const galleryPhotos = resolveListingGalleryPhotos(listing);
  const livePhotosPromise =
    listing.dataSource === "mls" && listing.listingKey
      ? fetchListingPhotosFromPropTx(listing.listingKey, {
          timeoutMs: 10_000,
        }).then((photos) => {
          if (photos.length > 0) {
            void persistNeonListingMediaCap(
              listing.id,
              photos.slice(0, NEON_LISTING_MEDIA_CAP).map((photo) => ({
                url: photo.mediaUrl,
                sortOrder: photo.sortOrder,
                isPrimary: photo.isPrimary,
              })),
            ).catch(() => {
              // Best-effort Neon warm for next visit
            });
          }
          return photos.map((photo) => ({
            id: photo.id,
            url: photo.url,
          }));
        })
      : null;

  void prisma.listingView
    .create({
      data: { userId: user?.id, mlsNumber: listing.mlsNumber },
    })
    .catch(() => {});

  // Address siblings enrich client-side (ListingHistoryPanel).
  const personalizationCities: string[] = [];
  const listingHistoryRows = buildAddressListingHistoryRows({
    mlsNumber: listing.mlsNumber,
    listPrice: listing.listPrice,
    listedAt: listing.listedAt,
    updatedAtMls: listing.updatedAtMls,
    soldAt: listing.soldAt,
    soldPrice: listing.soldPrice,
    status: listing.status,
    transactionType: listing.transactionType,
    history: listing.history,
    siblings: [],
  });

  const showClosedPrice =
    isClosedListingStatus(listing.status) && listing.soldPrice != null;
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
  const canSeeRestricted = vowOk;
  const detailsLocked = isInactive && !canSeeRestricted;
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
  if (listing.community) {
    crumbs.push({
      label: listing.community,
      href: homesForSaleCommunityPath(listing.city, listing.community),
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

  const coverUrl =
    listing.media.find((m) => m.isPrimary)?.url ?? listing.media[0]?.url ?? null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: addressLabel,
    url: `${SITE_URL}${canonicalPath}`,
    description: listing.description.slice(0, 300),
    datePosted: listing.listedAt.toISOString(),
    ...(coverUrl ? { image: [coverUrl] } : {}),
    offers: {
      "@type": "Offer",
      price: listing.listPrice,
      priceCurrency: "CAD",
      availability:
        listing.status === "ACTIVE"
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: listing.addressLine,
      addressLocality: listing.city,
      addressRegion: listing.province,
      postalCode: listing.postalCode,
      addressCountry: "CA",
    },
    ...(Number.isFinite(listing.lat) && Number.isFinite(listing.lng)
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: listing.lat,
            longitude: listing.lng,
          },
        }
      : {}),
    numberOfRooms: listing.beds,
    numberOfBedrooms: listing.beds,
    numberOfBathroomsTotal: listing.baths,
    floorSize: listing.sqft
      ? { "@type": "QuantitativeValue", value: listing.sqft, unitCode: "FTK" }
      : undefined,
    provider: {
      "@type": "RealEstateAgent",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: listing.city,
        item: `${SITE_URL}${homesForSaleCityPath(listing.city)}`,
      },
      ...(listing.community
        ? [
            {
              "@type": "ListItem" as const,
              position: 3,
              name: listing.community,
              item: `${SITE_URL}${homesForSaleCommunityPath(
                listing.city,
                listing.community,
              )}`,
            },
            {
              "@type": "ListItem" as const,
              position: 4,
              name: addressLabel,
              item: `${SITE_URL}${canonicalPath}`,
            },
          ]
        : [
            {
              "@type": "ListItem" as const,
              position: 3,
              name: addressLabel,
              item: `${SITE_URL}${canonicalPath}`,
            },
          ]),
    ],
  };

  return (
    <ListingAccountChromeProvider
      mlsNumber={listing.mlsNumber}
      signedIn={Boolean(user)}
    >
      <SeoLocationBridge
        city={listing.city}
        community={listing.community}
      />
      <RecordRecentView mlsNumber={listing.mlsNumber} />
      <ListingDetailCoachMarks />
      <Suspense fallback={null}>
        <ListingSheetDocumentFlags />
      </Suspense>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <ListingMobileSideMenu
        mlsNumber={listing.mlsNumber}
        shareTitle={addressLabel}
        callbackPath={canonicalPath}
        initiallySaved={false}
        initiallyWatching={false}
        signedIn={Boolean(user)}
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
        signedIn={Boolean(user)}
        inactive={isInactive}
        similarHomesHref={similarHomesHref}
        city={listing.city}
        community={listing.community}
        transactionType={listing.transactionType}
        segment={listing.segment}
        contact={sessionContact}
      />
      <div className="w-full min-w-0 space-y-8 bg-[linear-gradient(180deg,rgb(244_247_245)_0%,rgb(255_255_255)_28%,rgb(255_255_255)_100%)] px-4 pb-[calc(2rem+4.25rem+var(--mobile-bottom-nav,0px)+var(--listing-action-pad-bottom))] pt-3 sm:px-6 md:pb-8 md:pt-6 lg:px-10">
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
          signedIn={Boolean(user)}
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
        <div className="min-w-0 space-y-5 sm:space-y-6">
          <div className="flex flex-col gap-5 rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-6 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-x-8 md:gap-y-5">
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
                    <p className="font-display text-3xl tracking-tight text-ink/55 sm:text-4xl">
                      <span className="mr-2 font-sans text-base font-semibold text-ink/45 sm:text-lg">
                        {listing.transactionType === "LEASE"
                          ? "Rent:"
                          : "Listed:"}
                      </span>
                      {gateSold.title}
                    </p>
                  ) : (
                    <>
                      <p className="font-display text-3xl tracking-tight text-canopy sm:text-4xl">
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
              <div className="mt-2 font-display leading-tight text-ink">
                {detailsLocked ? (
                  <h1 className="select-none text-xl font-normal blur-[5px] md:text-2xl">
                    {addressSearchLabel}
                  </h1>
                ) : (
                  <>
                    <h1 className="text-xl font-normal md:text-2xl">
                      {streetLine}
                    </h1>
                    {addressLocality ? (
                      <p className="mt-1 text-base font-normal text-ink/70 md:text-lg">
                        {listing.community ? (
                          <>
                            {listing.city.trim()}
                            {" - "}
                            <Link
                              href={homesForSaleCommunityPath(
                                listing.city,
                                listing.community,
                              )}
                              className="text-canopy hover:underline"
                            >
                              {listing.community}
                            </Link>
                          </>
                        ) : (
                          addressLocality
                        )}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              {detailsLocked ? (
                <p className="mt-1 text-sm text-ink/55">
                  <span className="font-bold text-ink">
                    {propertyTypeLabel(listing.propertyType)}
                  </span>
                  {" · "}
                  {listing.city}
                  {" · "}
                  {gateDetails.title}
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink/55">
                  <span className="font-bold text-ink">
                    {propertyTypeLabel(listing.propertyType)}
                  </span>
                  {" · "}
                  MLS® {listing.mlsNumber}
                </p>
              )}
            </div>

            <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto md:shrink-0 md:items-end">
              <p className="hidden text-right text-sm font-medium leading-snug text-ink/55 md:block">
                {timingLabel}
              </p>
              {/*
                Mobile: equal columns so the row fits the content width.
                Desktop (md+): keep the original fixed min-widths and gaps.
              */}
              <div
                className={
                  listing.segment !== "COMMERCIAL"
                    ? `grid w-full grid-cols-4 gap-2 md:flex md:w-auto md:items-start md:gap-3 ${detailsLocked ? "select-none blur-[5px]" : ""}`
                    : `grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:items-start md:gap-3 ${detailsLocked ? "select-none blur-[5px]" : ""}`
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
                  <Maximize2
                    className="size-5 text-canopy md:size-6"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold leading-tight text-ink">
                    {sqftLabel ?? "n/a SqFt"}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-mist/60 px-2 py-2.5 text-center md:min-w-[5.25rem] md:px-3">
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
          </div>

          <ListingQaPanel
            mlsNumber={listing.mlsNumber}
            addressLine={addressLabel}
            city={listing.city}
            title="Quick question?"
            hint="Message the agent directly on WhatsApp — MLS® and address is already included."
            expertWhatsApp={getExpertWhatsAppNumber()}
          />

          <DriveTimePanel originLat={listing.lat} originLng={listing.lng} />

          <ListingDetailSectionNav
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
            signedIn={Boolean(user)}
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
            signedIn={Boolean(user)}
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
            signedIn={Boolean(user)}
            initialBody=""
            authCallbackUrl={canonicalPath}
            className="hidden md:block"
          />
          <ListingMobileNotes
            mlsNumber={listing.mlsNumber}
            signedIn={Boolean(user)}
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
            signedIn={Boolean(user)}
            contact={sessionContact}
          />
          <MlsDisclaimer />
        </aside>
      </div>
    </div>
    </ListingAccountChromeProvider>
  );
}
