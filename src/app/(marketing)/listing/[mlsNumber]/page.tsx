import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bath, Bed, Car, Maximize2, ArrowDown, ArrowUp } from "lucide-react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { ListingNotesPanel } from "@/components/account/ListingNotesPanel";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { VowAcceptCard } from "@/components/account/VowAcceptCard";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
import { ListingGallery } from "@/components/listings/ListingGallery";
import { ListingHistoryPanel } from "@/components/listings/ListingHistoryPanel";
import { ListingNarrative } from "@/components/listings/ListingNarrative";
import { ListingQaPanel } from "@/components/listings/ListingQaPanel";
import { ListingStickyBar } from "@/components/listings/ListingStickyBar";
import { NearbyAmenities } from "@/components/listings/NearbyAmenities";
import { DriveTimePanel } from "@/components/listings/DriveTimePanel";
import { MarketPulseCard } from "@/components/market/MarketPulseCard";
import { ViewingRequestPanel } from "@/components/listings/ViewingRequestPanel";
import { slugifyPlace } from "@/lib/geo/distance";
import { buildListingHistoryRows, getLatestListPriceChange } from "@/lib/listings/history-rows";
import {
  closedPriceLabel,
  formatDaysAgo,
  formatListPrice,
  formatPrice,
  isClosedListingStatus,
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
import { hasVowAccess } from "@/lib/vow";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

type Params = { params: Promise<{ mlsNumber: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mlsNumber } = await params;
  const listing = await getListingProvider().getByMls(mlsNumber);
  if (!listing) return { title: "Listing" };

  const cover =
    listing.media.find((media) => media.isPrimary) ?? listing.media[0] ?? null;
  const title = `${listing.addressLine}, ${listing.city}`;
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
    ? await prisma.user.findUnique({ where: { email: session.user.email } })
    : null;

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
  const canSeeRestricted = vowOk;
  const latestPriceChange = getLatestListPriceChange(
    listing.history,
    listing.mlsNumber,
    { includeRestricted: canSeeRestricted },
  );
  const areaSlug = listing.community
    ? slugifyPlace(listing.city, listing.community)
    : slugifyPlace(listing.city);
  const province = listing.province?.trim() || "ON";
  const addressLabel = listing.unitNumber
    ? `${listing.unitNumber} – ${listing.addressLine}`
    : listing.addressLine;
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
  crumbs.push({ label: addressLabel });

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="w-full space-y-8 px-4 pb-8 pt-0 sm:px-6 lg:px-10">
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
        />

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
          coverTag={listingStatusLabel(
            listing.status,
            listing.transactionType,
          )}
          segmentTag={{
            label: segmentLabel(listing.segment),
            tone:
              listing.segment === "COMMERCIAL"
                ? "commercial"
                : listing.segment === "PRE_CONSTRUCTION"
                  ? "preconstruction"
                  : "residential",
          }}
          mapSubject={
            Number.isFinite(listing.lat) && Number.isFinite(listing.lng)
              ? {
                  mlsNumber: listing.mlsNumber,
                  lat: listing.lat,
                  lng: listing.lng,
                  addressLabel: listing.unitNumber
                    ? `${listing.unitNumber} – ${listing.addressLine}`
                    : listing.addressLine,
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

      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-3xl font-bold tracking-tight text-canopy sm:text-4xl">
                  {formatListPrice(listing.listPrice, listing.transactionType)}
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
              </div>
              <h1 className="mt-1.5 text-base font-medium text-ink/70 sm:text-lg">
                {[
                  listing.unitNumber
                    ? `${listing.unitNumber} – ${listing.addressLine}`
                    : listing.addressLine,
                  listing.city,
                  listing.province || "ON",
                  listing.postalCode,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </h1>
              {showClosedPrice ? (
                canSeeRestricted ? (
                  <p className="mt-1 text-sm font-medium text-ink/50">
                    {closedPriceLabel(listing.status)}{" "}
                    {formatListPrice(
                      listing.soldPrice!,
                      listing.transactionType,
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-sm font-medium text-ink/40">
                    {closedPriceLabel(listing.status)} price locked · register
                    to unlock
                  </p>
                )
              ) : null}
              {listing.community ? (
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

            <div className="flex shrink-0 flex-col items-end gap-2">
              <p className="text-base font-medium text-ink/55">
                {listing.daysOnMarket <= 0
                  ? "Added today"
                  : `Added ${formatDaysAgo(listing.daysOnMarket)}`}
              </p>
              <div className="flex items-start gap-7 sm:gap-10">
                {listing.segment !== "COMMERCIAL" ? (
                  <>
                    <div className="flex min-w-[5rem] flex-col items-center gap-2 text-center">
                      <Bed
                        className="size-7 text-ink sm:size-8"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="text-base font-semibold text-ink">
                        {listing.beds} {listing.beds === 1 ? "Bed" : "Beds"}
                      </span>
                    </div>
                    <div className="flex min-w-[5rem] flex-col items-center gap-2 text-center">
                      <Bath
                        className="size-7 text-ink sm:size-8"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="text-base font-semibold text-ink">
                        {listing.baths} {listing.baths === 1 ? "Bath" : "Baths"}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="flex min-w-[5rem] flex-col items-center gap-2 text-center">
                  <Maximize2
                    className="size-7 text-ink sm:size-8"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-base font-semibold text-ink">
                    {listing.sqft
                      ? `${listing.sqft.toLocaleString()} SqFt`
                      : "n/a SqFt"}
                  </span>
                </div>
                <div className="flex min-w-[5rem] flex-col items-center gap-2 text-center">
                  <Car
                    className="size-7 text-ink sm:size-8"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-base font-semibold text-ink">
                    {listing.parkingSpaces}{" "}
                    {listing.parkingSpaces === 1 ? "Parking" : "Parkings"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <ListingNarrative body={listing.description} />

          <ListingQaPanel
            mlsNumber={listing.mlsNumber}
            addressLine={
              listing.unitNumber
                ? `${listing.unitNumber} – ${listing.addressLine}`
                : listing.addressLine
            }
            city={listing.city}
            title={t(locale, "grounded_qa_title")}
            hint={t(locale, "grounded_qa_hint")}
          />

          <DriveTimePanel originLat={listing.lat} originLng={listing.lng} />

          <ListingHistoryPanel
            addressLabel={[
              listing.unitNumber
                ? `${listing.unitNumber} – ${listing.addressLine}`
                : listing.addressLine,
              listing.city,
            ].join(", ")}
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

          <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface p-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink/45">Taxes</dt>
              <dd className="font-medium">
                {listing.taxes ? formatPrice(listing.taxes) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink/45">Maintenance</dt>
              <dd className="font-medium">
                {listing.maintenanceFee
                  ? `${formatPrice(listing.maintenanceFee)}/mo`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink/45">Parking</dt>
              <dd className="font-medium">{listing.parkingSpaces}</dd>
            </div>
            <div>
              <dt className="text-ink/45">Year built</dt>
              <dd className="font-medium">{listing.yearBuilt ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink/45">Days on market</dt>
              <dd className="font-medium">{listing.daysOnMarket}</dd>
            </div>
            <div>
              <dt className="text-ink/45">Brokerage</dt>
              <dd className="font-medium">{listing.brokerageName}</dd>
            </div>
          </dl>

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

        <aside className="space-y-6">
          {!canSeeRestricted && showClosedPrice ? (
            <VowAcceptCard callbackPath={`/listing/${listing.mlsNumber}`} />
          ) : null}
          <ListingNotesPanel
            mlsNumber={listing.mlsNumber}
            signedIn={Boolean(user)}
            initialBody={notePreview?.body ?? ""}
          />
          <ViewingRequestPanel
            mlsNumber={listing.mlsNumber}
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
