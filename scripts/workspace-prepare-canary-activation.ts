/**
 * Stage 3J.9.1 — prepare / rotate canary password activation invite (dry-run default).
 *
 *   pnpm workspace:prepare-canary-activation -- --user=agent --rotate
 *
 *   CANARY_ACK_PRODUCTION_SCOPES=1 \
 *   CANARY_SITE_URL=https://houzzat.com \
 *     pnpm workspace:prepare-canary-activation -- \
 *     --apply --confirm=tenant-canary-activation --user=agent --rotate
 *
 * Apply may cancel exposed PENDING invite(s) and create ONE fresh WorkspaceInvite.
 * No email. Raw activation URL printed once to stdout — DO NOT paste into chat/logs.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildActivationCanaryPlan,
  executeActivationCanaryApply,
  formatActivationCanaryReport,
  parseActivationCanaryCliArgs,
  requireScopeAckForApply,
  validateActivationCanaryApplyConfirmation,
  validateActivationUserTarget,
  type ActivationUserTarget,
} from "./lib/tenant-activation-canary";
import { resolveActivationCanaryContext } from "./lib/tenant-lead-canary";
import { verifyScopeGates } from "./lib/tenant-canary-provision";

async function main() {
  const { apply, rotate, confirm, userRaw, userTarget } =
    parseActivationCanaryCliArgs(process.argv.slice(2));

  const userError = validateActivationUserTarget({ apply, userRaw, userTarget });
  if (userError) {
    console.error(`[workspace-prepare-canary-activation] REFUSE: ${userError}`);
    process.exit(2);
  }

  const confirmError = validateActivationCanaryApplyConfirmation({
    apply,
    confirm,
  });
  if (confirmError) {
    console.error(`[workspace-prepare-canary-activation] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  const resolvedTarget: ActivationUserTarget = userTarget ?? "agent";

  if (!process.env.DATABASE_URL) {
    console.log("CANARY ACTIVATION PLAN\n\nDRY RUN — NO PRODUCTION MUTATIONS");
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildActivationCanaryPlan(prisma, resolvedTarget, {
      rotate,
    });
    console.log(
      formatActivationCanaryReport(plan, apply ? "apply-preview" : "dry-run"),
    );

    if (!apply) process.exit(0);

    const ackError = requireScopeAckForApply();
    if (ackError || !verifyScopeGates().ok) {
      console.error(
        "[workspace-prepare-canary-activation] REFUSE --apply: scope gates",
      );
      process.exit(2);
    }
    if (plan.driftStops.length > 0 || plan.baseUrlError) {
      console.error(
        "[workspace-prepare-canary-activation] REFUSE --apply: DRIFT_STOP / URL",
      );
      process.exit(2);
    }

    const context = await resolveActivationCanaryContext(
      prisma,
      resolvedTarget,
    );
    const { applied, rawTokens } = await executeActivationCanaryApply(
      prisma,
      context,
      resolvedTarget,
      { rotate },
    );

    console.log("");
    console.log(
      rotate
        ? "APPLY COMPLETE — ACTIVATION INVITE ROTATED"
        : "APPLY COMPLETE — ACTIVATION INVITE PREPARED",
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          appliedSteps: applied.length,
          target: resolvedTarget,
          rotate,
          inviteCount: rawTokens.length,
        },
        null,
        2,
      ),
    );

    if (rawTokens.length > 0) {
      console.log("");
      console.log(
        "WARNING: DO NOT paste this URL/token into chat, tickets, or logs.",
      );
      console.log(
        "ONE-TIME ACTIVATION URL (copy now — not stored in plaintext):",
      );
      for (const row of rawTokens) {
        console.log(`${row.label}: ${row.activationUrl}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
