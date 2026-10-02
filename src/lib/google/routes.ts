/** Google Routes API — Compute Routes (Essentials: no live traffic). */

import { Prisma } from "@prisma/client";
import { isGoogleRoutesEnabled } from "@/lib/google/billing-guard";
import { prisma } from "@/lib/prisma";

/** Stay under the 10,000 free Essentials calls each Pacific month. */
export const GOOGLE_ROUTES_MONTHLY_CAP = 9000;

export type DriveRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  /** Encoded polyline when requested via `includePolyline`. */
  encodedPolyline?: string;
};

type ComputeRoutesResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    staticDuration?: string;
    polyline?: { encodedPolyline?: string };
  }>;
  error?: { message?: string; status?: string };
};

function getApiKey() {
  if (!isGoogleRoutesEnabled()) {
    throw new Error("Google Routes is disabled.");
  }
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }
  return key;
}

function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+)s$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]);
}

/** Google's free Routes month resets at midnight Pacific. */
export function googleRoutesMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function routeKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

async function reserveRouteCall(month: string): Promise<boolean> {
  const updated = await prisma.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`
      UPDATE "GoogleRouteUsage"
      SET "count" = "count" + 1
      WHERE "month" = ${month} AND "count" < ${GOOGLE_ROUTES_MONTHLY_CAP}
      RETURNING "count"
    `,
  );
  if (updated.length > 0) return true;

  try {
    await prisma.googleRouteUsage.create({ data: { month, count: 1 } });
    return true;
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  const raced = await prisma.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`
      UPDATE "GoogleRouteUsage"
      SET "count" = "count" + 1
      WHERE "month" = ${month} AND "count" < ${GOOGLE_ROUTES_MONTHLY_CAP}
      RETURNING "count"
    `,
  );
  return raced.length > 0;
}

async function releaseRouteCall(month: string) {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "GoogleRouteUsage"
      SET "count" = GREATEST("count" - 1, 0)
      WHERE "month" = ${month}
    `,
  );
}

async function fetchGoogleRoute(input: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}): Promise<DriveRouteResult> {
  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask":
          "routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: input.originLat,
              longitude: input.originLng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: input.destLat,
              longitude: input.destLng,
            },
          },
        },
        travelMode: "DRIVE",
        languageCode: "en-CA",
        units: "METRIC",
        regionCode: "CA",
      }),
    },
  );

  const rawText = await res.text();
  let data: ComputeRoutesResponse = {};
  try {
    data = JSON.parse(rawText) as ComputeRoutesResponse;
  } catch {
    data = {};
  }

  if (!res.ok) {
    const detail =
      data.error?.message ??
      (rawText.trim() ? rawText.slice(0, 500) : `HTTP ${res.status}`);
    console.error("[google/routes] computeRoutes failed", {
      status: res.status,
      detail,
    });
    throw new Error(detail);
  }

  const route = data.routes?.[0];
  const distanceMeters = route?.distanceMeters;
  const durationSeconds =
    parseDurationSeconds(route?.duration) ??
    parseDurationSeconds(route?.staticDuration);

  if (
    distanceMeters == null ||
    !Number.isFinite(distanceMeters) ||
    durationSeconds == null
  ) {
    throw new Error("No driving route found between these locations.");
  }

  return {
    distanceMeters,
    durationSeconds,
    encodedPolyline: route?.polyline?.encodedPolyline,
  };
}

/**
 * Driving distance + typical duration between two coordinates.
 * Cached pairs do not call Google. New calls stop before the monthly free cap.
 * Live traffic is not requested.
 */
export async function computeDriveRoute(input: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  includePolyline?: boolean;
}): Promise<DriveRouteResult> {
  if (!isGoogleRoutesEnabled()) {
    throw new Error("Google Routes is disabled.");
  }

  const originKey = routeKey(input.originLat, input.originLng);
  const destKey = routeKey(input.destLat, input.destLng);
  const cached = await prisma.driveRouteCache.findUnique({
    where: { originKey_destKey: { originKey, destKey } },
  });
  if (
    cached &&
    (!input.includePolyline || cached.encodedPolyline)
  ) {
    return {
      distanceMeters: cached.distanceMeters,
      durationSeconds: cached.durationSeconds,
      encodedPolyline: input.includePolyline
        ? (cached.encodedPolyline ?? undefined)
        : undefined,
    };
  }

  const month = googleRoutesMonth();
  const reserved = await reserveRouteCall(month);
  if (!reserved) {
    throw new Error("Monthly Google Routes free cap reached.");
  }

  try {
    const route = await fetchGoogleRoute(input);
    await prisma.driveRouteCache.upsert({
      where: { originKey_destKey: { originKey, destKey } },
      create: {
        originKey,
        destKey,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        encodedPolyline: route.encodedPolyline ?? null,
      },
      update: {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        encodedPolyline: route.encodedPolyline ?? null,
      },
    });
    return {
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      encodedPolyline: input.includePolyline ? route.encodedPolyline : undefined,
    };
  } catch (error) {
    await releaseRouteCall(month);
    throw error;
  }
}
