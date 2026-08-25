/**
 * Stage 3J — Workspace #2 canary PRE-FLIGHT plan selftest (no production I/O).
 *
 * Encodes the isolation matrices and the READ=shadow hard blocker.
 * Run: pnpm workspace2-canary-plan:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** Proposed canary identity — must stay synthetic and unused until apply is unlocked. */
export const CANARY_PLAN = {
  workspaceSlug: "tenant-canary",
  workspaceName: "Houzzat Tenant Canary",
  brokerageAffiliation: "Sun Realty (CANARY)",
  organizationSlug: null as string | null, // NOT required — Org B bridge rejected
  routingSettingsId: "canary-tenant-routing",
  leadTag: "[CANARY]",
} as const;

function testSchemaSupportsIndependentRouting() {
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("workspaceId      String?              @unique"));
  assert.ok(schema.includes("model CrmRoutingSettings"));
  assert.ok(schema.includes('id               String               @id @default("default")'));
  // Lead org nullable — dual-write era
  assert.ok(/organizationId\s+String\?/.test(schema));
  assert.ok(/workspaceId\s+String\?/.test(schema));
}

function testShadowReadsAreOrganizationAuthoritative() {
  const scope = read("src/lib/crm-read-scope.ts");
  assert.ok(scope.includes('if (flag === "shadow") return "shadow"'));
  assert.ok(scope.includes("return { organizationId: { in: ctx.organizationIds } }"));
  // Shadow must still return legacy canAccess — not workspace
  assert.ok(scope.includes("return legacy"));
  assert.ok(scope.includes("logCanAccessShadowMismatch"));
}

function testSingleBrokerageContext() {
  const agent = read("src/lib/agent.ts");
  assert.ok(agent.includes("ensureBrokerageOrganization"));
  assert.ok(agent.includes("organizationIds: [brokerage.id]"));
  // No multi-org organizationIds expansion for Workspace B
  assert.ok(!agent.includes("organizationIds: memberships"));
}

function testSeatSyncCollapsesForeignOrNullOrgs() {
  const brokerage = read("src/lib/agent/brokerage.ts");
  assert.ok(brokerage.includes("syncBrokerageSeats"));
  assert.ok(
    brokerage.includes("{ organizationId: null }") ||
      brokerage.includes("organizationId: null"),
  );
  assert.ok(brokerage.includes("organizationId: { not: brokerageId }"));
  assert.ok(brokerage.includes("data: { organizationId: brokerageId }"));
}

function testHouzzatOwnershipBridgeIsNotGeneric() {
  const ownership = read("src/lib/crm-ownership.ts");
  assert.ok(ownership.includes("LEGACY_CRM_ORGANIZATION_SLUG"));
  assert.ok(ownership.includes('"demo-agent"'));
  assert.ok(ownership.includes("HOUZZAT_WORKSPACE_SLUG"));
  assert.ok(ownership.includes("workspaceIdForOrganization"));
  // Only demo-agent maps to houzzat — no generic Workspace↔Org table
  assert.ok(!ownership.includes("tenant-canary"));
}

function testWorkspaceScopedRuntimeAlreadySafe() {
  const routing = read("src/lib/workspace-routing.ts");
  assert.ok(routing.includes("listWorkspaceRoutableAgents"));
  assert.ok(routing.includes("loadWorkspaceCrmRoutingSettings(workspaceId)"));

  const notify = read("src/lib/workspace-notification-recipients.ts");
  assert.ok(notify.includes("filterStaffRecipientsForLead"));
  assert.ok(notify.includes('status: "ACTIVE"'));

  const team = read("src/lib/workspace-team.ts");
  assert.ok(team.includes("resolveTeamAuthority"));
  assert.ok(team.includes("WORKSPACE_CONTEXT_REQUIRED"));

  const handoff = read("src/lib/open-lead-handoff.ts");
  assert.ok(handoff.includes("activeMemberWorkspaceIds.includes(lead.workspaceId)"));
}

function testOrgBBridgeRejected() {
  // Plan constant: no companion Organization for canary
  assert.equal(CANARY_PLAN.organizationSlug, null);
  // Creating Org B would not enter requireAgentContext.organizationIds
  const agent = read("src/lib/agent.ts");
  assert.ok(agent.includes("organizationIds: [brokerage.id]"));
}

function testStopConditionReadShadow() {
  /**
   * Hard blocker: while READ=shadow, Lead_B cannot satisfy BOTH:
   * - invisible to Houzzat CRM lists, AND
   * - visible to AGENT_B CRM lists
   * without unsafe org sharing or fighting seat sync.
   */
  const wrangler = read("wrangler.jsonc");
  // READ must not be hardcoded — dashboard may still be shadow in production.
  assert.ok(
    !wrangler.includes("WORKSPACE_READ_SCOPE"),
    "WORKSPACE_READ_SCOPE must not be hardcoded in wrangler",
  );

  // Documented canary gate file must refuse apply under shadow
  const provision = read("scripts/provision-tenant-canary.ts");
  assert.ok(provision.includes("WORKSPACE_READ_SCOPE"));
  assert.ok(provision.includes("refuse") || provision.includes("REFUSE"));
  assert.ok(provision.includes("shadow"));
  assert.ok(provision.includes("--apply"));
  assert.ok(provision.includes("dry"));
}

function testNoClientWorkspaceAuthority() {
  const leadsApi = read("src/app/api/leads/route.ts");
  // Public capture must not take client workspaceId as authority
  assert.ok(!/workspaceId:\s*parsed\.data\.workspaceId/.test(leadsApi));
}

function testIsolationMatricesEncoded() {
  // Synthetic matrices used by plan report — keep in sync with CANARY_PLAN
  assert.equal(CANARY_PLAN.workspaceSlug, "tenant-canary");
  assert.equal(CANARY_PLAN.routingSettingsId, "canary-tenant-routing");
  assert.notEqual(CANARY_PLAN.routingSettingsId, "default");
  assert.ok(CANARY_PLAN.brokerageAffiliation.includes("CANARY"));
}

async function main() {
  testSchemaSupportsIndependentRouting();
  testShadowReadsAreOrganizationAuthoritative();
  testSingleBrokerageContext();
  testSeatSyncCollapsesForeignOrNullOrgs();
  testHouzzatOwnershipBridgeIsNotGeneric();
  testWorkspaceScopedRuntimeAlreadySafe();
  testOrgBBridgeRejected();
  testStopConditionReadShadow();
  testNoClientWorkspaceAuthority();
  testIsolationMatricesEncoded();
  console.log("workspace2-canary-plan:selftest: ok (PRE-FLIGHT BLOCKED under READ=shadow)");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
