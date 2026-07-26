import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { computeDriveRoute } from "@/lib/google/routes";
import {
  enrichTourStops,
  getOrCreateActiveTour,
} from "@/lib/route-planner/server";

const schema = z.object({
  includePolyline: z.boolean().optional(),
});

/** Polylines for the authenticated active tour (map). */
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
  if (tour.startLat == null || tour.startLng == null || tour.stops.length === 0) {
    return NextResponse.json({ polylines: [] as string[], points: [] });
  }

  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
  const points: Array<{ lat: number; lng: number; label: string }> = [
    {
      lat: tour.startLat,
      lng: tour.startLng,
      label: tour.startAddress ?? "Start",
    },
  ];
  for (const stop of tour.stops) {
    const card = cards.get(stop.mlsNumber);
    if (!card) continue;
    points.push({
      lat: card.lat,
      lng: card.lng,
      label: card.addressLine,
    });
  }

  const polylines: string[] = [];
  if (parsed.data.includePolyline !== false) {
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
        // markers still render
      }
    }
  }

  return NextResponse.json({ polylines, points });
}
