/**
 * Stage 5.5 — Batch hydrate canonical SavedListing rows as mobile property cards.
 * One Prisma batch per page — no per-listing PropTx calls.
 */

import { enrichListingCardForMobile } from "@/lib/mobile/v2/build-property-detail";
import { toCard } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";

export type SavedListingCardRow = {
  mlsNumber: string;
  card: ReturnType<typeof enrichListingCardForMobile> | null;
};

export type SavedListingCardsPage = {
  listings: SavedListingCardRow[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
};

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

export async function loadSavedListingCardsForUser(
  userId: string,
  opts?: { limit?: number; offset?: number },
): Promise<SavedListingCardsPage> {
  const limit = Math.min(
    Math.max(opts?.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const offset = Math.max(opts?.offset ?? 0, 0);

  const [total, savedRows] = await Promise.all([
    prisma.savedListing.count({ where: { userId } }),
    prisma.savedListing.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit + 1,
      select: { mlsNumber: true },
    }),
  ]);

  const hasMore = savedRows.length > limit;
  const page = hasMore ? savedRows.slice(0, limit) : savedRows;
  const mlsNumbers = page.map((r) => r.mlsNumber);

  if (mlsNumbers.length === 0) {
    return { listings: [], total, hasMore: false, limit, offset };
  }

  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: mlsNumbers } },
    include: {
      media: { orderBy: { sortOrder: "asc" } },
      openHouses: { orderBy: { startsAt: "asc" } },
    },
  });

  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  const rows: SavedListingCardRow[] = page.map((row) => {
    const listing = byMls.get(row.mlsNumber);
    if (!listing) {
      return { mlsNumber: row.mlsNumber, card: null };
    }
    return {
      mlsNumber: row.mlsNumber,
      card: enrichListingCardForMobile(toCard(listing)),
    };
  });

  return { listings: rows, total, hasMore, limit, offset };
}
