import Link from "next/link";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { HomeAreaRail } from "@/components/home/HomeAreaRail";
import { HomeCustomerToolsStrip } from "@/components/home/HomeCustomerToolsStrip";
import { HomeCustomerToolsTease } from "@/components/home/HomeCustomerToolsTease";
import { HomeHeroSearch } from "@/components/home/HomeHeroSearch";
import { HomeListingRail } from "@/components/home/HomeListingRail";
import { HomeOwnerListingRail } from "@/components/home/HomeOwnerListingRail";
import { HomeRecentlyViewedRail } from "@/components/home/HomeRecentlyViewedRail";
import { HomeSoldRail } from "@/components/home/HomeSoldRail";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
import { HomepageSortedRails } from "@/components/home/HomepageSortedRails";
import { PersonalizeHomepageButton } from "@/components/home/PersonalizeHomepageButton";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { auth } from "@/lib/auth";
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
import { hasClientAccess } from "@/lib/vow";
import type { ListingSegment, PropertyType } from "@prisma/client";

export default async function HomePage() {
  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, role: true },
      })
    : null;
  const isClient = hasClientAccess(user);
  const isCustomer = Boolean(
    user && user.role !== "ADMIN" && user.role !== "AGENT",
  );

  const activeHomepageSearch =
    isCustomer && user
      ? await prisma.savedSearch.findFirst({
          where: { userId: user.id, isHomepageActive: true },
        })
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
    newResidential,
    forLease,
    commercial,
    openHouses,
    soldResult,
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
            segment: "RESIDENTIAL",
            transactionType: "SALE",
            sort: "newest",
            limit: 4,
          },
          personalization,
        ),
      ),
      provider.search(
        applyPersonalizationToSearchParams(
          {
            status: "ACTIVE",
            transactionType: "LEASE",
            segment: "ALL",
            limit: 4,
          },
          personalization,
        ),
      ),
      provider.search(
        applyPersonalizationToSearchParams(
          {
            status: "ACTIVE",
            segment: "COMMERCIAL",
            transactionType: "SALE",
            limit: 4,
          },
          personalization,
        ),
      ),
      provider.openHouses({
        city: personalization?.city,
        communities: personalization?.communities,
        propertyTypes: personalization?.propertyTypes as
          | PropertyType[]
          | undefined,
        minPrice: personalization?.minPrice
          ? Number(personalization.minPrice)
          : undefined,
        maxPrice: personalization?.maxPrice
          ? Number(personalization.maxPrice)
          : undefined,
      }),
      provider.search(
        applyPersonalizationToSearchParams(
          {
            status: "SOLD",
            segment: "ALL",
            transactionType: "SALE",
            limit: 4,
          },
          personalization,
        ),
      ),
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
          ])
        : Promise.resolve(null),
      isCustomer && user
        ? prisma.listingView.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: personalized ? 80 : 40,
            select: { mlsNumber: true },
          })
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

  const weekendOpenHouses = openHouses
    .filter((l) =>
      l.openHouses.some((oh) => {
        const day = new Date(oh.startsAt).getDay();
        return day === 0 || day === 6;
      }),
    )
    .slice(0, 4);

  const soldForDisplay = isClient
    ? soldResult.items
    : soldResult.items.map((item) => ({ ...item, soldPrice: null }));

  const openHouseItems = weekendOpenHouses.length
    ? weekendOpenHouses
    : openHouses.slice(0, 4);

  return (
    <div>
      <section id="home-hero" className="relative z-[35]">
        <div className="absolute inset-0 overflow-hidden">
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
        <div className="relative flex min-h-[40vh] w-full flex-col justify-end px-4 pb-8 pt-20 sm:px-6 lg:px-10">
          <div>
            <p className="font-display text-3xl tracking-tight text-white sm:text-4xl md:text-5xl">
              Find Homes in Ontario
            </p>
            <h1 className="mt-3 text-base font-medium text-white/90 sm:text-lg md:text-xl">
              Search Residential and Commercial Properties — Data using Technology
            </h1>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="min-w-0 flex-1">
              <HomeHeroSearch />
            </div>
            {isCustomer ? (
              <div className="shrink-0 pb-1">
                <PersonalizeHomepageButton
                  cities={popularCities.map((row) => row.city)}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="empty:hidden">
        <HomepagePersonalizationBanner
          cities={popularCities.map((row) => row.city)}
          forceShow
        />
        <SavedSearchChipBar
          forceShow
          cities={popularCities.map((row) => row.city)}
        />
      </div>

      {isCustomer && customerTools ? (
        <HomeCustomerToolsStrip
          savedCount={customerTools[0]}
          noteCount={customerTools[1]}
          propertyWatchCount={customerTools[2]}
          areaWatchCount={customerTools[3]}
          unreadAlerts={customerTools[4]}
        />
      ) : !user ? (
        <HomeCustomerToolsTease />
      ) : null}

      <div className="w-full px-4 pb-2 pt-1 sm:px-6 lg:px-10">
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

      <div className="w-full space-y-16 px-4 py-10 sm:px-6 lg:px-10">
        {personalized ? (
          <p className="rounded-2xl border border-canopy/20 bg-canopy/5 px-4 py-3 text-sm text-canopy-deep">
            Showing listings that match your homepage search
            {activeHomepageSearch ? (
              <>
                {" "}
                <span className="font-semibold">
                  {activeHomepageSearch.name}
                </span>
              </>
            ) : null}
            . Use <span className="font-semibold">Show all listings</span> in
            the banner above to restore the full homepage.
          </p>
        ) : null}

        <HomepageSortedRails
          reorderEmptyLast={personalized}
          personalization={personalization}
          sections={[
            ...(recentlyViewed.length > 0 || personalized
              ? [
                  {
                    id: "recently-viewed",
                    resultCount: recentlyViewed.length,
                    node: (
                      <HomeRecentlyViewedRail
                        items={recentlyViewed}
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
              id: "new-listings",
              resultCount: newResidential.items.length,
              node: (
                <HomeListingRail
                  title="New Listings"
                  href={
                    seeAllBase
                      ? seeAllBase({
                          transactionType: "SALE",
                          segment: "RESIDENTIAL",
                        })
                      : "/search?transactionType=SALE"
                  }
                  items={newResidential.items}
                  emptyLabel={
                    personalized
                      ? "No new listings match your homepage search."
                      : undefined
                  }
                />
              ),
            },
            {
              id: "for-lease",
              resultCount: forLease.items.length,
              node: (
                <HomeListingRail
                  title="For lease"
                  href={
                    seeAllBase
                      ? seeAllBase({ transactionType: "LEASE" })
                      : "/search?transactionType=LEASE"
                  }
                  items={forLease.items}
                  emptyLabel={
                    personalized
                      ? "No lease listings match your homepage search."
                      : "No lease listings in demo inventory right now."
                  }
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
            {
              id: "open-houses",
              resultCount: openHouseItems.length,
              node: (
                <HomeListingRail
                  title="Open Houses this Weekend"
                  href={
                    seeAllBase
                      ? seeAllBase({
                          transactionType: "SALE",
                          openHouseOnly: "1",
                        })
                      : "/open-houses"
                  }
                  items={openHouseItems}
                  emptyLabel={
                    personalized
                      ? "No open houses match your homepage search."
                      : "No open houses in the demo window right now."
                  }
                />
              ),
            },
            ...(soldForDisplay.length > 0 || personalized
              ? [
                  {
                    id: "recently-sold",
                    resultCount: soldForDisplay.length,
                    node: (
                      <HomeSoldRail
                        items={soldForDisplay}
                        isClient={isClient}
                        emptyLabel={
                          personalized
                            ? "No recently sold homes match your homepage search."
                            : undefined
                        }
                      />
                    ),
                  },
                ]
              : []),
            {
              id: "commercial",
              resultCount: commercial.items.length,
              node: (
                <HomeListingRail
                  title="Commercial"
                  href={
                    seeAllBase
                      ? seeAllBase({
                          segment: "COMMERCIAL",
                          transactionType: "SALE",
                        })
                      : "/search?segment=COMMERCIAL&transactionType=SALE"
                  }
                  items={commercial.items}
                  emptyLabel={
                    personalized
                      ? "No commercial listings match your homepage search."
                      : "No commercial listings yet."
                  }
                />
              ),
            },
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
