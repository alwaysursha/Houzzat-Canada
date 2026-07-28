import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Bath, Bed, Car, Maximize2, ArrowDown, ArrowUp } from "lucide-react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { ListingNotesPanel } from "@/components/account/ListingNotesPanel";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { VowAcceptCard } from "@/components/account/VowAcceptCard";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
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
import { ListingMobileActionBar } from "@/components/listings/ListingMobileActionBar";
import { RecordRecentView } from "@/components/listings/RecordRecentView";
import { MarketPulseCard } from "@/components/market/MarketPulseCard";
import { ViewingRequestPanel } from "@/components/listings/ViewingRequestPanel";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import { slugifyPlace } from "@/lib/geo/distance";
import { buildListingHistoryRows, getLatestListPriceChange } from "@/lib/listings/history-rows";
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
import { getListingProvider } from "@/lib/listings/provider";
import { getPopularCities } from "@/lib/listings/popular-cities";
import { getMarketPulse } from "@/lib/market/pulse";
import { auth } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/locale";
import { findNearbyPois } from "@/lib/poi/nearby";
import { prisma } from "@/lib/prisma";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import { hasVowAccess } from "@/lib/vow";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { getExpertWhatsAppNumber } from "@/lib/whatsapp";

type Params = { params: Promise<{ mlsNumber: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mlsNumber } = await params;
  const listing = await getListingProvider().getByMls(mlsNumber);
  if (!listing) return { title: "Listing" };

  const cover =
    listing.media.find((media) => media.isPrimary) ?? listing.media[0] ?? null;
  const title = formatListingAddressOneLine(listing);
  const description = listing.description.slice(0, 160);
  const url = `${SITE_URL}/listing/${listing.mlsNumber}`;
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
    title,
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
  const { mlsNumber } = await params;
  const listing = await getListingProvider().getByMls(mlsNumber);
  if (!listing) notFound();

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
            },
          });
          return base
            ? { ...base, relatedListingsMode: "SAME_AREA" as const }
            : null;
        }
      })()
    : null;

  // VOW-only: MLS listings require a registered client; FSBO stays public.
  if (
    isVowOnlyMlsMode() &&
    listing.dataSource !== "fsbo" &&
    !hasVowAccess(user)
  ) {
    redirect(
      `/auth/sign-in?callbackUrl=${encodeURIComponent(`/listing/${listing.mlsNumber}`)}`,
    );
  }

  const vowOk = hasVowAccess(user);
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

  const [nearby, pulse, popularCities] = await Promise.all([
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
  ]);
  const personalizationCities = popularCities.map((row) => row.city);
  const upcomingOpenHouses = listing.openHouses.filter(
    (oh) => oh.endsAt.getTime() >= Date.now(),
  );

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
    url: `${SITE_URL}/listing/${listing.mlsNumber}`,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ListingMobileSideMenu
        mlsNumber={listing.mlsNumber}
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
      <div className="w-full min-w-0 space-y-8 px-4 pb-[calc(2rem+4.25rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-6 md:pb-8 md:pt-6 lg:px-10">
        {/*
          Sticky bar must be a descendant of this tall page section (including the
          grid below), not a short breadcrumbs+gallery wrapper — otherwise sticky
          ends when the gallery scrolls away.
        */}
        <ListingStickyBar
          crumbs={crumbs}
          mlsNumber={listing.mlsNumber}
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
            coverTag={coverTagLabel}
            coverTagClassName={listingStatusBadgeClass(listing.status)}
            segmentTag={segmentTagMeta}
            allowBooking={!isInactive}
            detailsLocked={detailsLocked}
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
            photos={listing.media.map((media) => ({
              id: media.id,
              url: media.url,
            }))}
          />
        </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-x-8 md:gap-y-5">
            <div className="min-w-0 w-full md:flex-1">
              {(coverTagLabel || segmentTagMeta) ? (
                <div className="mb-2.5 flex items-center justify-between gap-3 md:hidden">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {coverTagLabel ? (
                      <span
                        className={`rounded-md px-3 py-1.5 text-xs font-bold tracking-wide ${listingStatusBadgeClass(listing.status)}`}
                      >
                        {coverTagLabel}
                      </span>
                    ) : null}
                    {segmentTagMeta ? (
                      <span
                        className={
                          segmentTagMeta.tone === "commercial"
                            ? "rounded-md bg-ink px-3 py-1.5 text-xs font-bold tracking-wide text-white"
                            : segmentTagMeta.tone === "preconstruction"
                              ? "rounded-md bg-signal px-3 py-1.5 text-xs font-bold tracking-wide text-white"
                              : "rounded-md bg-mist px-3 py-1.5 text-xs font-bold tracking-wide text-ink ring-1 ring-line"
                        }
                      >
                        {segmentTagMeta.label}
                      </span>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-right text-sm font-medium leading-snug text-ink/55">
                    {timingLabel}
                  </p>
                </div>
              ) : (
                <p className="mb-2.5 text-right text-sm font-medium leading-snug text-ink/55 md:hidden">
                  {timingLabel}
                </p>
              )}
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
                      size="lg"
                    />
                  ) : detailsLocked ? (
                    <p className="text-3xl font-bold tracking-tight text-ink/55 sm:text-4xl">
                      <span className="mr-2 text-base font-semibold text-ink/45 sm:text-lg">
                        {listing.transactionType === "LEASE"
                          ? "Rent:"
                          : "Listed:"}
                      </span>
                      Sign in to see price
                    </p>
                  ) : (
                    <>
                      <p className="text-3xl font-bold tracking-tight text-canopy sm:text-4xl">
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
              </div>
              <h1 className="mt-1.5 text-base font-medium text-ink/70 sm:text-lg">
                {detailsLocked ? (
                  <span className="select-none blur-[5px]">{addressLabel}</span>
                ) : (
                  addressLabel
                )}
              </h1>
              {detailsLocked ? (
                <p className="mt-1 text-sm text-ink/55">
                  {propertyTypeLabel(listing.propertyType)}
                  {" · "}
                  {listing.city}
                  {" · "}
                  Sign in for full details
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
                    ? `grid w-full grid-cols-4 gap-2 md:flex md:w-auto md:items-start md:gap-10 ${detailsLocked ? "select-none blur-[5px]" : ""}`
                    : `grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:items-start md:gap-10 ${detailsLocked ? "select-none blur-[5px]" : ""}`
                }
              >
                {listing.segment !== "COMMERCIAL" ? (
                  <>
                    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center md:min-w-[5rem] md:gap-2">
                      <Bed
                        className="size-6 text-ink md:size-8"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="text-base font-semibold leading-tight text-ink">
                        {listing.beds} {listing.beds === 1 ? "Bed" : "Beds"}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center md:min-w-[5rem] md:gap-2">
                      <Bath
                        className="size-6 text-ink md:size-8"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="text-base font-semibold leading-tight text-ink">
                        {listing.baths} {listing.baths === 1 ? "Bath" : "Baths"}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="flex min-w-0 flex-col items-center gap-1.5 text-center md:min-w-[5rem] md:gap-2">
                  <Maximize2
                    className="size-6 text-ink md:size-8"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-base font-semibold leading-tight text-ink">
                    {listing.sqft
                      ? `${listing.sqft.toLocaleString()} SqFt`
                      : "n/a SqFt"}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-1.5 text-center md:min-w-[5rem] md:gap-2">
                  <Car
                    className="size-6 text-ink md:size-8"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-base font-semibold leading-tight text-ink">
                    {listing.parkingSpaces}{" "}
                    {listing.parkingSpaces === 1 ? "Parking" : "Parkings"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <ListingNarrative body={listing.description} />

          <ListingFactsPanel
            facts={listing.facts}
            propertyTypeLabel={propertyTypeLabel(listing.propertyType)}
            mlsNumber={listing.mlsNumber}
            community={listing.community}
            postalCode={listing.postalCode}
            taxesLabel={listing.taxes ? formatPrice(listing.taxes) : null}
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

          <ListingQaPanel
            mlsNumber={listing.mlsNumber}
            addressLine={addressLabel}
            city={listing.city}
            title={t(locale, "grounded_qa_title")}
            hint={t(locale, "grounded_qa_hint")}
            expertWhatsApp={getExpertWhatsAppNumber()}
          />

          <DriveTimePanel originLat={listing.lat} originLng={listing.lng} />

          <ListingHistoryPanel
            addressLabel={addressLabel}
            propertyType={listing.propertyType}
            transactionType={listing.transactionType}
            callbackPath={`/listing/${listing.mlsNumber}`}
            canSeeRestricted={canSeeRestricted}
            signedIn={Boolean(user)}
            rows={buildListingHistoryRows({
              mlsNumber: listing.mlsNumber,
              listPrice: listing.listPrice,
              listedAt: listing.listedAt,
              updatedAtMls: listing.updatedAtMls,
              status: listing.status,
              transactionType: listing.transactionType,
              history: listing.history,
            })}
          />

          <MarketPulseCard
            pulse={pulse}
            vowCallbackPath={`/listing/${listing.mlsNumber}`}
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
            <section className="space-y-3">
              <h2 className="font-display text-2xl text-ink">Open houses</h2>
              <ul className="space-y-2">
                {upcomingOpenHouses.map((oh) => (
                  <li
                    key={oh.id}
                    className="rounded-xl border border-signal/20 bg-signal/5 px-4 py-3 text-sm"
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

        <aside className="min-w-0 space-y-6">
          {detailsLocked ? (
            <VowAcceptCard callbackPath={`/listing/${listing.mlsNumber}`} />
          ) : null}
          <ListingNotesPanel
            mlsNumber={listing.mlsNumber}
            signedIn={Boolean(user)}
            initialBody={notePreview?.body ?? ""}
          />
          <div className="hidden md:block">
            <ViewingRequestPanel
              mlsNumber={listing.mlsNumber}
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
          </div>
          <MlsDisclaimer />
        </aside>
      </div>
    </div>
    </>
  );
}
