import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFullCustomerUser } from "@/lib/account";
import { appendGuestStopsInOrder } from "@/lib/route-planner/merge-guest-stops";
import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import {
  enrichTourStops,
  getOrCreateActiveTour,
  serializeTour,
} from "@/lib/route-planner/server";

export async function GET() {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

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
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

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
    await appendGuestStopsInOrder(
      {
        listActiveMls: async (mlsNumbers) => {
          const listings = await prisma.listing.findMany({
            where: {
              AND: [
                { mlsNumber: { in: mlsNumbers }, status: "ACTIVE" },
                excludeStagingSnapshotWhere(),
              ],
            },
            select: { mlsNumber: true },
          });
          return listings.map((listing) => listing.mlsNumber);
        },
        listStops: async (tourId) =>
          prisma.viewingTourStop.findMany({
            where: { tourId },
            select: { mlsNumber: true, sortOrder: true },
          }),
        createStop: async (stop) => {
          await prisma.viewingTourStop.create({ data: stop });
        },
      },
      { tourId: tour.id, mergeMlsNumbers: data.mergeMlsNumbers },
    );
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
