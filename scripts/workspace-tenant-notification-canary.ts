/**
 * Stage 3J.6 — Lead_B notification canary (dry-run default).
 *
 *   pnpm workspace:notification-canary
 *   pnpm workspace:notification-canary -- --apply --confirm=tenant-canary-notification
 *
 * Email send remains disabled even on --apply until separately approved.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildNotificationCanaryPlan,
  formatNotificationCanaryReport,
  parseNotificationCanaryCliArgs,
  resolveLeadCanaryInputFromEnv,
  validateNotificationCanaryApplyConfirmation,
} from "./lib/tenant-notification-canary";

async function main() {
  const { apply, confirm } = parseNotificationCanaryCliArgs(process.argv.slice(2));
  const confirmError = validateNotificationCanaryApplyConfirmation({ apply, confirm });
  if (confirmError) {
    console.error(`[workspace-notification-canary] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  const input = resolveLeadCanaryInputFromEnv();
  if (!process.env.DATABASE_URL) {
    console.log("NOTIFICATION B CANARY PLAN\n\nDRY RUN — NO PRODUCTION MUTATIONS");
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildNotificationCanaryPlan(prisma, input);
    console.log(formatNotificationCanaryReport(plan, apply ? "apply-preview" : "dry-run"));

    if (!apply) process.exit(0);

    console.error(
      "[workspace-notification-canary] REFUSE --apply: push/email send not authorized in Stage 3J.6 — dry-run only",
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
