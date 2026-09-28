import type { LocalRoutePlanner } from "@/lib/route-planner/local";

export type GuestRoutePlannerMergeResult = "skipped" | "merged" | "failed";

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Fields worth sending. Null, blank, and missing start values are omitted so
 * they cannot replace an authenticated tour's start.
 */
export function guestRoutePlannerMergeBody(
  local: LocalRoutePlanner,
): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};
  if (local.mlsNumbers.length > 0) {
    body.mergeMlsNumbers = local.mlsNumbers;
  }
  if (hasText(local.startAddress)) body.startAddress = local.startAddress.trim();
  if (finiteNumber(local.startLat)) body.startLat = local.startLat;
  if (finiteNumber(local.startLng)) body.startLng = local.startLng;
  if (hasText(local.startAt)) body.startAt = local.startAt.trim();
  if (finiteNumber(local.defaultDwellMinutes)) {
    body.defaultDwellMinutes = local.defaultDwellMinutes;
  }
  if (finiteNumber(local.bufferMinutes)) {
    body.bufferMinutes = local.bufferMinutes;
  }
  return Object.keys(body).length > 0 ? body : null;
}

/**
 * Clear guest localStorage only after the server accepts the merge and the
 * authenticated tour has been reloaded. Any failed response leaves the backup.
 */
export async function mergeGuestRoutePlanner(deps: {
  load: () => LocalRoutePlanner;
  patch: (body: Record<string, unknown>) => Promise<{ ok: boolean }>;
  refresh: () => Promise<void>;
  clear: () => void;
}): Promise<GuestRoutePlannerMergeResult> {
  const body = guestRoutePlannerMergeBody(deps.load());
  if (!body) return "skipped";

  let response: { ok: boolean };
  try {
    response = await deps.patch(body);
  } catch {
    return "failed";
  }
  if (!response.ok) return "failed";

  try {
    await deps.refresh();
  } catch {
    return "failed";
  }

  deps.clear();
  return "merged";
}
