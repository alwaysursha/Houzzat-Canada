/**
 * Stage 3J.6 — guarded Task_B canary for Lead_B.
 *
 *   pnpm workspace:task-canary
 *   pnpm workspace:task-canary -- --apply --confirm=tenant-canary-task
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildTaskCanaryPlan,
  executeTaskCanaryApply,
  formatTaskCanaryReport,
  parseTaskCanaryCliArgs,
  requireLeadEmailForApply,
  requireScopeAckForApply,
  resolveLeadCanaryInputFromEnv,
  resolveTrustedCanaryBContext,
  validateTaskCanaryApplyConfirmation,
} from "./lib/tenant-task-canary";
import { verifyScopeGates } from "./lib/tenant-canary-provision";

async function main() {
  const { apply, confirm } = parseTaskCanaryCliArgs(process.argv.slice(2));
  const confirmError = validateTaskCanaryApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[workspace-task-canary] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  const input = resolveLeadCanaryInputFromEnv();
  if (!process.env.DATABASE_URL) {
    console.log("TASK B CANARY PLAN\n\nDATABASE_URL not set\n\nDRY RUN — NO PRODUCTION MUTATIONS");
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildTaskCanaryPlan(prisma, input);
    console.log(formatTaskCanaryReport(plan, apply ? "apply-preview" : "dry-run"));

    if (!apply) process.exit(0);

    const ackError = requireScopeAckForApply();
    if (ackError || !verifyScopeGates().ok) {
      console.error("[workspace-task-canary] REFUSE --apply: scope gates");
      process.exit(2);
    }
    const emailError = requireLeadEmailForApply(input);
    if (emailError) {
      console.error(`[workspace-task-canary] REFUSE: ${emailError}`);
      process.exit(2);
    }
    if (plan.driftStops.length > 0 || !plan.houzzatBaseline) {
      console.error("[workspace-task-canary] REFUSE --apply: DRIFT_STOP");
      process.exit(2);
    }

    const context = await resolveTrustedCanaryBContext(prisma);
    const applied = await executeTaskCanaryApply(
      prisma,
      input,
      context,
      plan.houzzatBaseline,
    );
    console.log("");
    console.log("APPLY COMPLETE — TASK_B MUTATION APPLIED");
    console.log(JSON.stringify({ ok: true, appliedSteps: applied.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
