import type { ListingCard } from "@/lib/listings/types";

export type OpenHouseDayTab = "sat" | "sun";

export function listingHasOpenHouseOnDay(
  listing: Pick<ListingCard, "openHouses">,
  day: OpenHouseDayTab,
): boolean {
  const want = day === "sat" ? 6 : 0;
  return listing.openHouses.some((oh) => {
    const d = new Date(oh.startsAt).getDay();
    return d === want;
  });
}

export function soonestOpenHouseOnDay(
  listing: Pick<ListingCard, "openHouses">,
  day: OpenHouseDayTab,
): number {
  const want = day === "sat" ? 6 : 0;
  let min = Number.POSITIVE_INFINITY;
  for (const oh of listing.openHouses) {
    const at = new Date(oh.startsAt);
    if (at.getDay() !== want) continue;
    const t = at.getTime();
    if (t < min) min = t;
  }
  return min;
}

/**
 * Saturday remains the preferred default when it has listings or both are empty.
 * Sunday-only inventory must open on Sunday so the rail is not blank.
 */
export function defaultOpenHouseDayTab(
  satCount: number,
  sunCount: number,
): OpenHouseDayTab {
  if (satCount <= 0 && sunCount > 0) return "sun";
  return "sat";
}
