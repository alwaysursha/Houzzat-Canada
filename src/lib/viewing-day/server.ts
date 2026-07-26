import { prisma } from "@/lib/prisma";
import { toCard } from "@/lib/listings/provider";
import type { ListingCard } from "@/lib/listings/types";
import {
  VIEWING_DAY_DEFAULT_BUFFER_MINUTES,
  VIEWING_DAY_DEFAULT_DWELL_MINUTES,
} from "@/lib/viewing-day/optimize";

export type EnrichedStopListing = ListingCard & {
  lat: number;
  lng: number;
};

export async function getOrCreateActiveTour(userId: string) {
  const existing = await prisma.viewingTour.findFirst({
    where: { userId, isActive: true, status: { in: ["DRAFT", "REQUESTED"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      stops: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (existing) return existing;

  return prisma.viewingTour.create({
    data: {
      userId,
      name: "Viewing day",
      isActive: true,
      status: "DRAFT",
      defaultDwellMinutes: VIEWING_DAY_DEFAULT_DWELL_MINUTES,
      bufferMinutes: VIEWING_DAY_DEFAULT_BUFFER_MINUTES,
    },
    include: {
      stops: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function enrichTourStops(
  mlsNumbers: string[],
): Promise<Map<string, EnrichedStopListing>> {
  if (mlsNumbers.length === 0) return new Map();
  const rows = await prisma.listing.findMany({
    where: { mlsNumber: { in: mlsNumbers } },
    include: { media: true, openHouses: true },
  });
  const map = new Map<string, EnrichedStopListing>();
  for (const row of rows) {
    map.set(row.mlsNumber, {
      ...toCard(row),
      lat: row.lat,
      lng: row.lng,
    });
  }
  return map;
}

export function serializeTour(
  tour: Awaited<ReturnType<typeof getOrCreateActiveTour>>,
  cards: Map<string, EnrichedStopListing>,
) {
  return {
    id: tour.id,
    name: tour.name,
    status: tour.status,
    startAddress: tour.startAddress,
    startLat: tour.startLat,
    startLng: tour.startLng,
    startAt: tour.startAt?.toISOString() ?? null,
    defaultDwellMinutes: tour.defaultDwellMinutes,
    bufferMinutes: tour.bufferMinutes,
    shareToken: tour.shareToken,
    requestedAt: tour.requestedAt?.toISOString() ?? null,
    stopCount: tour.stops.length,
    stops: tour.stops.map((stop) => {
      const card = cards.get(stop.mlsNumber);
      return {
        id: stop.id,
        mlsNumber: stop.mlsNumber,
        sortOrder: stop.sortOrder,
        locked: stop.locked,
        dwellMinutes: stop.dwellMinutes,
        driveFromPrevSeconds: stop.driveFromPrevSeconds,
        driveFromPrevMeters: stop.driveFromPrevMeters,
        suggestedArriveAt: stop.suggestedArriveAt?.toISOString() ?? null,
        suggestedLeaveAt: stop.suggestedLeaveAt?.toISOString() ?? null,
        listing: card
          ? {
              mlsNumber: card.mlsNumber,
              addressLine: card.addressLine,
              unitNumber: card.unitNumber,
              city: card.city,
              listPrice: card.listPrice,
              status: card.status,
              primaryImageUrl: card.primaryImageUrl,
              beds: card.beds,
              baths: card.baths,
              lat: card.lat,
              lng: card.lng,
            }
          : null,
      };
    }),
  };
}
