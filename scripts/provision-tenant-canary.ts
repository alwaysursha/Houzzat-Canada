/**
 * Stage 3J-REV — provision Workspace #2 (tenant-canary) PRE-FLIGHT stub.
 *
 * Dry-run by default. Planning unlocked under READ=workspace.
 * --apply remains REFUSED until user explicitly enables provisioning implementation.
 *
 * Run: pnpm workspace:provision-canary
 * Apply (user-gated): pnpm workspace:provision-canary -- --apply
 *
 * Routing: uses syncCrmRoutingSettingsForWorkspace(B) — never global ensureCrmRoutingSettings.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const CANARY_SLUG = "tenant-canary";
const CANARY_NAME = "Houzzat Tenant Canary";
const CANARY_AFFILIATION = "Sun Realty (CANARY)";
const ROUTING_SETTINGS_ID = "tenant-canary-routing";
const HOUZZAT_ROUTING_ID = "default";

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
  };
}

function readScope(): string {
  return (process.env.WORKSPACE_READ_SCOPE ?? "legacy").trim().toLowerCase();
}

function planRows() {
  return {
    workspace: {
      slug: CANARY_SLUG,
      name: CANARY_NAME,
      status: "ACTIVE",
      brokerageAffiliation: CANARY_AFFILIATION,
      primaryAgentId: "<AGENT_B — UI badge only; NOT listingAgentId>",
    },
    users: [
      "OWNER_B (controlled email, no Houzzat membership)",
      "AGENT_B (controlled email, active AgentProfile, future Primary Agent B)",
    ],
    members: [
      { role: "OWNER", user: "OWNER_B" },
      { role: "AGENT", user: "AGENT_B" },
    ],
    organizationBridge:
      "NONE — no Org B. Lead/Task/Note/EmailLog.organizationId = demo-agent (compat metadata only). workspaceId = B is authority.",
    routingSettings: {
      id: ROUTING_SETTINGS_ID,
      workspaceId: "<Workspace B id>",
      listingAgentId: "<AGENT_B>",
      sellerAssignMode: "LISTING_AGENT",
      neverTouch: HOUZZAT_ROUTING_ID,
      weightSync: "syncCrmRoutingSettingsForWorkspace(B) after create",
    },
    weights: [
      { lane: "BUYER", percent: 100, agent: "AGENT_B" },
      { lane: "SELLER", percent: 100, agent: "AGENT_B" },
    ],
    leadCreation: {
      method:
        "Privileged local script: resolveWorkspaceRoutedAssignee(B) + explicit Lead create (workspaceId=B) + notifyNewLeadCaptured — NOT public /api/leads, NOT captureWebsiteLead as-is",
      source: "OTHER",
      notesTag: "[CANARY]",
    },
  };
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const scope = readScope();

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        WORKSPACE_READ_SCOPE: scope || "(unset/legacy — dashboard may still be workspace)",
        note: "Local env may differ from Cloudflare dashboard; production READ is USER-CONFIRMED workspace.",
        plan: planRows(),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log(
      [
        "",
        "[provision-tenant-canary] dry-run ok — routing config isolation closed.",
        "Pass --apply only after user review (apply path not implemented in stub).",
        "",
      ].join("\n"),
    );
    process.exit(0);
  }

  console.error(
    [
      "",
      "[provision-tenant-canary] REFUSE --apply",
      "Apply path not enabled — user must review plan and implement explicit provisioning.",
      "Routing will use syncCrmRoutingSettingsForWorkspace(B), not ensureCrmRoutingSettings.",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
