/**
 * Mode-specific listing lookup for mobile property search.
 * MLS modes never use the broad address/city/typo candidate query.
 */

import type { Prisma, PropertyType } from "@prisma/client";
import { ON_MARKET_LISTING_STATUSES } from "@/lib/listings/constants";
import { prisma } from "@/lib/prisma";
import { toCard } from "@/lib/listings/provider";
import type { ListingCard } from "@/lib/listings/types";

const MLS_COMPLETE = /^[A-Z]{1,3}\d{7,8}$/;
const MLS_PREFIX = /^[A-Z]{1,3}\d{1,10}$/;

const LISTING_CARD_INCLUDE = {
  media: true,
  openHouses: true,
} as const;

export function normalizeExactMlsTokens(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((token) => token.trim().replace(/^#/, "").toUpperCase())
        .filter((token) => MLS_COMPLETE.test(token)),
    ),
  ].slice(0, 25);
}

export function normalizeMlsPrefix(raw: string): string | null {
  const token = raw.trim().replace(/^#/, "").toUpperCase().split(/[\s,;]+/)[0] ?? "";
  if (token.length < 3 || !MLS_PREFIX.test(token)) return null;
  return token;
}

export function preciseAddressWhere(q: string): Prisma.ListingWhereInput | null {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (q.trim().length < 3 || tokens.length === 0) return null;
  const number = tokens.find((token) => /^\d+[a-z]?$/i.test(token));
  const words = tokens.filter(
    (token) => /[a-z]/i.test(token) && !/^\d+[a-z]?$/i.test(token) && token.length >= 2,
  );
  if (number && words.length > 0) {
    return {
      AND: [
        {
          OR: [
            { addressLine: { startsWith: `${number} `, mode: "insensitive" } },
            { addressLine: { contains: ` ${number} `, mode: "insensitive" } },
          ],
        },
        ...words.map((word) => ({
          addressLine: { contains: word, mode: "insensitive" as const },
        })),
      ],
    };
  }
  const wordsOnly = tokens.filter((token) => token.length >= 3);
  if (wordsOnly.length === 0) return null;
  return {
    AND: wordsOnly.map((token) => ({
      OR: [
        { addressLine: { contains: token, mode: "insensitive" as const } },
        { city: { contains: token, mode: "insensitive" as const } },
        { community: { contains: token, mode: "insensitive" as const } },
      ],
    })),
  };
}

export async function findListingsByMlsPrefix(prefix: string): Promise<ListingCard[]> {
  const rows = await prisma.listing.findMany({
    where: { mlsNumber: { startsWith: prefix, mode: "insensitive" } },
    include: LISTING_CARD_INCLUDE,
    orderBy: { mlsNumber: "asc" },
    take: 25,
  });
  return rows.map((row) => toCard(row));
}

/**
 * PropTx stores districts as "Toronto C01". Match the city name or that
 * name plus a board district code. Exact equals on "Toronto" matches nothing.
 */
export function serviceAreaCityWhere(cities: string[]): Prisma.ListingWhereInput {
  return {
    OR: cities.flatMap((city) => [
      { city: { equals: city, mode: "insensitive" as const } },
      { city: { startsWith: `${city} `, mode: "insensitive" as const } },
    ]),
  };
}

export function listingCityInServiceAreas(listingCity: string, cities: readonly string[]): boolean {
  const city = listingCity.trim().toLowerCase();
  return cities.some((area) => {
    const name = area.trim().toLowerCase();
    return city === name || city.startsWith(`${name} `);
  });
}

export async function findFeedListings(input: {
  cities: string[];
  transactionType?: "SALE" | "LEASE" | null;
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  propertyTypes?: PropertyType[];
}): Promise<ListingCard[]> {
  if (input.cities.length === 0) return [];
  const and: Prisma.ListingWhereInput[] = [
    serviceAreaCityWhere(input.cities),
    { status: { in: [...ON_MARKET_LISTING_STATUSES] } },
    { segment: { in: ["RESIDENTIAL", "COMMERCIAL"] } },
  ];
  if (input.transactionType === "SALE" || input.transactionType === "LEASE") {
    and.push({ transactionType: input.transactionType });
  }
  if (input.minPrice != null && Number.isFinite(input.minPrice)) {
    and.push({ listPrice: { gte: input.minPrice } });
  }
  if (input.maxPrice != null && Number.isFinite(input.maxPrice)) {
    and.push({ listPrice: { lte: input.maxPrice } });
  }
  if (input.minBeds != null && Number.isFinite(input.minBeds)) {
    and.push({ beds: { gte: input.minBeds } });
  }
  if (input.minBaths != null && Number.isFinite(input.minBaths)) {
    and.push({ baths: { gte: input.minBaths } });
  }
  if (input.propertyTypes?.length) {
    and.push({ propertyType: { in: input.propertyTypes } });
  }
  const rows = await prisma.listing.findMany({
    where: { AND: and },
    include: LISTING_CARD_INCLUDE,
    orderBy: { listedAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 60, 1), 60),
  });
  return rows.map((row) => toCard(row));
}

export async function findListingsByPreciseAddress(
  q: string,
  transactionType?: "SALE" | "LEASE" | null,
): Promise<ListingCard[]> {
  const address = preciseAddressWhere(q);
  if (!address) return [];
  const and: Prisma.ListingWhereInput[] = [
    address,
    { status: { in: [...ON_MARKET_LISTING_STATUSES] } },
  ];
  if (transactionType === "SALE" || transactionType === "LEASE") {
    and.push({ transactionType });
  }
  const rows = await prisma.listing.findMany({
    where: { AND: and },
    include: LISTING_CARD_INCLUDE,
    orderBy: { listedAt: "desc" },
    take: 25,
  });
  return rows.map((row) => toCard(row));
}
