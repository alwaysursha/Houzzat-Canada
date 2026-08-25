/**
 * Stage 3H.1 — explicit Houzzat routing workspaceId backfill (NOT runtime).
 *
 *   pnpm workspace-routing:backfill-houzzat           # dry-run
 *   pnpm workspace-routing:backfill-houzzat -- --apply
 *
 * Updates ONLY CrmRoutingSettings.workspaceId on id=default.
 * Never mutates listingAgentId, weights, sellerAssignMode, or id.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { CRM_ROUTING_SETTINGS_ID } from "../src/lib/agent/routing-types";
import { HOUZZAT_WORKSPACE_SLUG } from "../src/lib/crm-ownership";

const APPLY = process.argv.includes("--apply");

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true, slug: true, status: true, name: true },
    });
    if (!workspace) {
      console.error(`STOP: Workspace slug "${HOUZZAT_WORKSPACE_SLUG}" not found`);
      process.exit(1);
    }
    if (workspace.status !== "ACTIVE") {
      console.error(
        `STOP: Workspace "${HOUZZAT_WORKSPACE_SLUG}" status=${workspace.status} (must be ACTIVE)`,
      );
      process.exit(1);
    }

    const settings = await prisma.crmRoutingSettings.findUnique({
      where: { id: CRM_ROUTING_SETTINGS_ID },
      include: {
        weights: {
          select: {
            id: true,
            agentId: true,
            lane: true,
            percent: true,
            assignedCount: true,
          },
        },
      },
    });

    if (!settings) {
      console.error(
        `STOP: CrmRoutingSettings id="${CRM_ROUTING_SETTINGS_ID}" not found`,
      );
      process.exit(1);
    }

    const snapshot = {
      settingsId: settings.id,
      listingAgentId: settings.listingAgentId,
      sellerAssignMode: settings.sellerAssignMode,
      workspaceId: settings.workspaceId,
      weightCount: settings.weights.length,
      weights: settings.weights.map((w) => ({
        lane: w.lane,
        agentIdPrefix: w.agentId.slice(0, 8),
        percent: w.percent,
        assignedCount: w.assignedCount,
      })),
      houzzatWorkspaceId: workspace.id,
      houzzatStatus: workspace.status,
    };

    if (settings.workspaceId === workspace.id) {
      console.log(
        JSON.stringify(
          {
            mode: APPLY ? "apply" : "dry-run",
            status: "NO ACTION REQUIRED",
            reason: "workspaceId already points to houzzat",
            snapshot,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (settings.workspaceId && settings.workspaceId !== workspace.id) {
      console.error("STOP: workspaceId points to another Workspace", {
        currentWorkspaceIdPrefix: settings.workspaceId.slice(0, 8),
        houzzatWorkspaceIdPrefix: workspace.id.slice(0, 8),
      });
      process.exit(1);
    }

    console.log(
      JSON.stringify(
        {
          mode: APPLY ? "apply" : "dry-run",
          action: "SET CrmRoutingSettings.workspaceId = houzzat",
          preserve: [
            "id",
            "listingAgentId",
            "sellerAssignMode",
            "weights",
            "assignedCount",
          ],
          snapshot,
        },
        null,
        2,
      ),
    );

    if (!APPLY) {
      console.log("DRY RUN — re-run with --apply to write workspaceId");
      return;
    }

    const updated = await prisma.crmRoutingSettings.update({
      where: { id: CRM_ROUTING_SETTINGS_ID },
      data: { workspaceId: workspace.id },
      select: {
        id: true,
        workspaceId: true,
        listingAgentId: true,
        sellerAssignMode: true,
        updatedAt: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          status: "APPLIED",
          after: {
            id: updated.id,
            workspaceId: updated.workspaceId,
            listingAgentId: updated.listingAgentId,
            sellerAssignMode: updated.sellerAssignMode,
            updatedAt: updated.updatedAt.toISOString(),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
