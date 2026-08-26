/**
 * Stage 3K.4.4 — align Houzzat poweredByHouzzatPro DB column (dry-run default).
 *
 *   pnpm workspace:houzzat-powered-by-alignment
 *
 * Apply (after dry-run review):
 *   CANARY_ACK_PRODUCTION_SCOPES=1 \
 *     pnpm workspace:houzzat-powered-by-alignment -- \
 *     --apply --confirm=houzzat-powered-by-alignment
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildHouzzatPoweredByAlignmentPlan,
  executeHouzzatPoweredByAlignmentApply,
  formatHouzzatPoweredByAlignmentReport,
  parseHouzzatPoweredByAlignmentArgs,
  validateHouzzatPoweredByAlignmentConfirmation,
} from "./lib/houzzat-powered-by-alignment";

async function main() {
  const { apply, confirm } = parseHouzzatPoweredByAlignmentArgs(
    process.argv.slice(2),
  );

  const confirmError = validateHouzzatPoweredByAlignmentConfirmation({
    apply,
    confirm,
  });
  if (confirmError) {
    console.error(`[houzzat-powered-by-alignment] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.log(
      "HOUZZAT POWERED-BY ALIGNMENT PLAN\n\nDRY RUN — NO PRODUCTION MUTATIONS",
    );
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildHouzzatPoweredByAlignmentPlan(prisma);
    console.log(
      formatHouzzatPoweredByAlignmentReport(
        plan,
        apply ? "apply-preview" : "dry-run",
      ),
    );

    if (!apply) {
      process.exit(plan.action === "DRIFT_STOP" ? 2 : 0);
    }

    if (plan.action !== "UPDATE_REQUIRED" || !plan.workspaceId) {
      console.error(
        `[houzzat-powered-by-alignment] REFUSE --apply: action=${plan.action}`,
      );
      process.exit(2);
    }

    const result = await executeHouzzatPoweredByAlignmentApply(
      prisma,
      plan.workspaceId,
    );
    console.log("");
    console.log("APPLY COMPLETE");
    console.log(JSON.stringify({ result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
