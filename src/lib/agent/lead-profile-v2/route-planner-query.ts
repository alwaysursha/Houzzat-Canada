/** Client/server-safe Route Planner helpers. No Prisma. */

import { ROUTE_PLANNER_MAX_STOPS } from "@/lib/route-planner/optimize";
import type {
  LeadProfileV2RoutePlannerPanel,
  LeadProfileV2RoutePlannerTour,
} from "@/lib/agent/lead-profile-v2/types";

export const V2_ROUTE_PLANNER_RESOURCE_KEY = "route-planner";

/** Same bound as the current Engagement tours list. */
export const V2_ROUTE_PLANNER_TOUR_TAKE = 8;

/**
 * Nested stop hydration cap. Matches ROUTE_PLANNER_MAX_STOPS. Nested stops
 * are not schema-capped; historical/PRO rows can exceed 10. Do not remove this
 * take — unbounded nested stops is a Worker memory risk.
 */
export const V2_ROUTE_PLANNER_STOPS_TAKE = ROUTE_PLANNER_MAX_STOPS;

export type V2RoutePlannerStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2RoutePlannerResponse(input: {
  stamp: V2RoutePlannerStamp;
  current: V2RoutePlannerStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}

export function mapV2RoutePlannerTours(
  rows: Array<{
    id: string;
    name: string;
    status: LeadProfileV2RoutePlannerTour["status"];
    _count: { stops: number };
    stops: Array<{ mlsNumber: string }>;
  }>,
): LeadProfileV2RoutePlannerPanel {
  return {
    tours: rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      stopCount: row._count.stops,
      stops: row.stops,
    })),
  };
}

export function v2RoutePlannerStopsTruncated(tour: {
  stopCount: number;
  stops: Array<{ mlsNumber: string }>;
}): boolean {
  return tour.stopCount > tour.stops.length;
}

/**
 * Visible count must match the rendered MLS list. When hydration is capped
 * below the stored total, the total is labeled explicitly ("10 of 15 stops")
 * rather than claiming the list is the full total.
 */
export function formatV2RoutePlannerTourStopsPhrase(tour: {
  stopCount: number;
  stops: Array<{ mlsNumber: string }>;
}): string {
  const loaded = tour.stops.length;
  const countLabel = v2RoutePlannerStopsTruncated(tour)
    ? `${loaded} of ${tour.stopCount} stops`
    : `${loaded} stops`;
  if (loaded === 0) return countLabel;
  return `${countLabel} (${tour.stops.map((s) => s.mlsNumber).join(", ")})`;
}
