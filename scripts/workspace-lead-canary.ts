/**
 * Stage 3J.4 — guarded Workspace #2 Lead_B canary.
 *
 *   pnpm workspace:lead-canary
 *   pnpm workspace:lead-canary -- --apply --confirm=tenant-canary-lead
 *
 * Dry-run by default. Never touches Houzzat leads or the public leads API.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildLeadCanaryPlan,
  captureHouzzatBaseline,
  executeLeadCanaryApply,
  formatLeadCanaryReport,
  parseLeadCanaryCliArgs,
  requireLeadEmailForApply,
  requireScopeAckForApply,
  resolveLeadCanaryInputFromEnv,
  resolveTrustedCanaryBContext,
  validateLeadCanaryApplyConfirmation,
} from "./lib/tenant-lead-canary";
import { verifyScopeGates } from "./lib/tenant-canary-provision";

async function main() {
  const { apply, confirm } = parseLeadCanaryCliArgs(process.argv.slice(2));
  const confirmError = validateLeadCanaryApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[workspace-lead-canary] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  const input = resolveLeadCanaryInputFromEnv();

  if (!process.env.DATABASE_URL) {
    console.log(
      [
        "LEAD B CANARY PLAN",
        "",
        "DATABASE_URL: not set",
        "",
        "DRY RUN — NO PRODUCTION MUTATIONS",
      ].join("\n"),
    );
    if (apply) {
      console.error("[workspace-lead-canary] REFUSE --apply without DATABASE_URL");
      process.exit(2);
    }
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildLeadCanaryPlan(prisma, input);
    console.log(formatLeadCanaryReport(plan, apply ? "apply-preview" : "dry-run"));

    if (!apply) {
      process.exit(0);
    }

    const ackError = requireScopeAckForApply();
    if (ackError) {
      console.error(`[workspace-lead-canary] REFUSE --apply: ${ackError}`);
      process.exit(2);
    }

    const scopeGates = verifyScopeGates();
    if (!scopeGates.ok) {
      console.error("[workspace-lead-canary] REFUSE --apply: scope gates not satisfied");
      process.exit(2);
    }

    const emailError = requireLeadEmailForApply(input);
    if (emailError) {
      console.error(`[workspace-lead-canary] REFUSE --apply: ${emailError}`);
      process.exit(2);
    }

    if (plan.driftStops.length > 0) {
      console.error(
        `[workspace-lead-canary] REFUSE --apply: ${plan.driftStops.length} DRIFT_STOP`,
      );
      for (const stop of plan.driftStops) {
        console.error(`  - ${stop.object}: ${stop.detail}`);
      }
      process.exit(2);
    }

    if (!plan.houzzatBaseline || !plan.context) {
      console.error("[workspace-lead-canary] REFUSE --apply: missing baseline/context");
      process.exit(2);
    }

    const context = await resolveTrustedCanaryBContext(prisma);
    const applied = await executeLeadCanaryApply(
      prisma,
      input,
      context,
      plan.houzzatBaseline,
    );
    console.log("");
    console.log("APPLY COMPLETE — LEAD B CANARY MUTATIONS APPLIED (no push/email/task)");
    console.log(JSON.stringify({ ok: true, appliedSteps: applied.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
