/**
 * Stage 3K.2 — prepare Houzzat domain/branding foundation (dry-run default).
 *
 *   pnpm workspace:tenant-branding-foundation
 *
 * Apply (review dry-run first):
 *   CANARY_ACK_PRODUCTION_SCOPES=1 \
 *     pnpm workspace:tenant-branding-foundation -- \
 *     --apply --confirm=tenant-branding-foundation
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildTenantBrandingFoundationPlan,
  executeTenantBrandingFoundationApply,
  formatTenantBrandingFoundationReport,
  parseTenantBrandingFoundationArgs,
  validateTenantBrandingFoundationConfirmation,
} from "./lib/tenant-branding-foundation";

async function main() {
  const { apply, confirm } = parseTenantBrandingFoundationArgs(
    process.argv.slice(2),
  );

  const confirmError = validateTenantBrandingFoundationConfirmation({
    apply,
    confirm,
  });
  if (confirmError) {
    console.error(`[tenant-branding-foundation] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.log("TENANT BRANDING FOUNDATION PLAN\n\nDRY RUN — NO PRODUCTION MUTATIONS");
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const plan = await buildTenantBrandingFoundationPlan(prisma);
    console.log(
      formatTenantBrandingFoundationReport(
        plan,
        apply ? "apply-preview" : "dry-run",
      ),
    );

    if (!apply) process.exit(0);

    if (plan.driftStops.length > 0 || !plan.workspaceId) {
      console.error("[tenant-branding-foundation] REFUSE --apply: DRIFT_STOP");
      process.exit(2);
    }

    const applied = await executeTenantBrandingFoundationApply(
      prisma,
      plan.workspaceId,
    );
    console.log("");
    console.log("APPLY COMPLETE");
    console.log(JSON.stringify({ applied }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
