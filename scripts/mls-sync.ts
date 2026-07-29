/**
 * Local / CI PropTx VOW sync:
 *   pnpm mls:sync [maxPages] [fullBackfillDays] [resources]
 *
 * resources (optional, comma-separated):
 *   property,media,rooms,openHouse,syntheticHistory,history
 * Default resources: property,openHouse
 * Property always runs: recent → per-city Active inventory → cursor backlog → photo gap-fill.
 *
 * Examples:
 *   pnpm mls:sync 40 14
 *   pnpm mls:sync 80 30 property,openHouse
 *   pnpm mls:sync 50 30 property,media,rooms,openHouse
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { runPropTxMlsSync } = await import("../src/lib/proptx/sync");
  const { getMlsSyncCities } = await import("../src/lib/proptx/sync-cities");

  const maxPages = Number(process.argv[2] ?? 15);
  const fullBackfillDays = Number(process.argv[3] ?? 7);
  const resourcesArg = process.argv[4]?.trim();
  const resources = (
    resourcesArg
      ? resourcesArg.split(",").map((s) => s.trim()).filter(Boolean)
      : ["property", "openHouse"]
  ) as Array<
    | "property"
    | "media"
    | "rooms"
    | "openHouse"
    | "history"
    | "syntheticHistory"
  >;
  const cities = getMlsSyncCities();

  console.log(
    `Starting PropTx VOW sync (maxPages=${maxPages}, fullBackfillDays=${fullBackfillDays}, resources=${resources.join(",")})…`,
  );
  console.log(`City allowlist (${cities.length}): ${cities.join(", ")}`);

  const result = await runPropTxMlsSync({
    maxPages,
    fullBackfillDays,
    resources,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
