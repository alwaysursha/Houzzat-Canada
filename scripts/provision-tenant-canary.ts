/**
 * Stage 3J — provision Workspace #2 (tenant-canary) PRE-FLIGHT stub.
 *
 * Dry-run only while WORKSPACE_READ_SCOPE ≠ workspace.
 * Does NOT create Workspace #2. --apply is refused under shadow/legacy reads.
 *
 * Run: pnpm workspace:provision-canary
 * Apply (blocked until READ=workspace): pnpm workspace:provision-canary -- --apply
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const CANARY_SLUG = "tenant-canary";
const CANARY_NAME = "Houzzat Tenant Canary";
const CANARY_AFFILIATION = "Sun Realty (CANARY)";
const ROUTING_SETTINGS_ID = "canary-tenant-routing";

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
      primaryAgentId: "<AGENT_B after invite/accept>",
    },
    users: ["OWNER_B (controlled email)", "AGENT_B (controlled email)"],
    members: [
      { role: "OWNER", user: "OWNER_B" },
      { role: "AGENT", user: "AGENT_B" },
    ],
    routingSettings: {
      id: ROUTING_SETTINGS_ID,
      workspaceId: "<Workspace B id>",
      listingAgentId: "<AGENT_B>",
      sellerAssignMode: "LISTING_AGENT",
      note: "Never mutate CrmRoutingSettings id=default (Houzzat)",
    },
    weights: [
      { lane: "BUYER", percent: 100, agent: "AGENT_B" },
      { lane: "SELLER", percent: 100, agent: "AGENT_B" },
    ],
    organizationBridge: "NONE — Org B rejected under single-brokerage requireAgentContext",
    leadCreation:
      "Privileged local script calling resolveWorkspaceRoutedAssignee(B) + notifyNewLeadCaptured — not public /api/leads",
  };
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const scope = readScope();

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        WORKSPACE_READ_SCOPE: scope,
        plan: planRows(),
      },
      null,
      2,
    ),
  );

  if (scope !== "workspace") {
    console.error(
      [
        "",
        "[provision-tenant-canary] REFUSE",
        `WORKSPACE_READ_SCOPE=${scope} (required: workspace)`,
        "Under shadow/legacy reads, Lead_B cannot be both:",
        "  - invisible to Houzzat CRM lists, and",
        "  - visible to AGENT_B CRM lists",
        "without sharing the brokerage organizationId (cross-tenant leak)",
        "or fighting syncBrokerageSeats org rewrite.",
        "Do NOT create Workspace #2 until READ cutover is planned.",
        "",
      ].join("\n"),
    );
    process.exit(2);
  }

  if (!apply) {
    console.log(
      "[provision-tenant-canary] dry-run ok — READ=workspace unlocked; pass --apply to execute (not implemented until Stage 3J apply).",
    );
    process.exit(0);
  }

  console.error(
    "[provision-tenant-canary] REFUSE --apply: apply path not enabled in this pre-flight stub.",
  );
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
