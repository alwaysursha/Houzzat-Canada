/**
 * Stage 3J.8 — prepare canary password activation invites (dry-run default).
 *
 *   pnpm workspace:prepare-canary-activation
 *   pnpm workspace:prepare-canary-activation -- --apply --confirm=tenant-canary-activation
 *
 * Apply creates PENDING WorkspaceInvite rows only — no email, no password set.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildActivationCanaryPlan,
  formatActivationCanaryReport,
  parseActivationCanaryCliArgs,
  validateActivationCanaryApplyConfirmation,
} from "./lib/tenant-activation-canary";

async function main() {
  const { apply, confirm } = parseActivationCanaryCliArgs(process.argv.slice(2));
  const confirmError = validateActivationCanaryApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[workspace-prepare-canary-activation] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.log("CANARY ACTIVATION PLAN\n\nDRY RUN — NO PRODUCTION MUTATIONS");
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildActivationCanaryPlan(prisma);
    console.log(formatActivationCanaryReport(plan, apply ? "apply-preview" : "dry-run"));

    if (!apply) process.exit(0);

    console.error(
      "[workspace-prepare-canary-activation] REFUSE --apply: Stage 3J.8 is dry-run only — activation invite apply not authorized",
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
