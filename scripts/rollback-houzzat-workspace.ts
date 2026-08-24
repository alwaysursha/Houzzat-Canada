/**
 * Stage 2B — rollback Houzzat Workspace #1 (metadata only).
 *
 *   pnpm workspace:rollback-houzzat           # dry-run (default)
 *   pnpm workspace:rollback-houzzat -- --apply
 *
 * DO NOT run unless provisioning must be reversed.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildPlannedProvisioning,
  gatherPreconditions,
  HOUZZAT_WORKSPACE_SLUG,
  loadExistingProvisioning,
  resolveHouzzatStaffIds,
} from "./lib/houzzat-workspace-provisioning";

const APPLY = process.argv.includes("--apply");

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  try {
    const staff = await resolveHouzzatStaffIds(prisma);
    const planned = buildPlannedProvisioning(staff);
    const existing = await loadExistingProvisioning(prisma, planned);

    if (existing.kind === "absent") {
      console.log("NO ACTION REQUIRED — Houzzat Workspace not provisioned");
      return;
    }

    if (existing.kind === "drift") {
      console.error(`DRIFT: ${existing.reason}`);
      console.error("Manual review required before rollback");
      process.exit(1);
    }

    const workspaceId = existing.workspaceId;
    const memberCount = await prisma.workspaceMember.count({
      where: { workspaceId },
    });

    const report = {
      mode: APPLY ? "apply" : "dry-run",
      workspace: {
        idPrefix: workspaceId.slice(0, 8),
        slug: HOUZZAT_WORKSPACE_SLUG,
        memberCount,
      },
      actions: [
        `DELETE WorkspaceMember rows for workspace ${workspaceId.slice(0, 8)}…`,
        `DELETE Workspace row slug=${HOUZZAT_WORKSPACE_SLUG}`,
      ],
    };

    if (!APPLY) {
      console.log(JSON.stringify(report, null, 2));
      console.log("DRY RUN — re-run with --apply to rollback");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspaceMember.deleteMany({ where: { workspaceId } });
      await tx.workspace.delete({ where: { id: workspaceId } });
    });

    console.log(JSON.stringify({ ...report, mode: "apply" }, null, 2));
    console.log("ROLLED BACK — Houzzat Workspace #1 removed");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "workspace rollback failed",
  );
  process.exit(1);
});
