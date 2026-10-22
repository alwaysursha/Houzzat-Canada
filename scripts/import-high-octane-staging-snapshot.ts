/**
 * HIGH OCTANE staging snapshot planner.
 * Dry run only. It does not open a database connection, read production,
 * or write the staging branch.
 *
 * Run: pnpm exec tsx scripts/import-high-octane-staging-snapshot.ts --dry-run
 */
import {
  HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
  HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
  planHighOctaneStagingSnapshot,
  snapshotImportCliDecision,
} from "../src/lib/tenancy/templates/high-octane-staging-snapshot";

const decision = snapshotImportCliDecision(process.argv.slice(2));
if (decision === "refused") {
  console.error("Refusing snapshot import. This command accepts only --dry-run.");
  process.exit(2);
}

const plan = planHighOctaneStagingSnapshot({ candidates: [] });

console.log(
  JSON.stringify(
    {
      mode: "dry-run",
      source_read: "NO",
      destination_write: "NO",
      mls_sync: "NO",
      selected_count: 0,
      slots: plan.records.map((record) => ({
        slot: record.slot,
        action: record.action,
        reason: record.reason,
      })),
      isolation: {
        dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
        providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
        organizationId: null,
        listingKey: null,
        credentialRef: null,
        recognizedMlsProvider: plan.manifest.recognizedMlsProvider,
        workspaceSlug: plan.manifest.workspaceSlug,
      },
      media: {
        download: "NO",
        eligible: "public-cdn",
        galleryCap: 5,
        propTxForSnapshot: "NO",
      },
      manifest: plan.manifest,
    },
    null,
    2,
  ),
);
