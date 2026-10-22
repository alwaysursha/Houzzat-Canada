import { needsEmailVerification as userNeedsEmailVerification } from "@/lib/account-access";
import { auth } from "@/lib/auth";
import {
  applyPersonalizationToSearchParams,
  listingMatchesHomepagePersonalization,
  parseHomepagePersonalizationQuery,
  type HomepagePersonalizationQuery,
} from "@/lib/listings/homepage-personalization";
import { getListingProvider, toCard } from "@/lib/listings/provider";
import type { ListingCard } from "@/lib/listings/types";
import { prisma } from "@/lib/prisma";
import { withStagingSnapshotBoundary } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { stagingSnapshotVisibleForServerPage } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import { hasClientAccess } from "@/lib/vow";

export type HomeCustomerShellPayload = {
  isCustomer: boolean;
  isClient: boolean;
  needsEmailVerification: boolean;
  vowOnlyGuest: boolean;
  personalization: HomepagePersonalizationQuery | null;
  personalized: boolean;
  tools: {
    savedCount: number;
    noteCount: number;
    propertyWatchCount: number;
    areaWatchCount: number;
    unreadAlerts: number;
  } | null;
  recentlyViewed: ListingCard[];
  ownerListings: ListingCard[];
};

/**
 * Signed-in homepage customer payload — intended for /api/account/home-shell
 * (not homepage RSC).
 */
export async function loadHomeCustomerShell(): Promise<HomeCustomerShellPayload> {
  const empty: HomeCustomerShellPayload = {
    isCustomer: false,
    isClient: false,
    needsEmailVerification: false,
    vowOnlyGuest: isVowOnlyMlsMode(),
    personalization: null,
    personalized: false,
    tools: null,
    recentlyViewed: [],
    ownerListings: [],
  };

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return empty;

  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    })
    .catch(() => null);

  if (!user) return empty;

  const isClient = hasClientAccess(user);
  const needsEmailVerification = userNeedsEmailVerification(user);
  const isCustomer = user.role !== "ADMIN" && user.role !== "AGENT";
  const vowOnlyGuest = isVowOnlyMlsMode() && !isClient;

  if (!isCustomer) {
    return {
      ...empty,
      isCustomer: false,
      isClient,
      needsEmailVerification,
      vowOnlyGuest,
    };
  }

  const activeHomepageSearch = await prisma.savedSearch
    .findFirst({
      where: { userId: user.id, isHomepageActive: true },
    })
    .catch(() => null);

  const personalization = activeHomepageSearch
    ? parseHomepagePersonalizationQuery(activeHomepageSearch.query)
    : null;
  const personalized = Boolean(personalization);

  const provider = getListingProvider();

  const [ownerListings, toolCounts, recentViews] = await Promise.all([
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
    Promise.all([
      prisma.savedListing.count({ where: { userId: user.id } }),
      prisma.listingNote.count({ where: { userId: user.id } }),
      prisma.propertyMonitor.count({ where: { userId: user.id } }),
      prisma.areaMonitor.count({ where: { userId: user.id } }),
      prisma.customerAlert.count({
        where: { userId: user.id, readAt: null },
      }),
    ]).catch(() => null),
    prisma.listingView
      .findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: personalized ? 80 : 40,
        select: { mlsNumber: true },
      })
      .catch(() => []),
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
          where: withStagingSnapshotBoundary(
            { mlsNumber: { in: recentMls } },
            await stagingSnapshotVisibleForServerPage(),
          ),
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

  return {
    isCustomer: true,
    isClient,
    needsEmailVerification,
    vowOnlyGuest,
    personalization,
    personalized,
    tools: toolCounts
      ? {
          savedCount: toolCounts[0],
          noteCount: toolCounts[1],
          propertyWatchCount: toolCounts[2],
          areaWatchCount: toolCounts[3],
          unreadAlerts: toolCounts[4],
        }
      : null,
    recentlyViewed,
    ownerListings: ownerListings.items,
  };
}
