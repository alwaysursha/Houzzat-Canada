/**
 * Stage 3J.2 — guarded Workspace #2 (tenant-canary) provisioner.
 *
 *   pnpm workspace:provision-canary
 *   pnpm workspace:provision-canary -- --apply --confirm=tenant-canary
 *
 * Dry-run by default. Never touches Houzzat or id=default routing.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildProvisionPlan,
  captureHouzzatBaseline,
  executeProvisionApply,
  formatProvisionReport,
  parseCanaryCliArgs,
  requireCanaryEmailsForApply,
  resolveCanaryIdentityFromEnv,
  validateApplyConfirmation,
  verifyScopeGates,
} from "./lib/tenant-canary-provision";

async function main() {
  const { apply, confirm } = parseCanaryCliArgs(process.argv.slice(2));
  const confirmError = validateApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[provision-tenant-canary] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  const identity = resolveCanaryIdentityFromEnv();

  if (!process.env.DATABASE_URL) {
    console.log(
      [
        "CANARY PROVISION PLAN",
        "",
        "DATABASE_URL: not set — read-only inspection skipped",
        "",
        `Workspace: CREATE slug=tenant-canary`,
        `OWNER_B: ${identity.ownerEmail ? "inspect/create" : "USER INPUT REQUIRED (CANARY_OWNER_B_EMAIL)"}`,
        `AGENT_B: ${identity.agentEmail ? "inspect/create" : "USER INPUT REQUIRED (CANARY_AGENT_B_EMAIL)"}`,
        "",
        "Houzzat baseline: UNCHANGED EXPECTED (not captured)",
        "",
        "Mutation count if --apply: unknown",
        "",
        "DRY RUN — NO PRODUCTION MUTATIONS",
      ].join("\n"),
    );
    if (apply) {
      console.error("[provision-tenant-canary] REFUSE --apply without DATABASE_URL");
      process.exit(2);
    }
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildProvisionPlan(prisma, identity);
    console.log(formatProvisionReport(plan, apply ? "apply-preview" : "dry-run"));

    if (!apply) {
      process.exit(0);
    }

    const scopeGates = verifyScopeGates();
    if (!scopeGates.ok) {
      console.error(
        "[provision-tenant-canary] REFUSE --apply: scope gates not satisfied",
      );
      console.error(scopeGates.failures.join("; "));
      process.exit(2);
    }

    const emailError = requireCanaryEmailsForApply(identity);
    if (emailError) {
      console.error(`[provision-tenant-canary] REFUSE --apply: ${emailError}`);
      process.exit(2);
    }

    if (plan.driftStops.length > 0) {
      console.error(
        `[provision-tenant-canary] REFUSE --apply: ${plan.driftStops.length} DRIFT_STOP`,
      );
      for (const stop of plan.driftStops) {
        console.error(`  - ${stop.object}: ${stop.detail}`);
      }
      process.exit(2);
    }

    if (!plan.houzzatBaseline) {
      console.error(
        "[provision-tenant-canary] REFUSE --apply: Houzzat baseline not captured",
      );
      process.exit(2);
    }

    const applied = await executeProvisionApply(
      prisma,
      identity,
      plan.houzzatBaseline,
    );
    const baselineAfter = await captureHouzzatBaseline(prisma);
    console.log("");
    console.log("APPLY COMPLETE — PRODUCTION MUTATIONS APPLIED");
    console.log(
      JSON.stringify(
        {
          ok: true,
          appliedSteps: applied.length,
          houzzatBaselineUnchanged:
            baselineAfter.memberCount === plan.houzzatBaseline.memberCount &&
            baselineAfter.crm.leadCount === plan.houzzatBaseline.crm.leadCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
