/**
 * Stage 2B — provision Houzzat Workspace #1 (data only).
 *
 *   pnpm workspace:provision-houzzat           # dry-run (default)
 *   pnpm workspace:provision-houzzat -- --apply
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildPlannedProvisioning,
  gatherPreconditions,
  HOUZZAT_WORKSPACE_SLUG,
  loadExistingProvisioning,
  provisionHouzzatWorkspace,
  sanitizeProvisioningReport,
  validateFirstProvisionPreconditions,
} from "./lib/houzzat-workspace-provisioning";

const APPLY = process.argv.includes("--apply");

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  try {
    const snapshot = await gatherPreconditions(prisma);
    const planned = buildPlannedProvisioning(snapshot.staff);
    const existing = await loadExistingProvisioning(prisma, planned);

    if (existing.kind === "complete") {
      console.log(
        JSON.stringify(
          sanitizeProvisioningReport({
            planned,
            workspaceId: existing.workspaceId,
            mode: "already-provisioned",
          }),
          null,
          2,
        ),
      );
      console.log("NO ACTION REQUIRED — Houzzat Workspace already provisioned");
      return;
    }

    if (existing.kind === "drift") {
      console.error(`DRIFT: ${existing.reason}`);
      process.exit(1);
    }

    const slugTaken = await prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true },
    });
    if (slugTaken) {
      console.error(
        `DRIFT: Workspace slug "${HOUZZAT_WORKSPACE_SLUG}" exists but failed completeness checks`,
      );
      process.exit(1);
    }

    const failures = validateFirstProvisionPreconditions(snapshot);
    if (failures.length > 0) {
      console.error("PRECONDITION FAILURES:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exit(1);
    }

    if (!APPLY) {
      console.log(
        JSON.stringify(
          sanitizeProvisioningReport({ planned, mode: "dry-run" }),
          null,
          2,
        ),
      );
      console.log("DRY RUN — re-run with --apply to provision");
      return;
    }

    const { workspaceId } = await provisionHouzzatWorkspace(prisma, planned);
    console.log(
      JSON.stringify(
        sanitizeProvisioningReport({
          planned,
          workspaceId,
          mode: "apply",
        }),
        null,
        2,
      ),
    );
    console.log("APPLIED — Houzzat Workspace #1 provisioned");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "workspace provisioning failed",
  );
  process.exit(1);
});
