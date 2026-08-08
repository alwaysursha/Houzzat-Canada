/** Pure path helpers — safe for client bundles (no Prisma / Node deps). */

/** Single path segment: "Richmond Hill" → "richmond-hill". */
export function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function homesForSaleCityPath(city: string): string {
  return `/homes-for-sale/${slugifySegment(city)}`;
}

export function homesForSaleCommunityPath(
  city: string,
  community: string,
): string {
  return `/homes-for-sale/${slugifySegment(city)}/${slugifySegment(community)}`;
}

export function homesForSalePath(input: {
  city: string;
  community?: string | null;
}): string {
  return input.community
    ? homesForSaleCommunityPath(input.city, input.community)
    : homesForSaleCityPath(input.city);
}

/** Known GTA hubs when listing centroids are unavailable. */
export const GTA_CITY_CENTROIDS: Record<
  string,
  { name: string; lat: number; lng: number }
> = {
  toronto: { name: "Toronto", lat: 43.6532, lng: -79.3832 },
  mississauga: { name: "Mississauga", lat: 43.589, lng: -79.6441 },
  brampton: { name: "Brampton", lat: 43.7315, lng: -79.7624 },
  markham: { name: "Markham", lat: 43.8561, lng: -79.337 },
  vaughan: { name: "Vaughan", lat: 43.8563, lng: -79.5085 },
  oakville: { name: "Oakville", lat: 43.4675, lng: -79.6877 },
  burlington: { name: "Burlington", lat: 43.3255, lng: -79.799 },
  "richmond-hill": { name: "Richmond Hill", lat: 43.8828, lng: -79.4403 },
  ajax: { name: "Ajax", lat: 43.8509, lng: -79.0204 },
  pickering: { name: "Pickering", lat: 43.8384, lng: -79.0868 },
  whitby: { name: "Whitby", lat: 43.8975, lng: -78.9429 },
  oshawa: { name: "Oshawa", lat: 43.8971, lng: -78.8658 },
  milton: { name: "Milton", lat: 43.5183, lng: -79.8774 },
  newmarket: { name: "Newmarket", lat: 44.0592, lng: -79.4613 },
  aurora: { name: "Aurora", lat: 44.0065, lng: -79.4504 },
  caledon: { name: "Caledon", lat: 43.8668, lng: -79.8645 },
  georgetown: { name: "Georgetown", lat: 43.6502, lng: -79.918 },
  "halton-hills": { name: "Halton Hills", lat: 43.6305, lng: -79.95 },
  "king-city": { name: "King City", lat: 43.9289, lng: -79.526 },
  stouffville: { name: "Stouffville", lat: 43.9706, lng: -79.244 },
};
