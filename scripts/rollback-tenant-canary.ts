/**
 * Stage 3J — rollback Workspace #2 (tenant-canary) PRE-FLIGHT stub.
 *
 * Dry-run by default. Never touches Houzzat (slug=houzzat) or CrmRoutingSettings id=default.
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

function parseArgs(argv: string[]) {
  return { apply: argv.includes("--apply") };
}

function cleanupOrder() {
  return [
    "1. Lead_B children (tasks/notes/emailLogs/activities) where workspaceId=B",
    "2. Lead_B",
    "3. CrmRoutingWeight rows for settings id=canary-tenant-routing",
    "4. CrmRoutingSettings id=canary-tenant-routing (NOT id=default)",
    "5. WorkspaceInvite where workspaceId=B",
    "6. WorkspaceMember where workspaceId=B",
    "7. Workspace slug=tenant-canary",
    "8. Organization bridge — N/A (none created)",
    "9. Canary Users — optional disable only if unused elsewhere",
  ];
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        targetSlug: CANARY_SLUG,
        neverTouch: { workspaceSlug: HOUZZAT_SLUG, routingSettingsId: HOUZZAT_ROUTING_ID },
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

  if (!apply) {
    console.log(
      "[rollback-tenant-canary] dry-run ok — no rows deleted. Pass --apply only after Workspace B exists.",
    );
    process.exit(0);
  }

  console.error(
    "[rollback-tenant-canary] REFUSE --apply: apply path not enabled in this pre-flight stub.",
  );
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
