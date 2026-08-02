import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFullCustomerUser } from "@/lib/account";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { prisma } from "@/lib/prisma";
import {
  ROUTE_PLANNER_MAX_STOPS,
} from "@/lib/route-planner/optimize";
import {
  enrichTourStops,
  getOrCreateActiveTour,
  serializeTour,
} from "@/lib/route-planner/server";

const postSchema = z.object({
  mlsNumber: z.string().min(3).max(32),
});

export async function POST(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber: parsed.data.mlsNumber },
    select: { mlsNumber: true, status: true, lat: true, lng: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }
  if (listing.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Only active listings can be added to your Route Planner." },
      { status: 400 },
    );
  }

  const tour = await getOrCreateActiveTour(user.id);
  if (tour.stops.some((s) => s.mlsNumber === listing.mlsNumber)) {
    const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
    return NextResponse.json({ tour: serializeTour(tour, cards), added: false });
  }
  if (tour.stops.length >= ROUTE_PLANNER_MAX_STOPS) {
    return NextResponse.json(
      {
        error: `Routes work best under ${ROUTE_PLANNER_MAX_STOPS} homes.`,
      },
      { status: 400 },
    );
  }

  await prisma.viewingTourStop.create({
    data: {
      tourId: tour.id,
      mlsNumber: listing.mlsNumber,
      sortOrder: tour.stops.length,
    },
  });

  void recordActivityEvent({
    type: "ROUTE_PLANNER",
    userId: user.id,
    mlsNumber: listing.mlsNumber,
    path: "/route-planner",
    title: `Added ${listing.mlsNumber} to route`,
    meta: { tourId: tour.id },
  });

  const refreshed = await getOrCreateActiveTour(user.id);
  const cards = await enrichTourStops(refreshed.stops.map((s) => s.mlsNumber));
  return NextResponse.json({
    tour: serializeTour(refreshed, cards),
    added: true,
  });
}

const deleteSchema = z.object({
  mlsNumber: z.string().min(3).max(32),
});

export async function DELETE(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const tour = await getOrCreateActiveTour(user.id);
  await prisma.viewingTourStop.deleteMany({
    where: { tourId: tour.id, mlsNumber: parsed.data.mlsNumber },
  });

  const remaining = await prisma.viewingTourStop.findMany({
    where: { tourId: tour.id },
    orderBy: { sortOrder: "asc" },
  });
  await Promise.all(
    remaining.map((stop, index) =>
      prisma.viewingTourStop.update({
        where: { id: stop.id },
        data: {
          sortOrder: index,
          driveFromPrevSeconds: null,
          driveFromPrevMeters: null,
          suggestedArriveAt: null,
          suggestedLeaveAt: null,
        },
      }),
    ),
  );

  const refreshed = await getOrCreateActiveTour(user.id);
  const cards = await enrichTourStops(refreshed.stops.map((s) => s.mlsNumber));
  return NextResponse.json({ tour: serializeTour(refreshed, cards) });
}

const reorderSchema = z.object({
  orderedMlsNumbers: z.array(z.string().min(3).max(32)).min(1).max(10),
});

/** Reorder stops without optimizing drive times. */
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

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  }

  const tour = await getOrCreateActiveTour(user.id);
  const byMls = new Map(tour.stops.map((s) => [s.mlsNumber, s]));
  for (const mls of parsed.data.orderedMlsNumbers) {
    if (!byMls.has(mls)) {
      return NextResponse.json(
        { error: "Order includes an unknown stop." },
        { status: 400 },
      );
    }
  }

  await Promise.all(
    parsed.data.orderedMlsNumbers.map((mls, index) =>
      prisma.viewingTourStop.update({
        where: { id: byMls.get(mls)!.id },
        data: {
          sortOrder: index,
          driveFromPrevSeconds: null,
          driveFromPrevMeters: null,
          suggestedArriveAt: null,
          suggestedLeaveAt: null,
        },
      }),
    ),
  );

  const refreshed = await getOrCreateActiveTour(user.id);
  const cards = await enrichTourStops(refreshed.stops.map((s) => s.mlsNumber));
  return NextResponse.json({ tour: serializeTour(refreshed, cards) });
}
