/**
 * Local PropTx VOW sync: pnpm mls:sync [maxPages] [fullBackfillDays]
 *
 * Defaults are intentionally high so inventory is not capped at ~500.
 * City allowlist: src/lib/proptx/sync-cities.ts (+ optional MLS_SYNC_CITIES).
 *
 * Examples:
 *   pnpm mls:sync           # 200 pages (~20k rows scanned), 90-day window
 *   pnpm mls:sync 500 180   # larger backfill
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { runPropTxMlsSync } = await import("../src/lib/proptx/sync");
  const { getMlsSyncCities } = await import("../src/lib/proptx/sync-cities");

  const maxPages = Number(process.argv[2] ?? 200);
  const fullBackfillDays = Number(process.argv[3] ?? 90);
  const cities = getMlsSyncCities();

  console.log(
    `Starting PropTx VOW sync (maxPages=${maxPages}, fullBackfillDays=${fullBackfillDays})…`,
  );
  console.log(`City allowlist (${cities.length}): ${cities.join(", ")}`);

  const result = await runPropTxMlsSync({ maxPages, fullBackfillDays });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
