/**
 * Backfill Rooms for MLS listings missing room rows.
 * Usage: pnpm mls:rooms [limitPages=8]
 *
 * Note: HistoryTransactional is not included on this VOW feed yet.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { runPropTxMlsSync } = await import("../src/lib/proptx/sync");
  const maxPages = Number(process.argv[2] ?? 8);
  console.log(`MLS rooms backfill (maxPages=${maxPages})…`);
  const result = await runPropTxMlsSync({
    maxPages,
    fullBackfillDays: 1,
    resources: ["rooms"],
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
