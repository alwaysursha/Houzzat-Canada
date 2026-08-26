/**
 * Stage 3K.4 — Tenant B domain + branding canary (dry-run default).
 *
 *   pnpm workspace:tenant-b-domain-branding-canary
 *
 * Apply (after dry-run review + user approval):
 *   CANARY_ACK_PRODUCTION_SCOPES=1 \
 *     pnpm workspace:tenant-b-domain-branding-canary -- \
 *     --apply --confirm=tenant-b-domain-branding-canary
 *
 * Rollback (Tenant B canary rows only):
 *   CANARY_ACK_PRODUCTION_SCOPES=1 \
 *     pnpm workspace:tenant-b-domain-branding-canary -- \
 *     --apply --rollback --confirm=tenant-b-domain-branding-canary-rollback
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildTenantBDomainBrandingPlan,
  buildTenantBDomainBrandingRollbackPlan,
  executeTenantBDomainBrandingApply,
  executeTenantBDomainBrandingRollback,
  formatTenantBDomainBrandingReport,
  parseTenantBDomainBrandingArgs,
  validateTenantBDomainBrandingConfirmation,
  verifyTenantScopeGatesLegacy,
} from "./lib/tenant-b-domain-branding-canary";

async function main() {
  const { apply, rollback, confirm } = parseTenantBDomainBrandingArgs(
    process.argv.slice(2),
  );

  const confirmError = validateTenantBDomainBrandingConfirmation({
    apply,
    rollback,
    confirm,
  });
  if (confirmError) {
    console.error(`[tenant-b-domain-branding-canary] REFUSE: ${confirmError}`);
    process.exit(2);
  }

  if (rollback && !apply) {
    if (!process.env.DATABASE_URL) {
      console.error("[tenant-b-domain-branding-canary] DATABASE_URL required for rollback dry-run");
      process.exit(2);
    }
    const { prisma } = await import("../src/lib/prisma");
    try {
      const plan = await buildTenantBDomainBrandingRollbackPlan(prisma);
      console.log(
        formatTenantBDomainBrandingReport(
          plan,
          verifyTenantScopeGatesLegacy(),
          "rollback-preview",
        ),
      );
    } finally {
      await prisma.$disconnect();
    }
    process.exit(0);
  }

  const scopeGates = verifyTenantScopeGatesLegacy();

  if (!process.env.DATABASE_URL) {
    console.log(
      formatTenantBDomainBrandingReport(
        {
          steps: [
            {
              object: "Database",
              action: "SKIP",
              detail: "DATABASE_URL not set — fixture/structural checks only",
            },
          ],
          driftStops: [],
          mutationCount: 0,
          workspaceId: null,
          workspaceSlug: "tenant-canary",
          primaryHostname: "tenant-canary.houzzatpro.com",
          legacyInterimHostname: "canary.houzzat.com",
          houzzatProtected: [],
        },
        scopeGates,
        rollback ? "rollback-preview" : "dry-run",
      ),
    );
    if (apply) process.exit(2);
    process.exit(0);
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    if (rollback) {
      const plan = await buildTenantBDomainBrandingRollbackPlan(prisma);
      console.log(
        formatTenantBDomainBrandingReport(
          plan,
          scopeGates,
          apply ? "rollback-preview" : "dry-run",
        ),
      );

      if (!apply) process.exit(0);

      if (plan.driftStops.length > 0 || !plan.workspaceId) {
        console.error(
          "[tenant-b-domain-branding-canary] REFUSE rollback: DRIFT_STOP",
        );
        process.exit(2);
      }

      if (!scopeGates.ok) {
        console.error(
          "[tenant-b-domain-branding-canary] REFUSE rollback: tenant scope gates",
        );
        if (scopeGates.missingAck) {
          console.error("Set CANARY_ACK_PRODUCTION_SCOPES=1 to override");
        }
        process.exit(2);
      }

      const rolledBack = await executeTenantBDomainBrandingRollback(
        prisma,
        plan.workspaceId,
      );
      console.log("");
      console.log("ROLLBACK COMPLETE");
      console.log(JSON.stringify({ rolledBack }, null, 2));
      process.exit(0);
    }

    const plan = await buildTenantBDomainBrandingPlan(prisma);
    console.log(
      formatTenantBDomainBrandingReport(
        plan,
        scopeGates,
        apply ? "apply-preview" : "dry-run",
      ),
    );

    if (!apply) process.exit(0);

    if (plan.driftStops.length > 0 || !plan.workspaceId) {
      console.error(
        "[tenant-b-domain-branding-canary] REFUSE --apply: DRIFT_STOP",
      );
      process.exit(2);
    }

    if (!scopeGates.ok) {
      console.error(
        "[tenant-b-domain-branding-canary] REFUSE --apply: tenant scope gates",
      );
      if (scopeGates.missingAck) {
        console.error("Set CANARY_ACK_PRODUCTION_SCOPES=1 to override");
      }
      process.exit(2);
    }

    const applied = await executeTenantBDomainBrandingApply(
      prisma,
      plan.workspaceId,
    );
    console.log("");
    console.log("APPLY COMPLETE — TENANT B CANARY DOMAIN + BRANDING ONLY");
    console.log(JSON.stringify({ applied }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
