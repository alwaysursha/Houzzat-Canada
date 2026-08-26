/**
 * Stage 3J.4 — rollback exact Lead_B canary rows only.
 *
 *   pnpm workspace:rollback-lead-canary
 *   pnpm workspace:rollback-lead-canary -- --apply --confirm=tenant-canary-lead
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildLeadCanaryRollbackPlan,
  executeLeadCanaryRollbackApply,
  formatLeadCanaryRollbackReport,
  parseLeadCanaryCliArgs,
  requireLeadEmailForApply,
  requireScopeAckForApply,
  resolveLeadCanaryInputFromEnv,
  validateLeadCanaryApplyConfirmation,
} from "./lib/tenant-lead-canary";

async function main() {
  const { apply, confirm } = parseLeadCanaryCliArgs(process.argv.slice(2));
  const confirmError = validateLeadCanaryApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[rollback-lead-canary] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  const input = resolveLeadCanaryInputFromEnv();

  if (!process.env.DATABASE_URL) {
    console.log("LEAD B ROLLBACK PLAN\n\nDATABASE_URL: not set\n\nDRY RUN — NO PRODUCTION MUTATIONS");
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildLeadCanaryRollbackPlan(prisma, input);
    console.log(formatLeadCanaryRollbackReport(plan, apply ? "apply-preview" : "dry-run"));

    if (!apply) process.exit(0);

    const ackError = requireScopeAckForApply();
    if (ackError) {
      console.error(`[rollback-lead-canary] REFUSE --apply: ${ackError}`);
      process.exit(2);
    }

    const emailError = requireLeadEmailForApply(input);
    if (emailError) {
      console.error(`[rollback-lead-canary] REFUSE --apply: ${emailError}`);
      process.exit(2);
    }

    if (plan.driftStops.length > 0) {
      console.error(`[rollback-lead-canary] REFUSE --apply: DRIFT_STOP`);
      process.exit(2);
    }

    const applied = await executeLeadCanaryRollbackApply(prisma, input);
    console.log("");
    console.log("APPLY COMPLETE — LEAD B ROLLBACK APPLIED");
    console.log(JSON.stringify({ ok: true, appliedSteps: applied.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
