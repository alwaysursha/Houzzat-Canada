import { geometryCentroid, titleCaseName } from "@/lib/poi/sync/geo";
import { fetchText, parseCsv } from "@/lib/poi/sync/http";
import type { SyncPoi } from "@/lib/poi/sync/types";

const PARKS_CSV =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/9a284a84-b9ff-484b-9e30-82f22c1780b9/resource/4467b829-625b-47ab-bcf9-898d726f3703/download/green-spaces-4326.csv";

const PARK_CLASSES = new Set([
  "Park",
  "Open Green Space",
  "Civic Centre Square",
]);

/**
 * City of Toronto open data — Green Spaces (parks / open green space).
 * Licence: Open Government Licence – Toronto.
 */
export async function fetchTorontoParks(): Promise<SyncPoi[]> {
  const text = await fetchText(PARKS_CSV);
  const rows = parseCsv(text);
  const out: SyncPoi[] = [];

  for (const row of rows) {
    const areaClass = row.AREA_CLASS ?? "";
    if (!PARK_CLASSES.has(areaClass)) continue;
    const name = titleCaseName(row.AREA_NAME ?? row.AREA_DESC ?? "");
    if (!name) continue;
    const point = geometryCentroid(row.geometry ?? "");
    if (!point) continue;
    const id = row.AREA_ID || row.OBJECTID || row._id;
    if (!id) continue;

    out.push({
      source: "toronto-opendata",
      sourceId: `park-${id}`,
      type: "PARK",
      name,
      address: null,
      city: "Toronto",
      lat: point.lat,
      lng: point.lng,
      meta: {
        areaClass,
        dataset: "green-spaces",
      },
    });
  }

  return out;
}
