/**
 * HIGH OCTANE staging snapshot retirement preview.
 * Dry run only. It does not open a database connection or delete rows.
 *
 * Run: pnpm exec tsx scripts/retire-high-octane-staging-snapshot.ts --dry-run
 */
import {
  HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
  HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
} from "../src/lib/tenancy/templates/high-octane-staging-snapshot";
import {
  planHighOctaneStagingSnapshotRetirement,
  snapshotRetirementCliDecision,
} from "../src/lib/tenancy/templates/high-octane-staging-snapshot-retirement";

const decision = snapshotRetirementCliDecision(process.argv.slice(2));
if (decision === "refused") {
  console.error("Refusing snapshot retirement. This command accepts only --dry-run.");
  process.exit(2);
}

const plan = planHighOctaneStagingSnapshotRetirement({ manifestMlsNumbers: [] });

console.log(
  JSON.stringify(
    {
      mode: "dry-run",
      source_read: "NO",
      destination_write: "NO",
      retired_count: plan.retire.length,
      match: {
        dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
        providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
        organizationId: null,
        mlsNumberAlone: false,
      },
      dependents: ["listingMedia", "listingRoom", "listingSource", "listingHistory", "openHouse"],
      plan,
    },
    null,
    2,
  ),
);
