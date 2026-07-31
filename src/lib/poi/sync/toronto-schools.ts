import { geometryCentroid, titleCaseName } from "@/lib/poi/sync/geo";
import { fetchText, parseCsv } from "@/lib/poi/sync/http";
import type { SyncPoi } from "@/lib/poi/sync/types";

const SCHOOLS_CSV =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1a714b5c-64c0-4cdf-9739-0086f80fb3ee/resource/f2c12e37-f533-4ecd-ac93-3166022fadec/download/school-locations-all-types-data-4326.csv";

const CITY_MAP: Record<string, string> = {
  TO: "Toronto",
  NY: "North York",
  ET: "Etobicoke",
  SC: "Scarborough",
  YK: "York",
  EY: "East York",
};

/**
 * City of Toronto open data — School Locations (All Types).
 * Licence: Open Government Licence – Toronto.
 */
export async function fetchTorontoSchools(): Promise<SyncPoi[]> {
  const text = await fetchText(SCHOOLS_CSV);
  const rows = parseCsv(text);
  const out: SyncPoi[] = [];

  for (const row of rows) {
    const name = titleCaseName(row.NAME ?? row.PLACE_NAME ?? "");
    if (!name) continue;
    const point = geometryCentroid(row.geometry ?? "");
    if (!point) continue;
    const id = row.GEO_ID || row.OBJECTID || row._id;
    if (!id) continue;

    const cityCode = (row.MUNICIPALITY || row.CITY || "TO").toUpperCase();
    out.push({
      source: "toronto-opendata",
      sourceId: `school-${id}`,
      type: "SCHOOL",
      name,
      address: row.ADDRESS_FULL || row.SOURCE_ADDRESS || null,
      city: CITY_MAP[cityCode] ?? "Toronto",
      lat: point.lat,
      lng: point.lng,
      meta: {
        board: emptyToNull(row.BOARD_NAME),
        schoolType: emptyToNull(row.SCHOOL_TYPE_DESC) ?? emptyToNull(row.SCHOOL_TYPE),
        level: emptyToNull(row.SCHOOL_LEVEL),
        postalCode: emptyToNull(row.POSTAL_CODE),
        dataset: "school-locations-all-types",
      },
    });
  }

  return out;
}

function emptyToNull(value: string | undefined): string | null {
  if (!value || value === "None") return null;
  return value.trim() || null;
}
