import type { ListingSegment, PropertyType } from "@prisma/client";
import { cityLandmarkImage } from "@/lib/geo/area-images";
import { prisma } from "@/lib/prisma";

/** Sample size per area — enough for median/cover, light on Neon. */
export const HOME_AREA_SAMPLE_SIZE = 16;

const PLACE_LIMIT = 4;

export type HomeAreaCardData = {
  slug: string;
  displayName: string;
  city: string;
  community?: string | null;
  summary: string | null;
  imageUrl: string;
  imageSource: "listing" | "city";
  activeCount: number;
  medianListPrice: number | null;
  minListPrice: number | null;
  maxListPrice: number | null;
  avgDaysOnMarket: number | null;
  openHouseCount: number;
  topPropertyType: PropertyType | null;
};

/**
 * Build Explore Areas cards from published geo places + a small listing sample.
 * Safe to call from API routes (not homepage SSR).
 */
export async function loadHomeAreaStats(): Promise<HomeAreaCardData[]> {
  const places = await prisma.geoPlace.findMany({
    where: { published: true },
    orderBy: { displayName: "asc" },
    take: PLACE_LIMIT,
  });

  return Promise.all(
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
        take: HOME_AREA_SAMPLE_SIZE,
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
}
