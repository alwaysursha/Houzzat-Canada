/**
 * Production-safe DRY RUN of duplicate Lead reconciliation.
 * Reads only. Never executes merges.
 *
 * Run: pnpm lead-duplicate-reconciliation:dryrun
 */
import {
  LEAD_DUPLICATE_FK_AUDIT,
  planLeadDuplicateReconciliation,
} from "../src/lib/agent/lead-duplicate-reconciliation";
import { prisma } from "../src/lib/prisma";

async function main() {
  const executeRequested = process.argv.includes("--execute");
  if (executeRequested) {
    console.error(
      "Refusing --execute. Production reconciliation is approval-gated and must not run from this script.",
    );
    process.exit(2);
  }

  const plans = await planLeadDuplicateReconciliation(prisma);
  const report = {
    mode: "dry-run",
    fkAudit: LEAD_DUPLICATE_FK_AUDIT,
    groupCount: plans.length,
    groups: plans,
    uniquenessConstraintBlockedUntilMerge:
      plans.length > 0
        ? "Existing (workspaceId, customerId) duplicates remain. Do not add the unique index until these groups are approved and executed."
        : "No duplicate groups found. Unique index can be considered separately.",
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
