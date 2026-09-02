/**
 * Stage 5.6 — HouzzatPRO Viewings Planner server logic.
 *
 * Reuses consumer route-planner optimization (Google Routes + optimize.ts).
 * Neon-safe: flat sequential writes only (no interactive transactions).
 */
import { randomBytes } from "crypto";
import { computeDriveRoute } from "@/lib/google/routes";
import { prisma } from "@/lib/prisma";
import {
  buildDurationLookup,
  buildTimeline,
  optimizeStopOrder,
  ROUTE_PLANNER_DEFAULT_BUFFER_MINUTES,
  ROUTE_PLANNER_DEFAULT_DWELL_MINUTES,
  ROUTE_PLANNER_MAX_STOPS,
  timelineForFixedOrder,
  type TourStopPoint,
} from "@/lib/route-planner/optimize";
import {
  enrichTourStops,
  serializeTour,
  type EnrichedStopListing,
} from "@/lib/route-planner/server";
import { resolvePublicViewingShareBrand } from "@/lib/tenancy/resolve-public-viewing-share-brand";

const TOUR_INCLUDE = {
  stops: { orderBy: { sortOrder: "asc" as const } },
} as const;

export type ProViewingsTour = Awaited<
  ReturnType<typeof loadProViewingsTourById>
>;

export async function getOrCreateProDraftTour(input: {
  leadId: string;
  workspaceId: string;
  agentId: string;
  customerId: string | null;
  mlsNumbers?: string[];
}) {
  const existing = await prisma.viewingTour.findFirst({
    where: {
      leadId: input.leadId,
      workspaceId: input.workspaceId,
      isActive: true,
      status: "DRAFT",
    },
    orderBy: { updatedAt: "desc" },
    include: TOUR_INCLUDE,
  });

  if (existing) {
    if (input.mlsNumbers?.length) {
      await mergeStopsOntoTour(existing.id, input.mlsNumbers);
    }
    return loadProViewingsTourById(existing.id);
  }

  // Flat create only — no `include` (PrismaNeonHttp can wrap include writes in txns).
  await prisma.viewingTour.create({
    data: {
      name: "Viewings Planner",
      status: "DRAFT",
      isActive: true,
      leadId: input.leadId,
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      userId: input.customerId,
      defaultDwellMinutes: ROUTE_PLANNER_DEFAULT_DWELL_MINUTES,
      bufferMinutes: ROUTE_PLANNER_DEFAULT_BUFFER_MINUTES,
    },
  });

  const tour = await prisma.viewingTour.findFirstOrThrow({
    where: {
      leadId: input.leadId,
      workspaceId: input.workspaceId,
      isActive: true,
      status: "DRAFT",
    },
    orderBy: { updatedAt: "desc" },
    include: TOUR_INCLUDE,
  });

  if (input.mlsNumbers?.length) {
    await mergeStopsOntoTour(tour.id, input.mlsNumbers);
  }

  return loadProViewingsTourById(tour.id);
}

async function mergeStopsOntoTour(tourId: string, mlsNumbers: string[]) {
  const unique = [...new Set(mlsNumbers.map((m) => m.trim()).filter(Boolean))].slice(
    0,
    ROUTE_PLANNER_MAX_STOPS,
  );
  if (unique.length === 0) return;

  const existing = await prisma.viewingTourStop.findMany({
    where: { tourId },
    orderBy: { sortOrder: "asc" },
  });
  const have = new Set(existing.map((s) => s.mlsNumber));
  let nextOrder = existing.length;

  for (const mls of unique) {
    if (have.has(mls)) continue;
    await prisma.viewingTourStop.create({
      data: { tourId, mlsNumber: mls, sortOrder: nextOrder },
    });
    nextOrder += 1;
  }
}

export async function loadProViewingsTourById(tourId: string) {
  return prisma.viewingTour.findUniqueOrThrow({
    where: { id: tourId },
    include: TOUR_INCLUDE,
  });
}

export async function assertProTourAccess(input: {
  tourId: string;
  leadId: string;
  workspaceId: string;
}) {
  const tour = await prisma.viewingTour.findFirst({
    where: {
      id: input.tourId,
      leadId: input.leadId,
      workspaceId: input.workspaceId,
    },
    include: TOUR_INCLUDE,
  });
  if (!tour) {
    throw new Error("VIEWINGS_TOUR_NOT_FOUND");
  }
  return tour;
}

export async function updateProTourFields(
  tourId: string,
  data: {
    startAddress?: string | null;
    startLat?: number | null;
    startLng?: number | null;
    startAt?: Date | null;
    viewingDate?: Date | null;
    defaultDwellMinutes?: number;
    bufferMinutes?: number;
  },
) {
  await prisma.viewingTour.update({
    where: { id: tourId },
    data,
  });
}

export async function reorderProTourStops(
  tourId: string,
  stopIdsInOrder: string[],
) {
  const stops = await prisma.viewingTourStop.findMany({
    where: { tourId },
  });
  const idSet = new Set(stops.map((s) => s.id));
  if (stopIdsInOrder.length !== stops.length) {
    throw new Error("INVALID_STOP_ORDER");
  }
  for (const id of stopIdsInOrder) {
    if (!idSet.has(id)) throw new Error("INVALID_STOP_ORDER");
  }
  for (let i = 0; i < stopIdsInOrder.length; i++) {
    await prisma.viewingTourStop.update({
      where: { id: stopIdsInOrder[i]! },
      data: { sortOrder: i },
    });
  }
}

export async function updateProStopTimes(
  tourId: string,
  updates: Array<{
    stopId: string;
    startsAt: string | null;
    endsAt: string | null;
  }>,
) {
  for (const row of updates) {
    const stop = await prisma.viewingTourStop.findFirst({
      where: { id: row.stopId, tourId },
    });
    if (!stop) continue;
    await prisma.viewingTourStop.update({
      where: { id: stop.id },
      data: {
        suggestedArriveAt: row.startsAt ? new Date(row.startsAt) : null,
        suggestedLeaveAt: row.endsAt ? new Date(row.endsAt) : null,
      },
    });
  }
}

export async function optimizeProTour(input: {
  tourId: string;
  reorder: boolean;
}) {
  const tour = await loadProViewingsTourById(input.tourId);
  if (tour.stops.length === 0) {
    throw new Error("NO_STOPS");
  }

  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
  const stopPoints: TourStopPoint[] = [];
  for (const stop of tour.stops) {
    const card = cards.get(stop.mlsNumber);
    if (!card) {
      throw new Error(`MISSING_COORDS:${stop.mlsNumber}`);
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

  const startAt = resolveTourStartAt(tour);
  const start =
    tour.startLat != null && tour.startLng != null
      ? { lat: tour.startLat, lng: tour.startLng }
      : null;

  if (!start) {
    throw new Error("START_LOCATION_REQUIRED");
  }

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

  const ordered = input.reorder
    ? optimizeStopOrder({ start, stops: stopPoints, durationCache })
    : stopPoints;

  const timeline =
    startAt != null
      ? buildTimeline({
          startAt,
          start,
          stops: ordered,
          durationCache,
          defaultDwellMinutes: tour.defaultDwellMinutes,
          bufferMinutes: tour.bufferMinutes,
        })
      : timelineForFixedOrder({
          startAt: null,
          start,
          stops: ordered,
          durationCache,
          defaultDwellMinutes: tour.defaultDwellMinutes,
          bufferMinutes: tour.bufferMinutes,
        });

  for (const row of timeline) {
    await prisma.viewingTourStop.update({
      where: { id: row.id },
      data: {
        sortOrder: row.sortOrder,
        dwellMinutes: row.dwellMinutes,
        driveFromPrevSeconds: row.driveFromPrevSeconds,
        driveFromPrevMeters: row.driveFromPrevMeters,
        suggestedArriveAt: row.suggestedArriveAt,
        suggestedLeaveAt: row.suggestedLeaveAt,
      },
    });
  }

  if (startAt && !tour.startAt) {
    await prisma.viewingTour.update({
      where: { id: tour.id },
      data: { startAt },
    });
  }

  return loadProViewingsTourById(tour.id);
}

function resolveTourStartAt(tour: {
  startAt: Date | null;
  viewingDate: Date | null;
}): Date | null {
  if (tour.startAt) return tour.startAt;
  if (!tour.viewingDate) return null;
  const d = new Date(tour.viewingDate);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function computeRouteSummary(
  stops: Array<{
    driveFromPrevMeters: number | null;
    driveFromPrevSeconds: number | null;
  }>,
) {
  let totalMeters = 0;
  let totalDriveSeconds = 0;
  for (const stop of stops) {
    if (stop.driveFromPrevMeters != null) totalMeters += stop.driveFromPrevMeters;
    if (stop.driveFromPrevSeconds != null) {
      totalDriveSeconds += stop.driveFromPrevSeconds;
    }
  }
  return {
    stopCount: stops.length,
    totalMeters,
    totalDriveSeconds,
  };
}

export function serializeProViewingsPlannerPayload(
  tour: ProViewingsTour,
  cards: Map<string, EnrichedStopListing>,
  brand?: Awaited<ReturnType<typeof resolvePublicViewingShareBrand>>,
  agent?: { name: string | null; email: string | null; phone: string | null },
) {
  const base = serializeTour(tour, cards);
  const summary = computeRouteSummary(tour.stops);
  return {
    ...base,
    leadId: tour.leadId,
    agentId: tour.agentId,
    workspaceId: tour.workspaceId,
    viewingDate: tour.viewingDate?.toISOString() ?? null,
    summary,
    stops: base.stops.map((stop, index) => ({
      ...stop,
      appointmentId: tour.stops[index]?.appointmentId ?? null,
    })),
    brand: brand ?? null,
    agent: agent ?? null,
    sharePath: tour.shareToken ? `/viewings/share/${tour.shareToken}` : null,
  };
}

export async function buildProTourResponse(tourId: string) {
  const tour = await loadProViewingsTourById(tourId);
  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
  let brand = null;
  let agent = null;
  if (tour.workspaceId) {
    brand = await resolvePublicViewingShareBrand(tour.workspaceId);
  }
  if (tour.agentId) {
    const user = await prisma.user.findUnique({
      where: { id: tour.agentId },
      select: { name: true, email: true, phone: true },
    });
    agent = user;
  }
  return serializeProViewingsPlannerPayload(tour, cards, brand ?? undefined, agent ?? undefined);
}

export async function saveProViewingsPlan(input: {
  tourId: string;
  leadId: string;
  workspaceId: string;
  agentId: string;
  customerId: string | null;
  isUpdate: boolean;
}) {
  const tour = await assertProTourAccess({
    tourId: input.tourId,
    leadId: input.leadId,
    workspaceId: input.workspaceId,
  });

  const shareToken = tour.shareToken ?? randomBytes(12).toString("hex");
  await prisma.viewingTour.update({
    where: { id: tour.id },
    data: { shareToken },
  });

  const priorLinked = await prisma.viewingTourStop.findMany({
    where: { tourId: tour.id, appointmentId: { not: null } },
    select: { appointmentId: true },
  });

  const refreshed = await loadProViewingsTourById(tour.id);

  for (const stop of refreshed.stops) {
    const startsAt = stop.suggestedArriveAt;
    const endsAt = stop.suggestedLeaveAt;

    if (stop.appointmentId) {
      await prisma.appointment.update({
        where: { id: stop.appointmentId },
        data: {
          startsAt,
          endsAt,
          listingMls: stop.mlsNumber,
          status: "REQUESTED",
        },
      });
      continue;
    }

    const appointment = await prisma.appointment.create({
      data: {
        type: "SHOWING",
        status: "REQUESTED",
        leadId: input.leadId,
        agentId: input.agentId,
        customerId: input.customerId,
        listingMls: stop.mlsNumber,
        startsAt,
        endsAt,
      },
    });

    await prisma.viewingTourStop.update({
      where: { id: stop.id },
      data: { appointmentId: appointment.id },
    });
  }

  const keptAppointmentIds = new Set(
    refreshed.stops
      .map((s) => s.appointmentId)
      .filter((id): id is string => Boolean(id)),
  );

  for (const prior of priorLinked) {
    if (prior.appointmentId && !keptAppointmentIds.has(prior.appointmentId)) {
      await prisma.appointment.update({
        where: { id: prior.appointmentId },
        data: { status: "CANCELLED" },
      });
    }
  }

  const stopCount = refreshed.stops.length;
  const dateLabel = refreshed.viewingDate
    ? refreshed.viewingDate.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      })
    : "unscheduled";

  await prisma.leadActivity.create({
    data: {
      leadId: input.leadId,
      userId: input.agentId,
      type: input.isUpdate ? "viewing_plan_updated" : "viewing_plan_created",
      body: input.isUpdate
        ? `Viewing plan updated · ${stopCount} properties · ${dateLabel}`
        : `Viewing plan created · ${stopCount} properties · ${dateLabel}`,
    },
  });

  for (const stop of refreshed.stops) {
    if (!stop.suggestedArriveAt) continue;
    const cards = await enrichTourStops([stop.mlsNumber]);
    const card = cards.get(stop.mlsNumber);
    const addr = card?.addressLine ?? stop.mlsNumber;
    const time = stop.suggestedArriveAt.toLocaleTimeString("en-CA", {
      hour: "numeric",
      minute: "2-digit",
    });
    await prisma.leadActivity.create({
      data: {
        leadId: input.leadId,
        userId: input.agentId,
        type: "viewing_appointment_scheduled",
        body: `${addr} · ${time}`,
      },
    });
  }

  return buildProTourResponse(tour.id);
}

export function buildViewingShareMessage(input: {
  tenantDisplayName: string;
  agentFirstName: string;
  clientFirstName: string;
  viewingDateLabel: string;
  stopCount: number;
  shareUrl: string;
}) {
  return [
    `Hi ${input.clientFirstName},`,
    "",
    `I've prepared your viewing schedule for ${input.viewingDateLabel} with ${input.stopCount} ${input.stopCount === 1 ? "property" : "properties"}.`,
    "",
    "View your schedule:",
    input.shareUrl,
    "",
    input.agentFirstName,
    input.tenantDisplayName,
  ].join("\n");
}

export async function logViewingShareActivity(input: {
  leadId: string;
  agentId: string;
  channel: "email" | "whatsapp" | "sms" | "copy_link" | "native_share";
}) {
  const bodyByChannel: Record<typeof input.channel, string> = {
    email: "Viewing plan opened for sharing by email",
    whatsapp: "Viewing plan opened for sharing via WhatsApp",
    sms: "Viewing plan opened for sharing via message",
    copy_link: "Viewing plan link copied",
    native_share: "Viewing plan opened for native share",
  };
  await prisma.leadActivity.create({
    data: {
      leadId: input.leadId,
      userId: input.agentId,
      type: "viewing_plan_shared",
      body: bodyByChannel[input.channel],
    },
  });
}
