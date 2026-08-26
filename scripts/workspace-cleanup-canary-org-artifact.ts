/**
 * Stage 3J.8 — cleanup OWNER_B demo-agent OrganizationMembership (dry-run default).
 *
 *   pnpm workspace:cleanup-canary-org-artifact
 *
 * Apply is refused in this stage.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildOrgArtifactCleanupPlan,
  formatOrgArtifactCleanupReport,
  parseOrgArtifactCleanupCliArgs,
  validateOrgArtifactCleanupApplyConfirmation,
} from "./lib/tenant-org-artifact-cleanup";

async function main() {
  const { apply, confirm } = parseOrgArtifactCleanupCliArgs(process.argv.slice(2));
  const confirmError = validateOrgArtifactCleanupApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[workspace-cleanup-canary-org-artifact] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.log("CANARY ORG ARTIFACT CLEANUP PLAN\n\nDRY RUN — NO PRODUCTION MUTATIONS");
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildOrgArtifactCleanupPlan(prisma);
    console.log(formatOrgArtifactCleanupReport(plan, apply ? "apply-preview" : "dry-run"));

    if (!apply) process.exit(0);

    console.error(
      "[workspace-cleanup-canary-org-artifact] REFUSE --apply: Stage 3J.8 dry-run only — do not delete org artifact yet",
    );
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
