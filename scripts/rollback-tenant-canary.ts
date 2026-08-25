/**
 * Stage 3J-REV — rollback Workspace #2 (tenant-canary) PRE-FLIGHT stub.
 *
 * Dry-run by default. Never touches Houzzat (slug=houzzat) or CrmRoutingSettings id=default.
 * Exact workspace/resource IDs only — no prefix/email/createdAt deletion.
 *
 * Run: pnpm workspace:rollback-canary
 * Apply (blocked in pre-flight): pnpm workspace:rollback-canary -- --apply
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const CANARY_SLUG = "tenant-canary";
const HOUZZAT_SLUG = "houzzat";
const HOUZZAT_ROUTING_ID = "default";
const CANARY_ROUTING_ID = "tenant-canary-routing";

function parseArgs(argv: string[]) {
  return { apply: argv.includes("--apply") };
}

function cleanupOrder() {
  return [
    {
      order: 1,
      object: "Lead_B children (AgentTask / LeadNote / LeadEmailLog / LeadActivity)",
      guard: "parent Lead.workspaceId === B OR child.workspaceId === B (exact B id)",
    },
    {
      order: 2,
      object: "Lead_B",
      guard: "Lead.workspaceId === B AND notes contains [CANARY] (defense)",
    },
    {
      order: 3,
      object: "CrmRoutingWeight",
      guard: "settingsId === tenant-canary-routing",
    },
    {
      order: 4,
      object: "CrmRoutingSettings",
      guard: "id === tenant-canary-routing (NOT id=default)",
    },
    {
      order: 5,
      object: "WorkspaceInvite",
      guard: "workspaceId === B",
    },
    {
      order: 6,
      object: "WorkspaceMember",
      guard: "workspaceId === B",
    },
    {
      order: 7,
      object: "Workspace",
      guard: "slug === tenant-canary (exact)",
    },
    {
      order: 8,
      object: "Organization bridge",
      guard: "N/A — none created",
    },
    {
      order: 9,
      object: "Canary Users",
      guard: "optional disable only if zero other WorkspaceMembers and no non-canary CRM refs",
    },
  ];
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        targetSlug: CANARY_SLUG,
        neverTouch: {
          workspaceSlug: HOUZZAT_SLUG,
          routingSettingsId: HOUZZAT_ROUTING_ID,
        },
        canaryRoutingSettingsId: CANARY_ROUTING_ID,
        cleanupOrder: cleanupOrder(),
      },
      null,
      2,
    ),
  );

  if (CANARY_SLUG === HOUZZAT_SLUG) {
    console.error("[rollback-tenant-canary] REFUSE: canary slug collides with Houzzat");
    process.exit(2);
  }

  if (CANARY_ROUTING_ID === HOUZZAT_ROUTING_ID) {
    console.error("[rollback-tenant-canary] REFUSE: canary routing id collides with default");
    process.exit(2);
  }

  if (!apply) {
    console.log(
      "[rollback-tenant-canary] dry-run ok — no rows deleted. Pass --apply only after Workspace B exists and blockers are clear.",
    );
    process.exit(0);
  }

  console.error(
    "[rollback-tenant-canary] REFUSE --apply: apply path not enabled (Workspace B not provisioned / pre-flight stub).",
  );
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
