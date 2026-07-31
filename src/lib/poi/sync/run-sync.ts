import { fetchGtfsTransit } from "@/lib/poi/sync/gtfs";
import { fetchOsmAmenities } from "@/lib/poi/sync/osm";
import { fetchTorontoParks } from "@/lib/poi/sync/toronto-parks";
import { fetchTorontoSchools } from "@/lib/poi/sync/toronto-schools";
import type { SyncPoi } from "@/lib/poi/sync/types";
import { upsertPois } from "@/lib/poi/sync/upsert";
import { prisma } from "@/lib/prisma";

export type PoiSyncResult = {
  ok: true;
  fetched: Record<string, number>;
  upserted: number;
  byType: Record<string, number>;
  sources: string[];
};

export type PoiSyncOptions = {
  /** Comma-friendly list: toronto,gtfs,osm,all */
  sources?: Array<"toronto" | "gtfs" | "osm">;
};

/**
 * Sync nearby amenities from free Canadian open data:
 * - Toronto open data: schools + parks
 * - GTFS: TTC / GO / MiWay / Brampton Transit stops
 * - OpenStreetMap: grocery GTA-wide; schools/parks outside Toronto
 */
export async function runPoiOpenDataSync(
  options: PoiSyncOptions = {},
): Promise<PoiSyncResult> {
  const wanted = new Set(
    options.sources?.length ? options.sources : ["toronto", "gtfs", "osm"],
  );

  const buckets: Record<string, SyncPoi[]> = {};

  if (wanted.has("toronto")) {
    console.info("[poi:sync] Fetching Toronto schools…");
    buckets.torontoSchools = await fetchTorontoSchools();
    console.info(`[poi:sync] Toronto schools: ${buckets.torontoSchools.length}`);

    console.info("[poi:sync] Fetching Toronto parks…");
    buckets.torontoParks = await fetchTorontoParks();
    console.info(`[poi:sync] Toronto parks: ${buckets.torontoParks.length}`);
  }

  if (wanted.has("gtfs")) {
    console.info("[poi:sync] Fetching GTFS transit stops…");
    buckets.gtfs = await fetchGtfsTransit();
    console.info(`[poi:sync] GTFS stops: ${buckets.gtfs.length}`);
  }

  if (wanted.has("osm")) {
    console.info("[poi:sync] Fetching OSM grocery + 905 schools/parks…");
    try {
      buckets.osm = await fetchOsmAmenities();
      console.info(`[poi:sync] OSM amenities: ${buckets.osm.length}`);
    } catch (error) {
      console.warn("[poi:sync] OSM sync skipped after failures:", error);
      buckets.osm = [];
    }
  }

  const all = Object.values(buckets).flat();
  console.info(`[poi:sync] Upserting ${all.length} POIs…`);
  const { upserted } = await upsertPois(all);

  const counts = await prisma.poi.groupBy({
    by: ["type"],
    _count: { _all: true },
  });

  return {
    ok: true,
    fetched: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, v.length]),
    ),
    upserted,
    byType: Object.fromEntries(
      counts.map((c) => [c.type, c._count._all]),
    ),
    sources: [...wanted],
  };
}
