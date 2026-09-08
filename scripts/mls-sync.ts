/**
 * Local / CI PropTx MLS sync:
 *   pnpm mls:sync [maxPages] [fullBackfillDays] [resources]
 *
 * resources (optional, comma-separated):
 *   property,media,rooms,openHouse,syntheticHistory,history
 * Default resources: property,openHouse
 *
 * Property pass order (every run):
 *   1) just-listed (ListingContractDate / entry time, newest first)
 *   2) recent ModificationTimestamp (newest first)
 *   3) ascending cursor backlog (history / sold catch-up)
 *   4) small sold-date + photo gap-fill
 *
 * Mac 15m ticks set MLS_SYNC_*_PAGES / MEDIA_CAP / SOLD_CAP for a lean split.
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
    | "activeInventory"
  >;
  const cities = getMlsSyncCities();

  console.log(
    `Starting PropTx MLS sync (maxPages=${maxPages}, fullBackfillDays=${fullBackfillDays}, resources=${resources.join(",")})…`,
  );
  console.log(`City allowlist (${cities.length}): ${cities.join(", ")}`);

  const result = await runPropTxMlsSync({
    maxPages,
    fullBackfillDays,
    resources,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;

  // Heal Typesense provenance for recent listings so entitlement filters
  // never lag behind Neon (idempotent upsert with sourceAuthorityKey).
  const healDays = Math.max(
    1,
    Number(process.env.TYPESENSE_PROVENANCE_HEAL_DAYS ?? 3),
  );
  const syncFlag = process.env.TYPESENSE_SYNC;
  if (syncFlag !== "0" && syncFlag !== "false") {
    console.log(
      `Healing Typesense provenance for listings listed in the last ${healDays} day(s)…`,
    );
    const { backfillTypesenseListingProvenance } = await import(
      "../src/lib/typesense/backfill-provenance"
    );
    const heal = await backfillTypesenseListingProvenance({
      batchSize: 250,
      sinceDays: healDays,
    });
    console.log(JSON.stringify({ provenanceHeal: heal }, null, 2));
    if (!heal.ok) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
