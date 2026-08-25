/**
 * Stage 3J-REV — Workspace #2 canary PRE-FLIGHT plan selftest (no production I/O).
 *
 * Encodes isolation matrices, READ=workspace unlock for planning, and apply blockers.
 * Run: pnpm workspace2-canary-plan:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentTaskTenantWhere,
  canAccessLead,
  leadScopeWhere,
  leadTenantWhere,
  type CrmScopeContext,
} from "../src/lib/crm-read-scope";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** Proposed canary identity — must stay synthetic and unused until apply is unlocked. */
export const CANARY_PLAN = {
  workspaceSlug: "tenant-canary",
  workspaceName: "Houzzat Tenant Canary",
  brokerageAffiliation: "Sun Realty (CANARY)",
  /**
   * No companion Organization B. Lead.organizationId uses demo-agent as
   * non-authoritative compatibility metadata only (see ORGANIZATIONID MATRIX).
   */
  organizationSlug: null as string | null,
  routingSettingsId: "tenant-canary-routing",
  houzzatRoutingSettingsId: "default",
  leadTag: "[CANARY]",
  leadSource: "OTHER" as const,
} as const;

const WS_A = "ws_houzzat";
const WS_B = "ws_tenant_canary";
const ORG_COMPAT = "org_demo_agent";

function ctx(
  workspaceId: string,
  overrides: Partial<CrmScopeContext> = {},
): CrmScopeContext {
  return {
    user: { id: "user_x" },
    organizationId: ORG_COMPAT,
    organizationIds: [ORG_COMPAT],
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    ...overrides,
  };
}

function withScope(mode: string) {
  const prev = process.env.WORKSPACE_READ_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = mode;
  return () => {
    if (prev === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev;
  };
}

function testSchemaSupportsIndependentRouting() {
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("workspaceId      String?              @unique"));
  assert.ok(schema.includes("model CrmRoutingSettings"));
  assert.ok(schema.includes('id               String               @id @default("default")'));
  assert.ok(/organizationId\s+String\?/.test(schema));
  assert.ok(/workspaceId\s+String\?/.test(schema));
  // Primary Agent is display/future — not routing authority
  assert.ok(schema.includes("primaryAgentId"));
  assert.ok(
    schema.includes("not wired") ||
      schema.includes("Designated business-facing") ||
      schema.includes("badge"),
  );
}

function testReadWorkspaceIsAuthoritative() {
  const restore = withScope("workspace");
  try {
    assert.deepEqual(leadTenantWhere(ctx(WS_A)), { workspaceId: WS_A });
    assert.deepEqual(leadTenantWhere(ctx(WS_B)), { workspaceId: WS_B });
    assert.deepEqual(leadScopeWhere(ctx(WS_A), "team"), { workspaceId: WS_A });
    assert.deepEqual(leadScopeWhere(ctx(WS_B), "team"), { workspaceId: WS_B });
    assert.deepEqual(agentTaskTenantWhere(ctx(WS_B)), { workspaceId: WS_B });

    const leadA = {
      organizationId: ORG_COMPAT,
      workspaceId: WS_A,
      assignedAgentId: "agent_a",
    };
    const leadB = {
      organizationId: ORG_COMPAT,
      workspaceId: WS_B,
      assignedAgentId: "agent_b",
    };
    assert.equal(canAccessLead(ctx(WS_A), leadA), true);
    assert.equal(canAccessLead(ctx(WS_A), leadB), false);
    assert.equal(canAccessLead(ctx(WS_B), leadB), true);
    assert.equal(canAccessLead(ctx(WS_B), leadA), false);
  } finally {
    restore();
  }
}

function testSameBrokerageIrrelevant() {
  const restore = withScope("workspace");
  try {
    // Shared organizationId must not authorize cross-workspace CRM
    const sharedOrgCtx = ctx(WS_A, {
      organizationId: ORG_COMPAT,
      organizationIds: [ORG_COMPAT],
    });
    assert.equal(
      canAccessLead(sharedOrgCtx, {
        organizationId: ORG_COMPAT,
        workspaceId: WS_B,
        assignedAgentId: null,
      }),
      false,
    );
  } finally {
    restore();
  }
}

function testSingleBrokerageContext() {
  const agent = read("src/lib/agent.ts");
  assert.ok(agent.includes("ensureBrokerageOrganization"));
  assert.ok(agent.includes("organizationIds: [brokerage.id]"));
  assert.ok(!agent.includes("organizationIds: memberships"));
}

function testSeatSyncRewriteRiskDocumented() {
  const brokerage = read("src/lib/agent/brokerage.ts");
  assert.ok(brokerage.includes("syncBrokerageSeats"));
  assert.ok(brokerage.includes("organizationId: { not: brokerageId }"));
  assert.ok(brokerage.includes("data: { organizationId: brokerageId }"));
  // Does not rewrite workspaceId today — but rewrites foreign/null organizationId
  const syncFn = brokerage.slice(brokerage.indexOf("async function syncBrokerageSeats"));
  assert.ok(!syncFn.includes("workspaceId"));
}

function testRoutingConfigIsolated() {
  const config = read("src/lib/crm-routing-config.ts");
  assert.ok(config.includes("listRoutableAgentsForSettings"));
  assert.ok(config.includes("usesWorkspaceRoutingForSettings"));
  assert.ok(config.includes("syncRoutingWeightsForSettings"));
  assert.ok(config.includes("listWorkspaceRoutableAgents"));
  assert.ok(config.includes("listLegacyRoutableAgents"));

  const intake = read("src/lib/agent/lead-intake.ts");
  assert.ok(intake.includes("from \"@/lib/crm-routing-config\""));
  assert.ok(intake.includes("listRoutableAgentsForSettings"));
  assert.ok(!intake.includes("async function syncRoutingWeights"));

  const adminPage = read("src/app/(admin)/admin/lead-routing/page.tsx");
  assert.ok(adminPage.includes("listRoutableAgentsForSettings"));
  assert.ok(!adminPage.includes("listRoutableAgents()"));

  const adminApi = read("src/app/api/admin/lead-routing/route.ts");
  assert.ok(adminApi.includes("validateListingAgentForSettings"));
  assert.ok(adminApi.includes("validateWeightsForSettings"));
}

function testHouzzatOwnershipBridgeIsNotGeneric() {
  const ownership = read("src/lib/crm-ownership.ts");
  assert.ok(ownership.includes("LEGACY_CRM_ORGANIZATION_SLUG"));
  assert.ok(ownership.includes('"demo-agent"'));
  assert.ok(ownership.includes("HOUZZAT_WORKSPACE_SLUG"));
  assert.ok(ownership.includes("workspaceIdForOrganization"));
  assert.ok(!ownership.includes("tenant-canary"));
  // resolveLeadCrmOwnership(demo-agent) → houzzat — canary must set workspaceId=B explicitly
  assert.ok(ownership.includes("resolveLeadCrmOwnership"));
}

function testWorkspaceScopedRuntimeAlreadySafe() {
  const routing = read("src/lib/workspace-routing.ts");
  assert.ok(routing.includes("listWorkspaceRoutableAgents"));
  assert.ok(routing.includes("loadWorkspaceCrmRoutingSettings(workspaceId)"));
  assert.ok(routing.includes("resolveWorkspaceRoutedAssignee"));

  const notify = read("src/lib/workspace-notification-recipients.ts");
  assert.ok(notify.includes("filterStaffRecipientsForLead"));
  assert.ok(notify.includes('status: "ACTIVE"'));
  assert.ok(notify.includes("authorizeStaffRecipientForLead"));

  const team = read("src/lib/workspace-team.ts");
  assert.ok(team.includes("resolveTeamAuthority"));
  assert.ok(team.includes("WORKSPACE_CONTEXT_REQUIRED"));

  const handoff = read("src/lib/open-lead-handoff.ts");
  assert.ok(handoff.includes("activeMemberWorkspaceIds.includes(lead.workspaceId)"));

  const assignable = read("src/lib/agent/assignable-agents.ts");
  assert.ok(assignable.includes("isWorkspaceReadMode"));
  assert.ok(assignable.includes("workspaceMember.findMany"));
}

function testOrgBBridgeRejected() {
  assert.equal(CANARY_PLAN.organizationSlug, null);
}

function testNoClientWorkspaceAuthority() {
  const leadsApi = read("src/app/api/leads/route.ts");
  assert.ok(!/workspaceId:\s*parsed\.data\.workspaceId/.test(leadsApi));
}

function testIsolationMatricesEncoded() {
  assert.equal(CANARY_PLAN.workspaceSlug, "tenant-canary");
  assert.equal(CANARY_PLAN.routingSettingsId, "tenant-canary-routing");
  assert.notEqual(
    CANARY_PLAN.routingSettingsId,
    CANARY_PLAN.houzzatRoutingSettingsId,
  );
  assert.ok(CANARY_PLAN.brokerageAffiliation.includes("CANARY"));
  assert.equal(CANARY_PLAN.leadSource, "OTHER");
}

function testProvisionRollbackSafetyStubs() {
  const provision = read("scripts/provision-tenant-canary.ts");
  assert.ok(provision.includes("WORKSPACE_READ_SCOPE"));
  assert.ok(provision.includes("refuse") || provision.includes("REFUSE"));
  assert.ok(provision.includes("--apply"));
  assert.ok(provision.includes("dry"));
  assert.ok(provision.includes(CANARY_PLAN.workspaceSlug));
  assert.ok(provision.includes(CANARY_PLAN.routingSettingsId));
  assert.ok(provision.includes("syncCrmRoutingSettingsForWorkspace"));
  assert.ok(!provision.includes("ensureCrmRoutingSettings()"));

  const rollback = read("scripts/rollback-tenant-canary.ts");
  assert.ok(rollback.includes("tenant-canary"));
  assert.ok(rollback.includes("houzzat"));
  assert.ok(rollback.includes("default"));
  assert.ok(rollback.includes(CANARY_PLAN.routingSettingsId));
  assert.ok(rollback.includes("neverTouch") || rollback.includes("Never touch"));
}

function testWranglerDoesNotHardcodeReadScope() {
  const wrangler = read("wrangler.jsonc");
  assert.ok(
    !wrangler.includes("WORKSPACE_READ_SCOPE"),
    "dashboard is SoT for WORKSPACE_READ_SCOPE",
  );
}

async function main() {
  testSchemaSupportsIndependentRouting();
  testReadWorkspaceIsAuthoritative();
  testSameBrokerageIrrelevant();
  testSingleBrokerageContext();
  testSeatSyncRewriteRiskDocumented();
  testRoutingConfigIsolated();
  testHouzzatOwnershipBridgeIsNotGeneric();
  testWorkspaceScopedRuntimeAlreadySafe();
  testOrgBBridgeRejected();
  testNoClientWorkspaceAuthority();
  testIsolationMatricesEncoded();
  testProvisionRollbackSafetyStubs();
  testWranglerDoesNotHardcodeReadScope();
  console.log(
    "workspace2-canary-plan:selftest: ok (routing config isolation closed — apply still user-gated)",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
