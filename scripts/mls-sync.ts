/**
 * Local / CI PropTx MLS sync:
 *   pnpm mls:sync [maxPages] [fullBackfillDays] [resources]
 *   pnpm mls:sync --fast
 *   pnpm mls:sync:fast
 *
 * resources (optional, comma-separated):
 *   property,media,rooms,openHouse,syntheticHistory,history
 * Default resources: property,openHouse
 *
 * Property pass order (full/slow run):
 *   1) just-listed (ListingContractDate / entry time, newest first)
 *   2) recent ModificationTimestamp (newest first)
 *   3) ascending cursor backlog (history / sold catch-up)
 *   4) small sold-date + photo gap-fill
 *
 * Fast mode (`--fast` / MLS_SYNC_MODE=fast): just-listed + recent only.
 * Does not advance MlsSyncCursor. Skips the 7-day Typesense provenance heal.
 *
 * Examples:
 *   pnpm mls:sync 40 14
 *   pnpm mls:sync 80 30 property,openHouse
 *   pnpm mls:sync 50 30 property,media,rooms,openHouse
 *   pnpm mls:sync --fast
 */
import { config } from "dotenv";
import { assertMlsSyncExecutionHost } from "../src/lib/proptx/mls-sync-host";
import {
  isMlsFastSyncMode,
  resolveMlsSyncMode,
} from "../src/lib/proptx/mls-fast-sync";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  assertMlsSyncExecutionHost();
  const { runPropTxMlsSync } = await import("../src/lib/proptx/sync");
  const { getMlsSyncCities } = await import("../src/lib/proptx/sync-cities");

  const argv = process.argv.slice(2);
  const mode = resolveMlsSyncMode({ argv, env: process.env });
  const isFast = isMlsFastSyncMode(mode);
  const positional = argv.filter((arg) => arg !== "--fast");

  const maxPages = Number(positional[0] ?? 15);
  const fullBackfillDays = Number(positional[1] ?? 7);
  const resourcesArg = positional[2]?.trim();
  const resources = (
    isFast
      ? ["property"]
      : resourcesArg
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
    `Starting PropTx MLS sync (mode=${mode}, maxPages=${maxPages}, fullBackfillDays=${fullBackfillDays}, resources=${resources.join(",")})…`,
  );
  console.log(`City allowlist (${cities.length}): ${cities.join(", ")}`);

  const result = await runPropTxMlsSync({
    maxPages,
    fullBackfillDays,
    resources,
    mode,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;

  if (isFast) {
    console.log("[mls] mode=fast skip Typesense provenance heal");
    return;
  }

  // Heal Typesense provenance for recent listings so entitlement filters
  // never lag behind Neon (idempotent upsert with sourceAuthorityKey).
  const healDays = Math.max(
    1,
    Number(process.env.TYPESENSE_PROVENANCE_HEAL_DAYS ?? 7),
  );
  const { isTypesenseSyncEnabled, typesenseSyncDisabledReason } = await import(
    "../src/lib/typesense/sync-listing"
  );
  const typesenseOff = typesenseSyncDisabledReason();
  if (typesenseOff) {
    console.error(
      `ERROR: Typesense writes are off (${typesenseOff}). Neon can be current while houzzat.com stays stale.`,
    );
  }
  const syncFlag = process.env.TYPESENSE_SYNC;
  if (syncFlag !== "0" && syncFlag !== "false" && isTypesenseSyncEnabled()) {
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
