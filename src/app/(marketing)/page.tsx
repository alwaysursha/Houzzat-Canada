import Link from "next/link";
import type { Metadata } from "next";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { HomeAreaRail } from "@/components/home/HomeAreaRail";
import { HomeCustomerToolsStrip } from "@/components/home/HomeCustomerToolsStrip";
import { HomeCustomerToolsTease } from "@/components/home/HomeCustomerToolsTease";
import { HomeBrowseChips } from "@/components/home/HomeBrowseChips";
import { HomeHeroSearch } from "@/components/home/HomeHeroSearch";
import { HomeOwnerListingRail } from "@/components/home/HomeOwnerListingRail";
import { HomeRecentlyViewedRail } from "@/components/home/HomeRecentlyViewedRail";
import { HomepageMarketRails } from "@/components/home/HomepageMarketRails";
import { HomepageSortedRails } from "@/components/home/HomepageSortedRails";
import { auth } from "@/lib/auth";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { cityLandmarkImage } from "@/lib/geo/area-images";
import {
  applyPersonalizationToSearchParams,
  listingMatchesHomepagePersonalization,
  parseHomepagePersonalizationQuery,
  personalizationToSearchHref,
} from "@/lib/listings/homepage-personalization";
import { getListingProvider, toCard } from "@/lib/listings/provider";
import { getPopularCities } from "@/lib/listings/popular-cities";
import { prisma } from "@/lib/prisma";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import { needsEmailVerification as userNeedsEmailVerification } from "@/lib/account-access";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/seo";
import { hasClientAccess } from "@/lib/vow";
import type { ListingSegment, PropertyType } from "@prisma/client";

export const metadata: Metadata = {
  title: {
    absolute: `${SITE_NAME} | GTA Homes for Sale & Open Houses`,
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: `${SITE_NAME} | GTA Homes for Sale & Open Houses`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    type: "website",
    locale: "en_CA",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | GTA Homes for Sale & Open Houses`,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE.url],
  },
};

export default async function HomePage() {
  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user
        .findUnique({
          where: { email: session.user.email },
          select: {
            id: true,
            role: true,
            emailVerified: true,
            createdAt: true,
          },
        })
        .catch(() => null)
    : null;
  const isClient = hasClientAccess(user);
  const needsEmailVerification = userNeedsEmailVerification(user);
  const isCustomer = Boolean(
    user && user.role !== "ADMIN" && user.role !== "AGENT",
  );
  const vowOnlyGuest = isVowOnlyMlsMode() && !isClient;

  const activeHomepageSearch =
    isCustomer && user
      ? await prisma.savedSearch
          .findFirst({
            where: { userId: user.id, isHomepageActive: true },
          })
          .catch(() => null)
      : null;
  const personalization = activeHomepageSearch
    ? parseHomepagePersonalizationQuery(activeHomepageSearch.query)
    : null;
  const personalized = Boolean(personalization);
  const seeAllBase = personalization
    ? (extra?: Record<string, string | undefined>) =>
        personalizationToSearchHref(personalization, extra)
    : null;

  const provider = getListingProvider();

  const [
    ownerListings,
    places,
    customerTools,
    recentViews,
    popularCities,
  ] = await Promise.all([
      provider.search(
        applyPersonalizationToSearchParams(
          {
            status: "ACTIVE",
            dataSource: "fsbo",
            transactionType: "ALL",
            segment: "ALL",
            limit: 4,
          },
          personalization,
        ),
      ),
      prisma.geoPlace.findMany({
        where: { published: true },
        orderBy: { displayName: "asc" },
        take: 4,
      }),
      isCustomer && user
        ? Promise.all([
            prisma.savedListing.count({ where: { userId: user.id } }),
            prisma.listingNote.count({ where: { userId: user.id } }),
            prisma.propertyMonitor.count({ where: { userId: user.id } }),
            prisma.areaMonitor.count({ where: { userId: user.id } }),
            prisma.customerAlert.count({
              where: { userId: user.id, readAt: null },
            }),
          ]).catch(() => null)
        : Promise.resolve(null),
      isCustomer && user
        ? prisma.listingView
            .findMany({
              where: { userId: user.id },
              orderBy: { createdAt: "desc" },
              take: personalized ? 80 : 40,
              select: { mlsNumber: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
      getPopularCities(8),
    ]);

  const recentMls: string[] = [];
  for (const row of recentViews) {
    if (!recentMls.includes(row.mlsNumber)) recentMls.push(row.mlsNumber);
    if (recentMls.length >= (personalized ? 40 : 4)) break;
  }

  const recentListings =
    recentMls.length === 0
      ? []
      : await prisma.listing.findMany({
          where: { mlsNumber: { in: recentMls } },
          include: {
            media: true,
            openHouses: true,
          },
        });
  const recentByMls = new Map(recentListings.map((l) => [l.mlsNumber, l]));
  const recentlyViewed = recentMls
    .map((mls) => recentByMls.get(mls))
    .filter(Boolean)
    .filter((listing) =>
      listingMatchesHomepagePersonalization(listing!, personalization),
    )
    .slice(0, 4)
    .map((listing) => toCard(listing!));

  const areaStats = await Promise.all(
    places.map(async (place) => {
      const active = await prisma.listing.findMany({
        where: {
          status: "ACTIVE",
          transactionType: "SALE",
          segment: {
            in: ["RESIDENTIAL", "COMMERCIAL"] satisfies ListingSegment[],
          },
          city: { equals: place.city, mode: "insensitive" },
          ...(place.community
            ? {
                community: {
                  equals: place.community,
                  mode: "insensitive" as const,
                },
              }
            : {}),
        },
        select: {
          listPrice: true,
          daysOnMarket: true,
          propertyType: true,
          openHouses: {
            where: { endsAt: { gte: new Date() } },
            select: { id: true },
          },
          media: {
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            take: 1,
            select: { url: true },
          },
        },
        orderBy: { listedAt: "desc" },
        // Keep small — large city scans contribute to Worker 1102 under load.
        take: 48,
      });

      const prices = active.map((a) => a.listPrice).sort((a, b) => a - b);
      const median =
        prices.length === 0
          ? null
          : prices.length % 2 === 0
            ? Math.round(
                (prices[prices.length / 2 - 1]! + prices[prices.length / 2]!) /
                  2,
              )
            : prices[Math.floor(prices.length / 2)]!;

      const avgDaysOnMarket =
        active.length === 0
          ? null
          : Math.round(
              active.reduce((sum, row) => sum + row.daysOnMarket, 0) /
                active.length,
            );

      const typeCounts = new Map<PropertyType, number>();
      for (const row of active) {
        typeCounts.set(
          row.propertyType,
          (typeCounts.get(row.propertyType) ?? 0) + 1,
        );
      }
      let topPropertyType: PropertyType | null = null;
      let topCount = 0;
      for (const [type, count] of typeCounts) {
        if (count > topCount) {
          topPropertyType = type;
          topCount = count;
        }
      }

      const listingCover = active.find((row) => row.media[0]?.url)?.media[0]
        ?.url;
      const imageUrl = listingCover ?? cityLandmarkImage(place.city);

      return {
        slug: place.slug,
        displayName: place.displayName,
        city: place.city,
        community: place.community,
        summary: place.summary,
        imageUrl,
        imageSource: listingCover ? ("listing" as const) : ("city" as const),
        activeCount: active.length,
        medianListPrice: median,
        minListPrice: prices[0] ?? null,
        maxListPrice: prices[prices.length - 1] ?? null,
        avgDaysOnMarket,
        openHouseCount: active.reduce(
          (sum, row) => sum + row.openHouses.length,
          0,
        ),
        topPropertyType,
      };
    }),
  );

  return (
    <div>
      <section id="home-hero" className="relative z-[35]">
        {/* Desktop brand hero — hidden on mobile so listings start near the fold */}
        <div className="absolute inset-0 hidden overflow-hidden sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element -- serve original hero pixels without optimizer recompression */}
          <img
            src="/images/hero-canadian-homes.jpg"
            alt="Toronto skyline over Queen's Park"
            className="absolute inset-0 h-full w-full object-cover object-[right_20%]"
            fetchPriority="high"
            decoding="async"
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgb(15 107 76 / 0.97) 0%, rgb(15 107 76 / 0.88) 22%, rgb(15 107 76 / 0.55) 48%, rgb(15 107 76 / 0.18) 72%, transparent 100%)",
            }}
          />
        </div>

        {/* Mobile: compact search + section shortcuts (no tall hero) */}
        <div
          className="relative px-4 pb-4 pt-3 sm:hidden"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgb(15 107 76 / 0.2) 0%, rgb(15 107 76 / 0.08) 45%, rgb(15 107 76 / 0) 100%)",
          }}
        >
          <h1 className="sr-only">
            Find homes in Ontario — search GTA residential and commercial
            properties
          </h1>
          <HomeHeroSearch surface="page" />
          <HomeBrowseChips className="mt-3" />
        </div>

        {/* Desktop hero copy + search */}
        <div className="relative hidden min-h-[40vh] w-full flex-col justify-end px-4 pb-8 pt-20 sm:flex sm:px-6 lg:px-10">
          <div>
            <h1 className="font-display text-3xl tracking-tight text-white sm:text-4xl md:text-5xl">
              Find Homes in Ontario
            </h1>
            <p className="mt-3 text-base font-medium text-white/90 sm:text-lg md:text-xl">
              Search Residential and Commercial Properties — Data using Technology
            </p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="min-w-0 flex-1">
              <HomeHeroSearch />
            </div>
          </div>
        </div>
      </section>

      {isCustomer && customerTools ? (
        <HomeCustomerToolsStrip
          savedCount={customerTools[0]}
          noteCount={customerTools[1]}
          propertyWatchCount={customerTools[2]}
          areaWatchCount={customerTools[3]}
          unreadAlerts={customerTools[4]}
          cities={popularCities.map((row) => row.city)}
        />
      ) : !user ? (
        <div className="hidden sm:block">
          <HomeCustomerToolsTease />
        </div>
      ) : null}

      <div className="hidden w-full px-4 pb-2 pt-1 sm:block sm:px-6 lg:px-10">
        {popularCities.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/40">
              Popular Cities
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {popularCities.map(({ city }) => (
                <Link
                  key={city}
                  href={
                    seeAllBase
                      ? seeAllBase({ city })
                      : `/search?city=${encodeURIComponent(city)}`
                  }
                  className="rounded-md px-2.5 py-1 text-sm text-ink/55 transition hover:bg-canopy/5 hover:text-canopy"
                >
                  {city}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="w-full space-y-10 px-4 py-6 sm:space-y-16 sm:px-6 sm:py-10 lg:px-10">
        <HomepageSortedRails
          reorderEmptyLast={personalized}
          personalization={personalization}
          cities={popularCities.map((row) => row.city)}
          sections={[
            ...(recentlyViewed.length > 0 || personalized || !isCustomer
              ? [
                  {
                    id: "recently-viewed",
                    // Guests may hydrate from localStorage — keep slot until empty.
                    resultCount:
                      recentlyViewed.length > 0
                        ? recentlyViewed.length
                        : !isCustomer
                          ? 1
                          : 0,
                    node: (
                      <HomeRecentlyViewedRail
                        items={recentlyViewed}
                        useLocalFallback={!isCustomer}
                        emptyLabel={
                          personalized
                            ? "None of your recently viewed homes match your homepage search."
                            : undefined
                        }
                      />
                    ),
                  },
                ]
              : []),
            {
              id: "market-rails",
              resultCount: 1,
              node: (
                <HomepageMarketRails
                  isClient={isClient}
                  needsEmailVerification={needsEmailVerification}
                  vowOnlyGuest={vowOnlyGuest}
                  personalization={personalization}
                />
              ),
            },
            ...(ownerListings.items.length > 0 || personalized
              ? [
                  {
                    id: "owner",
                    resultCount: ownerListings.items.length,
                    node: (
                      <HomeOwnerListingRail
                        items={ownerListings.items}
                        emptyLabel={
                          personalized
                            ? "No owner listings match your homepage search."
                            : undefined
                        }
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />

        <HomeAreaRail places={areaStats} />

        <section className="space-y-4">
          <h2 className="font-display text-2xl text-ink">For sellers</h2>
          <p className="max-w-2xl text-sm text-ink/65">
            Price with confidence, then get launch-ready — valuation, readiness
            checklist, and agent follow-up.
          </p>
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <Link href="/home-valuation" className="text-canopy hover:underline">
              Home valuation →
            </Link>
            <Link
              href="/tools/seller-readiness"
              className="text-canopy hover:underline"
            >
              Seller readiness →
            </Link>
            <Link
              href="/tools/affordability"
              className="text-canopy hover:underline"
            >
              Buyer affordability →
            </Link>
          </div>
        </section>

        <MlsDisclaimer />
      </div>
    </div>
  );
}
