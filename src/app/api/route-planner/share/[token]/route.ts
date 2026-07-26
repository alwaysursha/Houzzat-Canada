import { NextResponse } from "next/server";
import { computeDriveRoute } from "@/lib/google/routes";
import { prisma } from "@/lib/prisma";
import { enrichTourStops, serializeTour } from "@/lib/route-planner/server";

type Params = { params: Promise<{ token: string }> };

/** Public read of a shared Route Planner (no auth). */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const tour = await prisma.viewingTour.findFirst({
    where: { shareToken: token },
    include: { stops: { orderBy: { sortOrder: "asc" } } },
  });
  if (!tour) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
  return NextResponse.json({ tour: serializeTour(tour, cards) });
}

/** Build encoded polylines for map (auth optional via token). */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const tour = await prisma.viewingTour.findFirst({
    where: { shareToken: token },
    include: { stops: { orderBy: { sortOrder: "asc" } } },
  });
  if (!tour) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (tour.startLat == null || tour.startLng == null) {
    return NextResponse.json({ polylines: [] as string[] });
  }

  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
  const points: Array<{ lat: number; lng: number }> = [
    { lat: tour.startLat, lng: tour.startLng },
  ];
  for (const stop of tour.stops) {
    const card = cards.get(stop.mlsNumber);
    if (card) points.push({ lat: card.lat, lng: card.lng });
  }

  const polylines: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    try {
      const route = await computeDriveRoute({
        originLat: from.lat,
        originLng: from.lng,
        destLat: to.lat,
        destLng: to.lng,
        includePolyline: true,
      });
      if (route.encodedPolyline) polylines.push(route.encodedPolyline);
    } catch {
      // Skip broken legs — markers still show.
    }
  }

  // unused request body reserved for future options
  void request;
  return NextResponse.json({ polylines });
}
