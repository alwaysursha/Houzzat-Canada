/**
 * Stage 5.6 — unwrap Mobile v2 Viewings Planner API envelopes.
 */

import type { BackendEnvelope } from "../types/api";
import type { MobileViewingsPlannerTour } from "../types/viewings-planner";

export function unwrapViewingsPlannerTour(data: unknown): MobileViewingsPlannerTour | null {
  if (!data || typeof data !== "object") return null;

  const env = data as BackendEnvelope<{ tour?: MobileViewingsPlannerTour | null }>;
  if (env.ok && env.data?.tour) {
    return env.data.tour;
  }

  const direct = data as {
    tour?: MobileViewingsPlannerTour | null;
    ok?: boolean;
  };
  if (direct.tour && typeof direct.tour.id === "string") {
    return direct.tour;
  }

  if ("id" in (data as object) && "stops" in (data as object)) {
    return data as MobileViewingsPlannerTour;
  }

  return null;
}
