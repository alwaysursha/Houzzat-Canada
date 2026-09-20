import {
  LEAD_RETURNED_INACTIVITY_BUCKETS_DAYS,
  type LeadReturnedInactivityBucketDays,
} from "./constants";

/**
 * Pick the single highest inactivity bucket the Lead has reached.
 * Does not emit every smaller threshold previously crossed.
 */
export function selectLeadReturnedInactivityBucket(
  daysInactive: number,
): LeadReturnedInactivityBucketDays | null {
  if (!Number.isFinite(daysInactive) || daysInactive < 0) return null;
  let matched: LeadReturnedInactivityBucketDays | null = null;
  for (const bucket of LEAD_RETURNED_INACTIVITY_BUCKETS_DAYS) {
    if (daysInactive >= bucket) matched = bucket;
  }
  return matched;
}

export function parseInactivityBuckets(
  value: unknown,
): number[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const nums = value
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item) => Number.isInteger(item) && item > 0);
  return nums.length ? nums : null;
}
