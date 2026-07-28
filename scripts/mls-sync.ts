/**
 * Local PropTx VOW sync: pnpm mls:sync
 * Load env before importing sync (ESM import hoisting).
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  // Dynamic import after dotenv so PROPTX_* are available.
  const { runPropTxMlsSync } = await import("../src/lib/proptx/sync");
  const maxPages = Number(process.argv[2] ?? 5);
  const fullBackfillDays = Number(process.argv[3] ?? 14);

  console.log(
    `Starting PropTx VOW sync (maxPages=${maxPages}, fullBackfillDays=${fullBackfillDays})…`,
  );
  const result = await runPropTxMlsSync({ maxPages, fullBackfillDays });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
