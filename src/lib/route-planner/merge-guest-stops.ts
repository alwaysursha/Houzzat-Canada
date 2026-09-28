import { ROUTE_PLANNER_MAX_STOPS } from "@/lib/route-planner/optimize";

export type GuestTourStop = {
  mlsNumber: string;
  sortOrder: number;
};

/**
 * Injected so a concurrent unique collision can be retried without a second store.
 * The database unique key on (tourId, mlsNumber) stays the backstop.
 */
export type GuestStopMergeDb = {
  listActiveMls(mlsNumbers: string[]): Promise<string[]>;
  listStops(tourId: string): Promise<GuestTourStop[]>;
  createStop(input: {
    tourId: string;
    mlsNumber: string;
    sortOrder: number;
  }): Promise<void>;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function orderedMls(stops: GuestTourStop[]): string[] {
  return stops
    .map((stop, index) => ({ stop, index }))
    .sort(
      (a, b) => a.stop.sortOrder - b.stop.sortOrder || a.index - b.index,
    )
    .map((row) => row.stop.mlsNumber);
}

function nextSortOrder(stops: GuestTourStop[]): number {
  if (stops.length === 0) return 0;
  return Math.max(...stops.map((stop) => stop.sortOrder)) + 1;
}

/**
 * Append guest homes onto an existing tour.
 * Existing stops keep their sort order. New stops follow the guest list order.
 * An MLS already on the tour, including one inserted by a concurrent merge, is skipped.
 */
export async function appendGuestStopsInOrder(
  db: GuestStopMergeDb,
  input: { tourId: string; mergeMlsNumbers: string[] },
): Promise<{ mlsNumbers: string[] }> {
  const active = new Set(await db.listActiveMls(input.mergeMlsNumbers));
  let stops = await db.listStops(input.tourId);
  const seen = new Set(stops.map((stop) => stop.mlsNumber));

  for (const mlsNumber of input.mergeMlsNumbers) {
    if (!active.has(mlsNumber)) continue;
    if (seen.has(mlsNumber)) continue;
    if (stops.length >= ROUTE_PLANNER_MAX_STOPS) break;

    try {
      const sortOrder = nextSortOrder(stops);
      await db.createStop({
        tourId: input.tourId,
        mlsNumber,
        sortOrder,
      });
      stops = [...stops, { mlsNumber, sortOrder }];
      seen.add(mlsNumber);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      stops = await db.listStops(input.tourId);
      for (const stop of stops) seen.add(stop.mlsNumber);
      seen.add(mlsNumber);
    }
  }

  return { mlsNumbers: orderedMls(stops) };
}
