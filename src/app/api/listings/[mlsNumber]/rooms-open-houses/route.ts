import { NextResponse } from "next/server";
import { loadListingDetailApiAccess } from "@/lib/listings/listing-detail-api-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Rooms + open houses for listing detail — after paint (not SSR).
 *
 * G.10C2: Host entitlement → base provenance + OPEN_HOUSES → VOW.
 * VOW never substitutes for MLS board authority. Unauthorized → 404.
 */
export async function GET(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const gated = await loadListingDetailApiAccess(raw, request, {
    additionalCapabilities: ["OPEN_HOUSES"],
    entitlementFilteringEnabled: true,
  });
  if (!gated.ok) return gated.response;

  const { listing, access } = gated;

  // Inactive / off-market details stay locked for non-clients.
  if (access.detailsLocked) {
    return NextResponse.json(
      { rooms: [] as const, openHouses: [] as const, detailsLocked: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const row = await prisma.listing.findUnique({
    where: { id: listing.id },
    select: {
      rooms: { orderBy: { sortOrder: "asc" } },
      openHouses: { orderBy: { startsAt: "asc" } },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const now = Date.now();
  const openHouses = row.openHouses
    .filter((oh) => oh.endsAt.getTime() >= now)
    .map((oh) => ({
      id: oh.id,
      startsAt: oh.startsAt.toISOString(),
      endsAt: oh.endsAt.toISOString(),
      notes: oh.notes,
    }));

  return NextResponse.json(
    {
      rooms: row.rooms.map((room) => ({
        id: room.id,
        roomType: room.roomType,
        roomLevel: room.roomLevel,
        dimensions: room.dimensions,
        length: room.length,
        width: room.width,
        units: room.units,
        features: room.features,
        sortOrder: room.sortOrder,
      })),
      openHouses,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}
