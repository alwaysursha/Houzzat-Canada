import Image from "next/image";
import Link from "next/link";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { NearbyAmenities } from "@/components/listings/NearbyAmenities";
import { MarketPulseCard } from "@/components/market/MarketPulseCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoLocationBridge } from "@/components/site/SeoLocationContext";
import { getCommunityNarrative } from "@/lib/ai/narratives";
import { auth } from "@/lib/auth";
import {
  areaBreadcrumbJsonLd,
  areaFaqJsonLd,
  areaItemListJsonLd,
  areaPlaceJsonLd,
  buildAreaPageCopy,
  homesForSaleCityPath,
  listRelatedCommunities,
  type ResolvedAreaPlace,
} from "@/lib/geo/area-seo";
import { formatListingBedsLabel, formatPrice } from "@/lib/listings/constants";
import { formatBedsPlusLabel, parseListingFacts } from "@/lib/listings/facts";
import { listingPath } from "@/lib/listings/listing-path";
import { getMarketPulse } from "@/lib/market/pulse";
import { findNearbyPois, summarizePoiCounts } from "@/lib/poi/nearby";
import { prisma } from "@/lib/prisma";
import { withStagingSnapshotBoundary } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { stagingSnapshotVisibleForServerPage } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";
import { resolveClientAccess } from "@/lib/account-access";

const LISTING_PREVIEW_LIMIT = 24;

type Props = {
  place: ResolvedAreaPlace;
};

export async function AreaSeoPage({ place }: Props) {
  const stagingSnapshotVisible = await stagingSnapshotVisibleForServerPage();
  const listingWhere = withStagingSnapshotBoundary(
    {
      status: "ACTIVE" as const,
      segment: { in: ["RESIDENTIAL" as const, "COMMERCIAL" as const] },
      city: { equals: place.city, mode: "insensitive" as const },
      ...(place.community
        ? {
            community: {
              equals: place.community,
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    stagingSnapshotVisible,
  );

  const [activeCount, listings, session] = await Promise.all([
    prisma.listing.count({ where: listingWhere }),
    prisma.listing.findMany({
      where: listingWhere,
      include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
      orderBy: [{ listedAt: "desc" }, { listPrice: "asc" }],
      take: LISTING_PREVIEW_LIMIT,
    }),
    auth(),
  ]);

  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, emailVerified: true, createdAt: true },
      })
    : null;
  const access = resolveClientAccess(user);
  const vowOk = access.hasClientAccess;

  const [nearby, narrative, pulse, related] = await Promise.all([
    findNearbyPois({
      lat: place.lat,
      lng: place.lng,
      radiusKm: place.isCityPage ? 6 : 3,
      limitPerType: 10,
    }),
    getCommunityNarrative({
      slug: place.slug,
      displayName: place.displayName,
      city: place.city,
      lat: place.lat,
      lng: place.lng,
      listingCount: activeCount,
    }),
    getMarketPulse({
      city: place.city,
      community: place.community,
      includeSold: vowOk,
    }),
    place.isCityPage
      ? listRelatedCommunities(place.city, null, 16)
      : listRelatedCommunities(place.city, place.community, 8),
  ]);

  const amenityCounts = summarizePoiCounts(nearby);
  const copy = buildAreaPageCopy({
    place,
    activeCount,
    pulse,
    amenityCounts,
  });
  const searchHref = `/search?city=${encodeURIComponent(place.city)}${
    place.community
      ? `&community=${encodeURIComponent(place.community)}`
      : ""
  }`;

  const itemList = areaItemListJsonLd({
    place,
    items: listings.map((listing, index) => ({
      name: listing.addressLine,
      path: listingPath(listing),
      position: index + 1,
    })),
  });

  return (
    <>
      <SeoLocationBridge city={place.city} community={place.community} />
      <JsonLd
        data={areaPlaceJsonLd({ place, description: copy.metaDescription })}
      />
      <JsonLd data={areaBreadcrumbJsonLd(place)} />
      <JsonLd data={areaFaqJsonLd(copy.faqs)} />
      {listings.length > 0 ? <JsonLd data={itemList} /> : null}

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:px-6">
        <nav aria-label="Breadcrumb" className="text-sm text-ink/55">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-canopy">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/areas" className="hover:text-canopy">
                Areas
              </Link>
            </li>
            {place.community ? (
              <>
                <li aria-hidden>/</li>
                <li>
                  <Link
                    href={homesForSaleCityPath(place.city)}
                    className="hover:text-canopy"
                  >
                    {place.city}
                  </Link>
                </li>
              </>
            ) : null}
            <li aria-hidden>/</li>
            <li className="text-ink/80">{place.displayName}</li>
          </ol>
        </nav>

        <header className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/45">
            {place.isCityPage ? "City guide" : "Neighbourhood guide"}
          </p>
          <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
            {copy.h1}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink/70">
            {copy.intro}
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-2xl text-ink">
            About {place.displayName}
          </h2>
          <p className="max-w-3xl leading-relaxed text-ink/75">
            {narrative.body}
          </p>
          <dl className="grid grid-cols-2 gap-4 pt-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-ink/45">Active listings</dt>
              <dd className="font-display text-2xl text-canopy">{activeCount}</dd>
            </div>
            <div>
              <dt className="text-ink/45">Schools nearby</dt>
              <dd className="font-display text-2xl text-canopy">
                {amenityCounts.SCHOOL ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-ink/45">Parks nearby</dt>
              <dd className="font-display text-2xl text-canopy">
                {amenityCounts.PARK ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-ink/45">Transit nearby</dt>
              <dd className="font-display text-2xl text-canopy">
                {amenityCounts.TRANSIT ?? 0}
              </dd>
            </div>
          </dl>
        </section>

        <MarketPulseCard
          pulse={pulse}
          vowCallbackPath={place.path}
          needsEmailVerification={access.needsEmailVerification}
        />

        <NearbyAmenities lat={place.lat} lng={place.lng} pois={nearby} />

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-ink">
                Homes for sale in {place.displayName}
              </h2>
              <p className="mt-1 text-sm text-ink/55">
                Showing {listings.length} of {activeCount} active listing
                {activeCount === 1 ? "" : "s"}
              </p>
            </div>
            <Link
              href={searchHref}
              className="text-sm font-medium text-canopy hover:underline"
            >
              Open in search →
            </Link>
          </div>
          {listings.length === 0 ? (
            <p className="text-sm text-ink/55">
              No active listings in this area right now.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => {
                const image = listing.media[0]?.url;
                return (
                  <Link
                    key={listing.id}
                    href={listingPath(listing)}
                    className="overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-canopy/40"
                  >
                    <div className="relative aspect-[16/10] bg-mist">
                      {image ? (
                        <Image
                          src={image}
                          alt={listing.addressLine}
                          fill
                          className="object-cover"
                          sizes="(max-width: 1024px) 50vw, 33vw"
                        />
                      ) : null}
                    </div>
                    <div className="space-y-1 p-4">
                      <p className="font-semibold text-ink">
                        {formatPrice(listing.listPrice)}
                      </p>
                      <p className="text-sm text-ink/80">{listing.addressLine}</p>
                      <p className="text-xs text-ink/50">
                        {formatListingBedsLabel({
                          beds: listing.beds,
                          bedsLabel: formatBedsPlusLabel(
                            listing.beds,
                            parseListingFacts(listing.facts),
                          ),
                        })}{" "}
                        bd · {listing.baths} ba
                        {listing.community ? ` · ${listing.community}` : ""}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {related.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-ink">
              {place.isCityPage
                ? `Neighbourhoods in ${place.city}`
                : `More ${place.city} neighbourhoods`}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {related.map((item) => (
                <li key={item.path}>
                  <Link
                    href={item.path}
                    className="inline-block border-b border-canopy/30 text-sm font-medium text-canopy hover:border-canopy"
                  >
                    {item.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-4">
          <h2 className="font-display text-2xl text-ink">
            {place.displayName} FAQs
          </h2>
          <div className="space-y-4">
            {copy.faqs.map((faq) => (
              <div key={faq.question}>
                <h3 className="text-base font-semibold text-ink">
                  {faq.question}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink/70">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        <MlsDisclaimer />
      </div>
    </>
  );
}
