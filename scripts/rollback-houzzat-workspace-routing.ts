/**
 * Stage 3H.1 — rollback Houzzat routing workspaceId (clear only, safe guards).
 *
 *   pnpm workspace-routing:rollback-houzzat           # dry-run
 *   pnpm workspace-routing:rollback-houzzat -- --apply
 *
 * Clears CrmRoutingSettings.workspaceId ONLY when:
 * - id = default
 * - workspaceId = Houzzat Workspace
 * - listingAgentId / weight shape still present (no empty drift)
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
      select: { id: true, status: true },
    });
    if (!workspace) {
      console.error(`STOP: Workspace slug "${HOUZZAT_WORKSPACE_SLUG}" not found`);
      process.exit(1);
    }

    const settings = await prisma.crmRoutingSettings.findUnique({
      where: { id: CRM_ROUTING_SETTINGS_ID },
      include: {
        weights: { select: { id: true, lane: true, percent: true } },
      },
    });

    if (!settings) {
      console.error(
        `STOP: CrmRoutingSettings id="${CRM_ROUTING_SETTINGS_ID}" not found`,
      );
      process.exit(1);
    }

    if (settings.id !== CRM_ROUTING_SETTINGS_ID) {
      console.error("STOP: unexpected settings id");
      process.exit(1);
    }

    if (!settings.workspaceId) {
      console.log(
        JSON.stringify({
          mode: APPLY ? "apply" : "dry-run",
          status: "NO ACTION REQUIRED",
          reason: "workspaceId already null",
        }),
      );
      return;
    }

    if (settings.workspaceId !== workspace.id) {
      console.error("STOP: workspaceId is not Houzzat — refusing rollback", {
        currentPrefix: settings.workspaceId.slice(0, 8),
        houzzatPrefix: workspace.id.slice(0, 8),
      });
      process.exit(1);
    }

    if (settings.weights.length === 0) {
      console.error(
        "STOP: routing weights empty — configuration drift, refuse rollback",
      );
      process.exit(1);
    }

    const snapshot = {
      id: settings.id,
      workspaceId: settings.workspaceId,
      listingAgentId: settings.listingAgentId,
      sellerAssignMode: settings.sellerAssignMode,
      weightCount: settings.weights.length,
    };

    console.log(
      JSON.stringify(
        {
          mode: APPLY ? "apply" : "dry-run",
          action: "CLEAR CrmRoutingSettings.workspaceId",
          preserve: ["id", "listingAgentId", "sellerAssignMode", "weights"],
          snapshot,
        },
        null,
        2,
      ),
    );

    if (!APPLY) {
      console.log("DRY RUN — re-run with --apply to clear workspaceId");
      return;
    }

    const updated = await prisma.crmRoutingSettings.update({
      where: { id: CRM_ROUTING_SETTINGS_ID },
      data: { workspaceId: null },
      select: {
        id: true,
        workspaceId: true,
        listingAgentId: true,
        sellerAssignMode: true,
      },
    });

    console.log(
      JSON.stringify({ status: "APPLIED", after: updated }, null, 2),
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
