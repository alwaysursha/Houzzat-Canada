/**
 * Backfill Property-derived listing history (price change / status events).
 * Usage: pnpm mls:history [limitPages=10]
 *
 * HistoryTransactional is not on this VOW feed; we synthesize from Property.
 */
import { config } from "dotenv";
import { assertMlsSyncExecutionHost } from "../src/lib/proptx/mls-sync-host";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  assertMlsSyncExecutionHost();
  const { runPropTxMlsSync } = await import("../src/lib/proptx/sync");
  const maxPages = Number(process.argv[2] ?? 10);
  console.log(`MLS synthetic history backfill (maxPages=${maxPages})…`);
  const result = await runPropTxMlsSync({
    maxPages,
    fullBackfillDays: 1,
    resources: ["syntheticHistory"],
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
