import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Bath, Bed, Car, Maximize2, ArrowDown, ArrowUp } from "lucide-react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { ListingNotesPanel } from "@/components/account/ListingNotesPanel";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { VowAcceptCard } from "@/components/account/VowAcceptCard";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
import { FitSingleLineText } from "@/components/listings/FitSingleLineText";
import { ListingFactsPanel } from "@/components/listings/ListingFactsPanel";
import { ListingGallery } from "@/components/listings/ListingGallery";
import { ListingRoomsPanel } from "@/components/listings/ListingRoomsPanel";
import { ListingHistoryPanel } from "@/components/listings/ListingHistoryPanel";
import { ListingNarrative } from "@/components/listings/ListingNarrative";
import { ListingQaPanel } from "@/components/listings/ListingQaPanel";
import { ListingStickyBar } from "@/components/listings/ListingStickyBar";
import { NearbyAmenities } from "@/components/listings/NearbyAmenities";
import { DriveTimePanel } from "@/components/listings/DriveTimePanel";
import { ListingRelatedSection } from "@/components/listings/ListingRelatedSection";
import { ListingMobileSideMenu } from "@/components/listings/ListingMobileSideMenu";
import { ListingDetailCoachMarks } from "@/components/listings/ListingDetailCoachMarks";
import { ListingMobileActionBar } from "@/components/listings/ListingMobileActionBar";
import { ListingMobileNotes } from "@/components/listings/ListingMobileNotes";
import { RecordRecentView } from "@/components/listings/RecordRecentView";
import { HouzzatInsights } from "@/components/listings/insights/HouzzatInsights";
import { ViewingRequestPanel } from "@/components/listings/ViewingRequestPanel";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import { slugifyPlace } from "@/lib/geo/distance";
import {
  buildAddressListingHistoryRows,
  findSiblingListingsAtAddress,
} from "@/lib/listings/address-history";
import { getLatestListPriceChange } from "@/lib/listings/history-rows";
import {
  formatListingTiming,
  formatListPrice,
  formatPrice,
  formatListingAddress,
  formatListingAddressOneLine,
  daysOnMarketFromListedAt,
  isClosedListingStatus,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
  segmentLabel,
} from "@/lib/listings/constants";
import {
  formatBedsPlusLabel,
  parseListingFacts,
} from "@/lib/listings/facts";
import { getListingProvider } from "@/lib/listings/provider";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";
import { getPopularCities } from "@/lib/listings/popular-cities";
import { buildListingInsights } from "@/lib/market/listing-insights";
import { getMarketPulse } from "@/lib/market/pulse";
import { auth } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/locale";
import { findNearbyPois } from "@/lib/poi/nearby";
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
  listingAddressSlug,
  listingPageTitle,
  listingPath,
} from "@/lib/listings/listing-path";

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

async function loadListingByMls(mlsNumber: string) {
  const provider = getListingProvider();
  let listing = await provider.getByMls(mlsNumber);
  if (!listing) {
    const pulled = await lookupAndUpsertOnDemand(mlsNumber);
    if (pulled.mlsNumbers.length > 0) {
      listing = await provider.getByMls(mlsNumber);
    }
  }
  return listing;
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

export default async function ListingDetailPage({ params }: Params) {
  const { parts } = await params;
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
  const locale = await getLocale();
  const user = session?.user?.email
    ? await (async () => {
        const email = session.user!.email!;
        try {
          return await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              relatedListingsMode: true,
              emailVerified: true,
              createdAt: true,
            },
          });
        } catch {
          // Prefer schema include relatedListingsMode; fall back if DB not migrated yet.
          const base = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              emailVerified: true,
              createdAt: true,
            },
          });
          return base
            ? { ...base, relatedListingsMode: "SAME_AREA" as const }
            : null;
        }
      })()
    : null;

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

  // Full gallery from PropTx MediaURLs (DB only keeps cover for search/cards).
  // Locked accounts get 5 free photos + a 6th locked "verify" slide.
  const galleryPhotosAll = await resolveListingGalleryPhotos(listing);
  const galleryPhotos = verifyLocked
    ? galleryPhotosAll.slice(0, 6)
    : galleryPhotosAll;
  const galleryPhotoCap =
    verifyLocked && galleryPhotosAll.length > 5
      ? galleryPhotosAll.length
      : null;
  const saved = user
    ? Boolean(
        await prisma.savedListing.findUnique({
          where: {
            userId_mlsNumber: { userId: user.id, mlsNumber: listing.mlsNumber },
          },
        }),
      )
    : false;
  const watching = user
    ? Boolean(
        await prisma.propertyMonitor.findUnique({
          where: {
            userId_mlsNumber: { userId: user.id, mlsNumber: listing.mlsNumber },
          },
        }),
      )
    : false;
  const notePreview = user
    ? await prisma.listingNote.findUnique({
        where: {
          userId_mlsNumber: { userId: user.id, mlsNumber: listing.mlsNumber },
        },
        select: { body: true },
      })
    : null;

  try {
    await prisma.listingView.create({
      data: {
        userId: user?.id,
        mlsNumber: listing.mlsNumber,
      },
    });
  } catch {
    // Non-blocking analytics — never fail the listing page.
  }

  const [nearby, pulse, popularCities, addressSiblings] = await Promise.all([
    findNearbyPois({
      lat: listing.lat,
      lng: listing.lng,
      radiusKm: 2,
      limitPerType: 8,
    }),
    getMarketPulse({
      city: listing.city,
      community: listing.community,
      includeSold: vowOk,
    }),
    getPopularCities(12),
    findSiblingListingsAtAddress(listing),
  ]);
  const insights = await buildListingInsights({
    listing,
    pulse,
    pois: nearby,
    signedIn: vowOk,
  });
  const personalizationCities = popularCities.map((row) => row.city);
  const upcomingOpenHouses = listing.openHouses.filter(
    (oh) => oh.endsAt.getTime() >= Date.now(),
  );
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
    siblings: addressSiblings,
  });

  const showClosedPrice =
    isClosedListingStatus(listing.status) && listing.soldPrice != null;
  const isInactive = listing.status !== "ACTIVE";
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
  const areaSlug = listing.community
    ? slugifyPlace(listing.city, listing.community)
    : slugifyPlace(listing.city);
  const province = listing.province?.trim() || "ON";
  const [streetLine] = formatListingAddress(listing);
  const addressLabel = formatListingAddressOneLine(listing);
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
      href: `/search?city=${encodeURIComponent(listing.city)}`,
    },
  ];
  if (listing.community) {
    crumbs.push({
      label: listing.community,
      href: `/areas/${areaSlug}`,
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.addressLine,
    url: `${SITE_URL}${canonicalPath}`,
    description: listing.description.slice(0, 300),
    datePosted: listing.listedAt.toISOString(),
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
    numberOfRooms: listing.beds,
    floorSize: listing.sqft
      ? { "@type": "QuantitativeValue", value: listing.sqft, unitCode: "FTK" }
      : undefined,
    provider: { "@type": "Organization", name: SITE_NAME },
  };

  return (
    <>
      <RecordRecentView mlsNumber={listing.mlsNumber} />
      <ListingDetailCoachMarks />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ListingMobileSideMenu
        mlsNumber={listing.mlsNumber}
        callbackPath={canonicalPath}
        initiallySaved={saved}
        initiallyWatching={watching}
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
        initiallyWatching={watching}
        signedIn={Boolean(user)}
        inactive={isInactive}
        similarHomesHref={similarHomesHref}
        city={listing.city}
        community={listing.community}
        transactionType={listing.transactionType}
        segment={listing.segment}
        contact={
          user
            ? {
                name: user.name,
                email: user.email,
                phone: user.phone,
              }
            : undefined
        }
      />
      <div className="w-full min-w-0 space-y-8 bg-[linear-gradient(180deg,rgb(244_247_245)_0%,rgb(255_255_255)_28%,rgb(255_255_255)_100%)] px-4 pb-[calc(2rem+4.25rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-6 md:pb-8 md:pt-6 lg:px-10">
        {/*
          Sticky bar must be a descendant of this tall page section (including the
          grid below), not a short breadcrumbs+gallery wrapper — otherwise sticky
          ends when the gallery scrolls away.
        */}
        <ListingStickyBar
          crumbs={crumbs}
          mlsNumber={listing.mlsNumber}
          callbackPath={canonicalPath}
          initiallySaved={saved}
          initiallyWatching={watching}
          signedIn={Boolean(user)}
          city={listing.city}
          community={listing.community}
          transactionType={listing.transactionType}
          segment={listing.segment}
          inactive={isInactive}
          similarHomesHref={similarHomesHref}
        />

        <div className="-mt-5 space-y-3 md:mt-8 md:space-y-8">
          <div className="-mx-4 empty:hidden sm:-mx-6 lg:-mx-10">
            <HomepagePersonalizationBanner
              cities={personalizationCities}
              forceShow
            />
            <SavedSearchChipBar forceShow cities={personalizationCities} />
          </div>

          <ListingGallery
            addressLabel={addressLabel}
            mlsNumber={listing.mlsNumber}
            callbackPath={canonicalPath}
            coverTag={coverTagLabel}
            coverTagClassName={listingStatusBadgeClass(listing.status)}
            segmentTag={segmentTagMeta}
            virtualTourUrl={listingFacts?.virtualTourUrl}
            allowBooking={!isInactive}
            detailsLocked={detailsLocked}
            needsEmailVerification={verifyLocked}
            hiddenPhotoCount={
              galleryPhotoCap != null ? Math.max(0, galleryPhotoCap - 5) : 0
            }
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
            contact={
              user
                ? {
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                  }
                : undefined
            }
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
              <FitSingleLineText
                className="mt-2 font-display leading-tight text-ink"
                minPx={12}
                maxPx={24}
              >
                {detailsLocked ? (
                  <span className="select-none blur-[5px]">{addressLabel}</span>
                ) : (
                  addressLabel
                )}
              </FitSingleLineText>
              {detailsLocked ? (
                <p className="mt-1 text-sm text-ink/55">
                  {propertyTypeLabel(listing.propertyType)}
                  {" · "}
                  {listing.city}
                  {" · "}
                  {gateDetails.title}
                </p>
              ) : listing.community ? (
                <p className="mt-1 text-sm text-ink/55">
                  <Link
                    href={`/areas/${areaSlug}`}
                    className="text-canopy hover:underline"
                  >
                    {listing.community}
                  </Link>
                  {" · "}
                  {propertyTypeLabel(listing.propertyType)}
                  {" · "}
                  MLS® {listing.mlsNumber}
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink/55">
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
                    {listing.sqft
                      ? `${listing.sqft.toLocaleString()} SqFt`
                      : "n/a SqFt"}
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
            title={t(locale, "grounded_qa_title")}
            hint={t(locale, "grounded_qa_hint")}
            expertWhatsApp={getExpertWhatsAppNumber()}
          />

          <DriveTimePanel originLat={listing.lat} originLng={listing.lng} />

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
              listing.sqft
                ? `${listing.sqft.toLocaleString()} sqft`
                : null
            }
            daysOnMarket={daysOnMarket}
            brokerageName={listing.brokerageName}
            beds={listing.beds}
            baths={listing.baths}
          />

          <ListingRoomsPanel rooms={listing.rooms} />

          <ListingHistoryPanel
            addressLabel={addressLabel}
            propertyType={listing.propertyType}
            transactionType={listing.transactionType}
            callbackPath={canonicalPath}
            canSeeRestricted={canSeeRestricted}
            signedIn={Boolean(user)}
            needsEmailVerification={verifyLocked}
            rows={listingHistoryRows}
          />

          <HouzzatInsights
            insights={insights}
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
              transactionType: listing.transactionType,
              segment: listing.segment,
            }}
            initialMode={user?.relatedListingsMode ?? "SAME_AREA"}
            signedIn={Boolean(user)}
          />

          <NearbyAmenities
            lat={listing.lat}
            lng={listing.lng}
            pois={nearby}
          />

          {upcomingOpenHouses.length > 0 ? (
            <section className="rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
                Showings
              </p>
              <h2 className="mt-1 font-display text-xl text-ink sm:text-2xl">
                Open houses
              </h2>
              <ul className="mt-4 space-y-2">
                {upcomingOpenHouses.map((oh) => (
                  <li
                    key={oh.id}
                    className="rounded-xl border border-signal/20 bg-signal/5 px-4 py-3 text-sm font-medium text-ink/80"
                  >
                    {oh.startsAt.toLocaleString("en-CA", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {oh.endsAt.toLocaleTimeString("en-CA", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {oh.notes ? ` · ${oh.notes}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-5 sm:space-y-6">
          {detailsLocked ? (
            <VowAcceptCard callbackPath={canonicalPath} />
          ) : null}
          <ListingNotesPanel
            mlsNumber={listing.mlsNumber}
            signedIn={Boolean(user)}
            initialBody={notePreview?.body ?? ""}
            authCallbackUrl={canonicalPath}
            className="hidden md:block"
          />
          <ListingMobileNotes
            mlsNumber={listing.mlsNumber}
            signedIn={Boolean(user)}
            initialBody={notePreview?.body ?? ""}
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
            contact={
              user
                ? {
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                  }
                : undefined
            }
          />
          <MlsDisclaimer />
        </aside>
      </div>
    </div>
    </>
  );
}
