import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fetchBytes, parseCsv } from "@/lib/poi/sync/http";
import { GTA_BBOX, inBbox, type SyncPoi } from "@/lib/poi/sync/types";

const execFileAsync = promisify(execFile);

type GtfsFeed = {
  agency: string;
  url: string;
};

const FEEDS: GtfsFeed[] = [
  {
    agency: "TTC",
    url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/opendata_ttc_schedules.zip",
  },
  {
    agency: "GO",
    url: "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip",
  },
  {
    agency: "MiWay",
    url: "https://www.miapp.ca/GTFS/google_transit.zip",
  },
  {
    agency: "BramptonTransit",
    url: "https://www.arcgis.com/sharing/rest/content/items/a355aabd5a8c490186bdce559c9c75fb/data",
  },
];

async function readStopsTxtFromZip(bytes: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "houzzat-gtfs-"));
  const zipPath = join(dir, "feed.zip");
  try {
    await writeFile(zipPath, bytes);
    const { stdout } = await execFileAsync(
      "unzip",
      ["-p", zipPath, "stops.txt"],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function isUsefulStop(row: Record<string, string>): boolean {
  const locationType = (row.location_type ?? "").trim();
  // Keep stops + stations; skip entrances / boarding areas.
  if (locationType === "2" || locationType === "3" || locationType === "4") {
    return false;
  }
  return Boolean(row.stop_name?.trim());
}

/**
 * GTFS static stops from TTC, GO Transit, MiWay, and Brampton Transit.
 */
export async function fetchGtfsTransit(): Promise<SyncPoi[]> {
  const out: SyncPoi[] = [];

  for (const feed of FEEDS) {
    try {
      const bytes = await fetchBytes(feed.url);
      const stopsTxt = await readStopsTxtFromZip(bytes);
      const rows = parseCsv(stopsTxt);
      let kept = 0;
      for (const row of rows) {
        if (!isUsefulStop(row)) continue;
        const lat = Number(row.stop_lat);
        const lng = Number(row.stop_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (!inBbox(lat, lng, GTA_BBOX)) continue;
        const stopId = row.stop_id?.trim();
        if (!stopId) continue;

        out.push({
          source: "gtfs",
          sourceId: `${feed.agency}-${stopId}`,
          type: "TRANSIT",
          name: row.stop_name.trim(),
          address: row.stop_code ? `Stop ${row.stop_code}` : null,
          city: null,
          lat,
          lng,
          meta: {
            agency: feed.agency,
            locationType: row.location_type || "0",
            parentStation: row.parent_station || null,
          },
        });
        kept += 1;
      }
      console.info(`[poi:gtfs] ${feed.agency}: ${kept} stops in GTA`);
    } catch (error) {
      console.warn(`[poi:gtfs] ${feed.agency} failed:`, error);
    }
  }

  return out;
}
