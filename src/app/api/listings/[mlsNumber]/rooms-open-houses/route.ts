import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Rooms + open houses for listing detail — after paint (not SSR).
 */
export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!mlsNumber) {
    return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber },
    select: {
      id: true,
      rooms: { orderBy: { sortOrder: "asc" } },
      openHouses: { orderBy: { startsAt: "asc" } },
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const now = Date.now();
  const openHouses = listing.openHouses
    .filter((oh) => oh.endsAt.getTime() >= now)
    .map((oh) => ({
      id: oh.id,
      startsAt: oh.startsAt.toISOString(),
      endsAt: oh.endsAt.toISOString(),
      notes: oh.notes,
    }));

  return NextResponse.json(
    {
      rooms: listing.rooms.map((room) => ({
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
