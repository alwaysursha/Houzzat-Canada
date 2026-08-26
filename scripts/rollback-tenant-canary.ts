/**
 * Stage 3J.2 — guarded Workspace #2 (tenant-canary) rollback.
 *
 *   pnpm workspace:rollback-canary
 *   pnpm workspace:rollback-canary -- --apply --confirm=tenant-canary
 *
 * Dry-run by default. Never touches Houzzat or CrmRoutingSettings id=default.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildRollbackPlan,
  CANARY_SLUG,
  executeRollbackApply,
  formatRollbackReport,
  HOUZZAT_ROUTING_ID,
  parseCanaryCliArgs,
  resolveCanaryIdentityFromEnv,
  validateApplyConfirmation,
} from "./lib/tenant-canary-provision";
import { HOUZZAT_WORKSPACE_SLUG } from "../src/lib/crm-ownership";

async function main() {
  const { apply, confirm } = parseCanaryCliArgs(process.argv.slice(2));
  const confirmError = validateApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[rollback-tenant-canary] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  if (CANARY_SLUG === HOUZZAT_WORKSPACE_SLUG) {
    console.error("[rollback-tenant-canary] REFUSE: canary slug collides with Houzzat");
    process.exit(2);
  }

  const identity = resolveCanaryIdentityFromEnv();

  if (!process.env.DATABASE_URL) {
    console.log(
      [
        "CANARY ROLLBACK PLAN",
        "",
        "DATABASE_URL: not set — read-only inspection skipped",
        "",
        "Houzzat protected:",
        `  - workspace slug ${HOUZZAT_WORKSPACE_SLUG}`,
        `  - routing id ${HOUZZAT_ROUTING_ID}`,
        "",
        "DRY RUN — NO PRODUCTION MUTATIONS",
      ].join("\n"),
    );
    if (apply) {
      console.error("[rollback-tenant-canary] REFUSE --apply without DATABASE_URL");
      process.exit(2);
    }
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildRollbackPlan(prisma, identity);
    console.log(formatRollbackReport(plan, apply ? "apply-preview" : "dry-run"));

    if (!apply) {
      process.exit(0);
    }

    if (plan.driftStops.length > 0) {
      console.error(
        `[rollback-tenant-canary] REFUSE --apply: ${plan.driftStops.length} DRIFT_STOP`,
      );
      for (const stop of plan.driftStops) {
        console.error(`  - ${stop.object}: ${stop.detail}`);
      }
      process.exit(2);
    }

    const applied = await executeRollbackApply(prisma, identity);
    console.log(
      JSON.stringify({ ok: true, appliedSteps: applied.length }, null, 2),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
