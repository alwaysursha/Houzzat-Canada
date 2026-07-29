/**
 * Backfill MLS listing photos for rows with zero media.
 * Usage: pnpm mls:media [maxPages=50]
 * Processes ~maxPages * 50 listings (default ~2500).
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { runPropTxMlsSync } = await import("../src/lib/proptx/sync");
  const maxPages = Number(process.argv[2] ?? 50);

  console.log(
    `MLS media backfill (maxPages=${maxPages}, ~${Math.max(maxPages * 50, 200)} listings)…`,
  );
  const result = await runPropTxMlsSync({
    maxPages,
    fullBackfillDays: 1,
    resources: ["media"],
    mediaBackfillOnly: true,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
