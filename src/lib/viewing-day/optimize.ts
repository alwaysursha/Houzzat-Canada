/** Viewing-day route planner — order stops and build suggested timelines. */

export const VIEWING_DAY_MAX_STOPS = 10;
export const VIEWING_DAY_DEFAULT_DWELL_MINUTES = 30;
export const VIEWING_DAY_DEFAULT_BUFFER_MINUTES = 5;

export type LatLng = { lat: number; lng: number };

export type TourStopPoint = {
  id: string;
  mlsNumber: string;
  lat: number;
  lng: number;
  locked?: boolean;
  dwellMinutes?: number | null;
};

export type DurationLeg = {
  durationSeconds: number;
  distanceMeters: number;
};

export type TimelineStop = {
  id: string;
  mlsNumber: string;
  sortOrder: number;
  dwellMinutes: number;
  driveFromPrevSeconds: number | null;
  driveFromPrevMeters: number | null;
  suggestedArriveAt: Date | null;
  suggestedLeaveAt: Date | null;
};

function keyOf(a: LatLng, b: LatLng) {
  return `${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
}

/** Haversine meters — used only as a cheap seed when a route call fails. */
export function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough drive seconds from distance when Routes API is unavailable. */
export function estimateDriveSeconds(meters: number) {
  // ~40 km/h urban average
  return Math.max(60, Math.round((meters / 40000) * 3600));
}

export async function buildDurationLookup(
  points: LatLng[],
  fetchLeg: (from: LatLng, to: LatLng) => Promise<DurationLeg>,
): Promise<Map<string, DurationLeg>> {
  const cache = new Map<string, DurationLeg>();
  const jobs: Array<Promise<void>> = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const from = points[i]!;
      const to = points[j]!;
      const k = keyOf(from, to);
      if (cache.has(k)) continue;
      jobs.push(
        (async () => {
          try {
            const leg = await fetchLeg(from, to);
            cache.set(k, leg);
          } catch {
            const meters = haversineMeters(from, to) * 1.35;
            cache.set(k, {
              distanceMeters: Math.round(meters),
              durationSeconds: estimateDriveSeconds(meters),
            });
          }
        })(),
      );
    }
  }

  // Bound concurrency lightly by awaiting in chunks
  const chunk = 6;
  for (let i = 0; i < jobs.length; i += chunk) {
    await Promise.all(jobs.slice(i, i + chunk));
  }
  return cache;
}

function durationBetween(
  cache: Map<string, DurationLeg>,
  from: LatLng,
  to: LatLng,
): DurationLeg {
  return (
    cache.get(keyOf(from, to)) ?? {
      distanceMeters: Math.round(haversineMeters(from, to) * 1.35),
      durationSeconds: estimateDriveSeconds(haversineMeters(from, to) * 1.35),
    }
  );
}

/**
 * Nearest-neighbor from start, then 2-opt improvement.
 * Locked stops keep relative order among locked ones by pinning first locked
 * as earliest possible and not swapping locked pairs freely — simple rule:
 * unlocked can move; locked keep their relative order in the final sequence.
 */
export function optimizeStopOrder(input: {
  start: LatLng;
  stops: TourStopPoint[];
  durationCache: Map<string, DurationLeg>;
}): TourStopPoint[] {
  const stops = [...input.stops];
  if (stops.length <= 1) return stops;

  const remaining = [...stops];
  const ordered: TourStopPoint[] = [];
  let cursor = input.start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestSec = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const sec = durationBetween(input.durationCache, cursor, candidate)
        .durationSeconds;
      if (sec < bestSec) {
        bestSec = sec;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(next);
    cursor = next;
  }

  // 2-opt on unlocked subsequence only (respect locked relative order)
  const lockedIds = new Set(
    stops.filter((s) => s.locked).map((s) => s.id),
  );
  let improved = true;
  let guard = 0;
  while (improved && guard < 40) {
    improved = false;
    guard += 1;
    for (let i = 0; i < ordered.length - 1; i++) {
      for (let k = i + 1; k < ordered.length; k++) {
        if (lockedIds.has(ordered[i]!.id) || lockedIds.has(ordered[k]!.id)) {
          continue;
        }
        const before = pathCost(input.start, ordered, input.durationCache);
        const next = [...ordered];
        const slice = next.slice(i, k + 1).reverse();
        next.splice(i, k - i + 1, ...slice);
        // Preserve relative order of locked stops
        if (!sameLockedOrder(ordered, next, lockedIds)) continue;
        const after = pathCost(input.start, next, input.durationCache);
        if (after + 1 < before) {
          ordered.splice(0, ordered.length, ...next);
          improved = true;
        }
      }
    }
  }

  return ordered;
}

function sameLockedOrder(
  a: TourStopPoint[],
  b: TourStopPoint[],
  lockedIds: Set<string>,
) {
  const la = a.filter((s) => lockedIds.has(s.id)).map((s) => s.id);
  const lb = b.filter((s) => lockedIds.has(s.id)).map((s) => s.id);
  return la.length === lb.length && la.every((id, i) => id === lb[i]);
}

function pathCost(
  start: LatLng,
  stops: TourStopPoint[],
  cache: Map<string, DurationLeg>,
) {
  let total = 0;
  let cursor = start;
  for (const stop of stops) {
    total += durationBetween(cache, cursor, stop).durationSeconds;
    cursor = stop;
  }
  return total;
}

export function buildTimeline(input: {
  startAt: Date;
  start: LatLng;
  stops: TourStopPoint[];
  durationCache: Map<string, DurationLeg>;
  defaultDwellMinutes: number;
  bufferMinutes: number;
}): TimelineStop[] {
  const result: TimelineStop[] = [];
  let cursor = input.start;
  let leaveCursor = new Date(input.startAt);

  for (let i = 0; i < input.stops.length; i++) {
    const stop = input.stops[i]!;
    const dwell =
      stop.dwellMinutes && stop.dwellMinutes > 0
        ? stop.dwellMinutes
        : input.defaultDwellMinutes;
    const leg = durationBetween(input.durationCache, cursor, stop);
    const driveWithBuffer =
      leg.durationSeconds + Math.max(0, input.bufferMinutes) * 60;
    const arrive = new Date(leaveCursor.getTime() + driveWithBuffer * 1000);
    const leave = new Date(arrive.getTime() + dwell * 60 * 1000);

    result.push({
      id: stop.id,
      mlsNumber: stop.mlsNumber,
      sortOrder: i,
      dwellMinutes: dwell,
      driveFromPrevSeconds: leg.durationSeconds,
      driveFromPrevMeters: leg.distanceMeters,
      suggestedArriveAt: arrive,
      suggestedLeaveAt: leave,
    });

    cursor = stop;
    leaveCursor = leave;
  }

  return result;
}

/** Recompute legs for a fixed order (no reordering). */
export function timelineForFixedOrder(input: {
  startAt: Date | null;
  start: LatLng | null;
  stops: TourStopPoint[];
  durationCache: Map<string, DurationLeg>;
  defaultDwellMinutes: number;
  bufferMinutes: number;
}): TimelineStop[] {
  if (!input.startAt || !input.start) {
    return input.stops.map((stop, i) => ({
      id: stop.id,
      mlsNumber: stop.mlsNumber,
      sortOrder: i,
      dwellMinutes:
        stop.dwellMinutes && stop.dwellMinutes > 0
          ? stop.dwellMinutes
          : input.defaultDwellMinutes,
      driveFromPrevSeconds: null,
      driveFromPrevMeters: null,
      suggestedArriveAt: null,
      suggestedLeaveAt: null,
    }));
  }

  return buildTimeline({
    startAt: input.startAt,
    start: input.start,
    stops: input.stops,
    durationCache: input.durationCache,
    defaultDwellMinutes: input.defaultDwellMinutes,
    bufferMinutes: input.bufferMinutes,
  });
}
