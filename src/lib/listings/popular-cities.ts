import type { ListingSegment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PUBLIC_SEGMENTS: ListingSegment[] = ["RESIDENTIAL", "COMMERCIAL"];

const PUBLIC_ACTIVE_WHERE: Prisma.ListingWhereInput = {
  status: "ACTIVE",
  segment: { in: PUBLIC_SEGMENTS },
  OR: [
    { dataSource: { not: "fsbo" } },
    { dataSource: "fsbo", ownerStatus: "ACTIVE" },
  ],
};

/**
 * Cities ranked by active public inventory count.
 * Works for mock seed data and TRREB/PropTx rows once synced into `Listing`.
 */
export async function getPopularCities(limit = 8) {
  const rows = await prisma.listing.groupBy({
    by: ["city"],
    where: PUBLIC_ACTIVE_WHERE,
    _count: { _all: true },
    orderBy: { _count: { city: "desc" } },
    take: limit,
  });

  return rows
    .filter((row) => row.city.trim().length > 0)
    .map((row) => ({
      city: row.city,
      count: row._count._all,
    }));
}
