/**
 * Stage 3J.11 — Tenant B Lead_B push canary (dry-run default).
 *
 *   CANARY_LEAD_B_EMAIL=lead-canary-b@houzzat-canary.invalid \
 *     pnpm workspace:push-canary
 *
 *   CANARY_ACK_PRODUCTION_SCOPES=1 \
 *   CANARY_LEAD_B_EMAIL=lead-canary-b@houzzat-canary.invalid \
 *     pnpm workspace:push-canary -- \
 *     --apply --confirm=tenant-canary-push
 *
 * PUSH ONLY — never sends staff email.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildPushCanaryPlan,
  executePushCanaryApply,
  formatPushCanaryReport,
  parsePushCanaryCliArgs,
  requireLeadEmailForApply,
  requireScopeAckForApply,
  resolveLeadCanaryInputFromEnv,
  validatePushCanaryApplyConfirmation,
} from "./lib/tenant-push-canary";
import { resolveTrustedCanaryBContext } from "./lib/tenant-lead-canary";
import { verifyScopeGates } from "./lib/tenant-canary-provision";

async function main() {
  const { apply, confirm } = parsePushCanaryCliArgs(process.argv.slice(2));
  const confirmError = validatePushCanaryApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[workspace-push-canary] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  const input = resolveLeadCanaryInputFromEnv();

  if (!process.env.DATABASE_URL) {
    console.log("TENANT B PUSH CANARY PLAN\n\nDRY RUN — NO PUSH SENT");
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildPushCanaryPlan(prisma, input);
    console.log(formatPushCanaryReport(plan, apply ? "apply-preview" : "dry-run"));

    if (!apply) process.exit(0);

    const ackError = requireScopeAckForApply();
    if (ackError || !verifyScopeGates().ok) {
      console.error("[workspace-push-canary] REFUSE --apply: scope gates");
      process.exit(2);
    }
    const emailError = requireLeadEmailForApply(input);
    if (emailError) {
      console.error(`[workspace-push-canary] REFUSE: ${emailError}`);
      process.exit(2);
    }
    if (plan.driftStops.length > 0) {
      console.error("[workspace-push-canary] REFUSE --apply: DRIFT_STOP");
      process.exit(2);
    }
    if (plan.alreadySent) {
      console.log("");
      console.log("APPLY COMPLETE — ALREADY SENT (idempotent no-op)");
      console.log(JSON.stringify({ ok: true, appliedSteps: 0, alreadySent: true }, null, 2));
      process.exit(0);
    }

    const context = await resolveTrustedCanaryBContext(prisma);
    const applied = await executePushCanaryApply(prisma, context, input);
    console.log("");
    console.log("APPLY COMPLETE — TENANT B PUSH CANARY SENT");
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
