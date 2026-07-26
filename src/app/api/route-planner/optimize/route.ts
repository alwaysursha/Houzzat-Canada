import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { computeDriveRoute } from "@/lib/google/routes";
import { prisma } from "@/lib/prisma";
import {
  buildDurationLookup,
  buildTimeline,
  optimizeStopOrder,
  type TourStopPoint,
} from "@/lib/route-planner/optimize";
import {
  enrichTourStops,
  getOrCreateActiveTour,
  serializeTour,
} from "@/lib/route-planner/server";

const schema = z.object({
  /** When true, reorder with nearest-neighbor + 2-opt. When false, keep order. */
  reorder: z.boolean().default(true),
});

export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const tour = await getOrCreateActiveTour(user.id);
  if (tour.stops.length === 0) {
    return NextResponse.json(
      { error: "Add at least one home before building a route." },
      { status: 400 },
    );
  }

  if (
    tour.startLat == null ||
    tour.startLng == null ||
    tour.startAt == null
  ) {
    return NextResponse.json(
      {
        error:
          "Set your location address and first viewing time before building the route.",
      },
      { status: 400 },
    );
  }

  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
  const stopPoints: TourStopPoint[] = [];
  for (const stop of tour.stops) {
    const card = cards.get(stop.mlsNumber);
    if (!card) {
      return NextResponse.json(
        {
          error: `Listing ${stop.mlsNumber} is missing map coordinates and can’t be routed.`,
        },
        { status: 400 },
      );
    }
    stopPoints.push({
      id: stop.id,
      mlsNumber: stop.mlsNumber,
      lat: card.lat,
      lng: card.lng,
      locked: stop.locked,
      dwellMinutes: stop.dwellMinutes,
    });
  }

  const start = { lat: tour.startLat, lng: tour.startLng };
  const points = [start, ...stopPoints.map((s) => ({ lat: s.lat, lng: s.lng }))];

  const durationCache = await buildDurationLookup(points, async (from, to) => {
    const route = await computeDriveRoute({
      originLat: from.lat,
      originLng: from.lng,
      destLat: to.lat,
      destLng: to.lng,
    });
    return {
      durationSeconds: route.durationSeconds,
      distanceMeters: route.distanceMeters,
    };
  });

  const ordered = parsed.data.reorder
    ? optimizeStopOrder({
        start,
        stops: stopPoints,
        durationCache,
      })
    : stopPoints;

  const timeline = buildTimeline({
    startAt: tour.startAt,
    start,
    stops: ordered,
    durationCache,
    defaultDwellMinutes: tour.defaultDwellMinutes,
    bufferMinutes: tour.bufferMinutes,
  });

  await prisma.$transaction(
    timeline.map((row) =>
      prisma.viewingTourStop.update({
        where: { id: row.id },
        data: {
          sortOrder: row.sortOrder,
          dwellMinutes: row.dwellMinutes,
          driveFromPrevSeconds: row.driveFromPrevSeconds,
          driveFromPrevMeters: row.driveFromPrevMeters,
          suggestedArriveAt: row.suggestedArriveAt,
          suggestedLeaveAt: row.suggestedLeaveAt,
        },
      }),
    ),
  );

  const refreshed = await getOrCreateActiveTour(user.id);
  const refreshedCards = await enrichTourStops(
    refreshed.stops.map((s) => s.mlsNumber),
  );
  return NextResponse.json({
    tour: serializeTour(refreshed, refreshedCards),
  });
}
