/**
 * Stage 3K — WORKSPACE_READ_SCOPE cutover pre-flight selftest.
 * No production I/O. Run: pnpm workspace-read-cutover:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canAccessLead,
  leadScopeWhere,
  leadTenantWhere,
  parseCrmReadScope,
  type CrmScopeContext,
} from "../src/lib/crm-read-scope";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_a";
const WS_B = "ws_b";
const ORG = "org_legacy";

function ctx(overrides: Partial<CrmScopeContext> = {}): CrmScopeContext {
  return {
    user: { id: "agent_a" },
    organizationId: ORG,
    organizationIds: [ORG],
    canSeeTeamLeads: false,
    isPlatformAdmin: false,
    workspaceId: WS_A,
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

function testSemantics() {
  const restore = withScope("shadow");
  try {
    assert.equal(parseCrmReadScope(), "shadow");
    assert.deepEqual(leadTenantWhere(ctx()), {
      organizationId: { in: [ORG] },
    });
  } finally {
    restore();
  }

  const restoreWs = withScope("workspace");
  try {
    assert.equal(parseCrmReadScope(), "workspace");
    assert.deepEqual(leadTenantWhere(ctx()), { workspaceId: WS_A });
    assert.deepEqual(
      leadTenantWhere(ctx({ workspaceId: null, isWorkspaceMember: false })),
      { id: { in: [] } },
    );
  } finally {
    restoreWs();
  }
}

function testFailClosedNoOrgFallback() {
  const scope = read("src/lib/crm-read-scope.ts");
  // Workspace branch must not fall back to organizationId
  const wsLeadFn = scope.slice(scope.indexOf("export function leadTenantWhere"));
  const wsBranch = wsLeadFn.slice(
    wsLeadFn.indexOf('if (mode === "workspace")'),
    wsLeadFn.indexOf("return { organizationId"),
  );
  assert.ok(wsBranch.includes("id: { in: [] }") || wsBranch.includes("NO_LEADS"));
  assert.ok(!wsBranch.includes("organizationId: { in:"));

  const restore = withScope("workspace");
  try {
    const ambiguous = ctx({
      hasAmbiguousWorkspaceMembership: true,
      workspaceId: null,
    });
    assert.deepEqual(leadTenantWhere(ambiguous), { id: { in: [] } });
    assert.equal(
      canAccessLead(ambiguous, {
        organizationId: ORG,
        workspaceId: WS_A,
        assignedAgentId: "agent_a",
      }),
      false,
    );
  } finally {
    restore();
  }
}

function testIsolationMatrix() {
  const restore = withScope("workspace");
  try {
    const a = ctx();
    const b = ctx({
      user: { id: "agent_b" },
      workspaceId: WS_B,
    });
    const leadA = {
      organizationId: ORG,
      workspaceId: WS_A,
      assignedAgentId: "agent_a",
    };
    const leadB = {
      organizationId: ORG,
      workspaceId: WS_B,
      assignedAgentId: "agent_b",
    };
    assert.equal(canAccessLead(a, leadA), true);
    assert.equal(canAccessLead(a, leadB), false);
    assert.equal(canAccessLead(b, leadB), true);
    assert.equal(canAccessLead(b, leadA), false);

    // Same brokerage org id is irrelevant under workspace mode
    assert.deepEqual(leadScopeWhere(a, "mine"), {
      workspaceId: WS_A,
      OR: [{ assignedAgentId: "agent_a" }, { assignedAgentId: null }],
    });
    assert.deepEqual(leadTenantWhere(a), { workspaceId: WS_A });
    assert.deepEqual(leadTenantWhere(b), { workspaceId: WS_B });
  } finally {
    restore();
  }
}

function testPlatformAdminWithoutMembershipDenied() {
  const restore = withScope("workspace");
  try {
    const admin = ctx({
      isPlatformAdmin: true,
      canSeeTeamLeads: true,
      workspaceId: null,
      isWorkspaceMember: false,
      isWorkspaceCrmAllowed: false,
    });
    assert.equal(
      canAccessLead(admin, {
        organizationId: ORG,
        workspaceId: WS_A,
        assignedAgentId: null,
      }),
      false,
    );
  } finally {
    restore();
  }
}

function testAppointmentsTenantBound() {
  const page = read("src/app/(agent)/agent/appointments/page.tsx");
  assert.ok(page.includes("leadTenantWhere"));
  assert.ok(page.includes("tenantLeadIds"));
  // Bare agentId:null without lead tenant bind is forbidden
  assert.ok(!page.includes("{ agentId: null },"));
  assert.ok(!page.includes("{ agentId: null }\n"));
}

function testAssignableAgentsWorkspaceAware() {
  const helper = read("src/lib/agent/assignable-agents.ts");
  assert.ok(helper.includes("isWorkspaceReadMode"));
  assert.ok(helper.includes("workspaceMember.findMany"));
  const leadsPage = read("src/app/(agent)/agent/leads/page.tsx");
  assert.ok(leadsPage.includes("listAssignableCrmAgents"));
  const summary = read("src/lib/agent/lead-summary.ts");
  assert.ok(summary.includes("listAssignableCrmAgents"));
}

function testCoreSurfacesUseHelpers() {
  const files = [
    "src/app/(agent)/agent/leads/page.tsx",
    "src/app/(agent)/agent/page.tsx",
    "src/app/(agent)/agent/inbox/page.tsx",
    "src/app/(agent)/agent/tasks/page.tsx",
    "src/lib/agent/statistics.ts",
    "src/lib/agent/desk-activity.ts",
    "src/lib/agent/launchpad-deferred.ts",
    "src/app/api/agent/tasks/route.ts",
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.ok(
      src.includes("leadScopeWhere") ||
        src.includes("leadWhereForDesk") ||
        src.includes("leadTenantWhere") ||
        src.includes("agentTaskTenantWhere") ||
        src.includes("canAccessLead") ||
        src.includes("isWorkspaceReadMode"),
      `${rel} must use read-scope helpers`,
    );
  }
}

function testWranglerDoesNotHardcodeReadScope() {
  const wrangler = read("wrangler.jsonc");
  assert.ok(
    !wrangler.includes("WORKSPACE_READ_SCOPE"),
    "WORKSPACE_READ_SCOPE must be dashboard SoT (not in wrangler)",
  );
  // Activation flags for routing/team/notification stay out of wrangler
  for (const flag of [
    "WORKSPACE_ROUTING_SCOPE",
    "WORKSPACE_NOTIFICATION_SCOPE",
    "WORKSPACE_TEAM_SCOPE",
  ]) {
    assert.ok(!wrangler.includes(flag), `${flag} must not be in wrangler`);
  }
}

function testDualWriteRemains() {
  const ownership = read("src/lib/crm-ownership.ts");
  assert.ok(ownership.includes("resolveLeadCrmOwnership"));
  assert.ok(ownership.includes("organizationId"));
  assert.ok(ownership.includes("workspaceId"));
}

function testSyncBrokerageSeatsDocumentedRisk() {
  const brokerage = read("src/lib/agent/brokerage.ts");
  assert.ok(brokerage.includes("syncBrokerageSeats"));
  assert.ok(brokerage.includes("organizationId: { not: brokerageId }"));
  // Does not rewrite workspaceId (read authority independent)
  const syncBody = brokerage.slice(
    brokerage.indexOf("async function syncBrokerageSeats"),
    brokerage.indexOf("export const ensureBrokerageOrganization"),
  );
  assert.ok(!syncBody.includes("workspaceId:"));
}

async function main() {
  testSemantics();
  testFailClosedNoOrgFallback();
  testIsolationMatrix();
  testPlatformAdminWithoutMembershipDenied();
  testAppointmentsTenantBound();
  testAssignableAgentsWorkspaceAware();
  testCoreSurfacesUseHelpers();
  testWranglerDoesNotHardcodeReadScope();
  testDualWriteRemains();
  testSyncBrokerageSeatsDocumentedRisk();
  console.log("workspace-read-cutover:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
