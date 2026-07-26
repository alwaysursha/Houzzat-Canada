/** Google Routes API — Compute Routes (Essentials: drive distance + duration). */

function getApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }
  return key;
}

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

function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+)s$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]);
}

/**
 * Driving distance + typical duration between two coordinates.
 * Uses Essentials SKU (no TRAFFIC_AWARE) to stay in the free monthly allotment longer.
 */
export async function computeDriveRoute(input: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  includePolyline?: boolean;
}): Promise<DriveRouteResult> {
  const fieldMask = input.includePolyline
    ? "routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline"
    : "routes.duration,routes.staticDuration,routes.distanceMeters";

  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": fieldMask,
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
      body: rawText.slice(0, 1200),
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
