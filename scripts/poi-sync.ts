/**
 * Sync free Canadian amenity data into Poi:
 *   pnpm poi:sync
 *   pnpm poi:sync toronto
 *   pnpm poi:sync gtfs
 *   pnpm poi:sync osm
 *   pnpm poi:sync toronto,gtfs
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { runPoiOpenDataSync } = await import("../src/lib/poi/sync/run-sync");

  const arg = process.argv[2]?.trim();
  const sources = (
    arg
      ? arg
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : ["toronto", "gtfs", "osm"]
  ) as Array<"toronto" | "gtfs" | "osm">;

  const result = await runPoiOpenDataSync({ sources });
  console.info(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("[poi:sync] failed", error);
  process.exitCode = 1;
});
