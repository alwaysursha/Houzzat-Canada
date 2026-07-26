import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import {
  enrichTourStops,
  getOrCreateActiveTour,
  serializeTour,
} from "@/lib/route-planner/server";

export async function GET() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const tour = await getOrCreateActiveTour(user.id);
  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
  return NextResponse.json({ tour: serializeTour(tour, cards) });
}

const patchSchema = z.object({
  startAddress: z.string().trim().max(240).nullable().optional(),
  startLat: z.number().min(-90).max(90).nullable().optional(),
  startLng: z.number().min(-180).max(180).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  defaultDwellMinutes: z.number().int().min(10).max(180).optional(),
  bufferMinutes: z.number().int().min(0).max(60).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  /** Guest merge: MLS numbers to ensure are on the tour (ACTIVE only). */
  mergeMlsNumbers: z.array(z.string().min(3).max(32)).max(10).optional(),
});

export async function PATCH(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tour update." }, { status: 400 });
  }

  const tour = await getOrCreateActiveTour(user.id);
  const data = parsed.data;

  if (data.mergeMlsNumbers?.length) {
    const listings = await prisma.listing.findMany({
      where: {
        mlsNumber: { in: data.mergeMlsNumbers },
        status: "ACTIVE",
      },
      select: { mlsNumber: true },
    });
    const existing = new Set(tour.stops.map((s) => s.mlsNumber));
    let order = tour.stops.length;
    for (const listing of listings) {
      if (existing.has(listing.mlsNumber) || order >= 10) continue;
      await prisma.viewingTourStop.create({
        data: {
          tourId: tour.id,
          mlsNumber: listing.mlsNumber,
          sortOrder: order,
        },
      });
      existing.add(listing.mlsNumber);
      order += 1;
    }
  }

  await prisma.viewingTour.update({
    where: { id: tour.id },
    data: {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.startAddress !== undefined
        ? { startAddress: data.startAddress }
        : {}),
      ...(data.startLat !== undefined ? { startLat: data.startLat } : {}),
      ...(data.startLng !== undefined ? { startLng: data.startLng } : {}),
      ...(data.startAt !== undefined
        ? { startAt: data.startAt ? new Date(data.startAt) : null }
        : {}),
      ...(data.defaultDwellMinutes != null
        ? { defaultDwellMinutes: data.defaultDwellMinutes }
        : {}),
      ...(data.bufferMinutes != null
        ? { bufferMinutes: data.bufferMinutes }
        : {}),
    },
  });

  // Persist location address on the client profile for admin / future tours.
  if (
    data.startAddress !== undefined ||
    data.startLat !== undefined ||
    data.startLng !== undefined
  ) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(data.startAddress !== undefined
            ? { homeAddress: data.startAddress }
            : {}),
          ...(data.startLat !== undefined ? { homeLat: data.startLat } : {}),
          ...(data.startLng !== undefined ? { homeLng: data.startLng } : {}),
        },
      });
    } catch (error) {
      console.error("[route-planner] home address profile update skipped", error);
    }
  }

  const refreshed = await getOrCreateActiveTour(user.id);
  const cards = await enrichTourStops(refreshed.stops.map((s) => s.mlsNumber));
  return NextResponse.json({ tour: serializeTour(refreshed, cards) });
}
