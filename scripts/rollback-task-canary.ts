/**
 * Stage 3J.6 — rollback exact Task_B canary only.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildTaskCanaryRollbackPlan,
  executeTaskCanaryRollbackApply,
  formatTaskCanaryRollbackReport,
  parseTaskCanaryCliArgs,
  requireLeadEmailForApply,
  requireScopeAckForApply,
  resolveLeadCanaryInputFromEnv,
  validateTaskCanaryApplyConfirmation,
} from "./lib/tenant-task-canary";

async function main() {
  const { apply, confirm } = parseTaskCanaryCliArgs(process.argv.slice(2));
  const confirmError = validateTaskCanaryApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[rollback-task-canary] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  const input = resolveLeadCanaryInputFromEnv();
  if (!process.env.DATABASE_URL) {
    console.log("TASK B ROLLBACK PLAN\n\nDRY RUN — NO PRODUCTION MUTATIONS");
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildTaskCanaryRollbackPlan(prisma, input);
    console.log(formatTaskCanaryRollbackReport(plan, apply ? "apply-preview" : "dry-run"));
    if (!apply) process.exit(0);

    const ackError = requireScopeAckForApply();
    if (ackError) {
      console.error(`[rollback-task-canary] REFUSE: ${ackError}`);
      process.exit(2);
    }
    const emailError = requireLeadEmailForApply(input);
    if (emailError) {
      console.error(`[rollback-task-canary] REFUSE: ${emailError}`);
      process.exit(2);
    }

    const applied = await executeTaskCanaryRollbackApply(prisma, input);
    console.log(JSON.stringify({ ok: true, appliedSteps: applied.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
