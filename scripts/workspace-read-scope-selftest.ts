/**
 * Stage 3F — workspace read-scope foundation + tenant isolation (fixture-based).
 * Run: pnpm workspace-read-scope:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentTaskTenantWhere,
  canAccessLead,
  canMutateAppointment,
  leadScopeWhere,
  leadTenantWhere,
  parseCrmReadScope,
  type CrmScopeContext,
} from "../src/lib/crm-read-scope";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_workspace_a";
const WS_B = "ws_workspace_b";
const ORG_LEGACY = "org_demo_agent";
const BROKERAGE = "Sun Realty";

const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const AGENT_C = "user_agent_c";
const AGENT_D = "user_agent_d";
const PLATFORM_ADMIN = "user_platform_admin";

function baseCtx(overrides: Partial<CrmScopeContext> = {}): CrmScopeContext {
  return {
    user: { id: AGENT_A },
    organizationId: ORG_LEGACY,
    organizationIds: [ORG_LEGACY],
    canSeeTeamLeads: false,
    isPlatformAdmin: false,
    workspaceId: WS_A,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    ...overrides,
  };
}

function withScope(mode: "legacy" | "shadow" | "workspace") {
  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = mode;
  // Hostname-bound workspace CRM requires TENANT_DOMAIN_SCOPE=workspace too.
  if (mode === "workspace") {
    process.env.TENANT_DOMAIN_SCOPE = "workspace";
  }
  return () => {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  };
}

function testFeatureFlagParsing() {
  const restore = withScope("legacy");
  try {
    assert.equal(parseCrmReadScope(), "legacy");
    delete process.env.WORKSPACE_READ_SCOPE;
    assert.equal(parseCrmReadScope(), "legacy");
    process.env.WORKSPACE_READ_SCOPE = "invalid";
    assert.equal(parseCrmReadScope(), "legacy");
    process.env.WORKSPACE_READ_SCOPE = "SHADOW";
    assert.equal(parseCrmReadScope(), "shadow");
    process.env.WORKSPACE_READ_SCOPE = "workspace";
    assert.equal(parseCrmReadScope(), "workspace");
  } finally {
    restore();
  }
}

function testWorkspaceMembershipGates() {
  const restore = withScope("workspace");
  try {
    const leadA = {
      organizationId: ORG_LEGACY,
      workspaceId: WS_A,
      assignedAgentId: AGENT_A,
    };
    const leadB = {
      organizationId: ORG_LEGACY,
      workspaceId: WS_B,
      assignedAgentId: AGENT_B,
    };

    // ACTIVE member — same workspace
    assert.equal(canAccessLead(baseCtx(), leadA), true);

    // INVITED denied
    assert.equal(
      canAccessLead(
        baseCtx({ isWorkspaceCrmAllowed: false, isWorkspaceMember: false }),
        leadA,
      ),
      false,
    );

    // SUSPENDED member denied
    assert.equal(
      canAccessLead(
        baseCtx({ isWorkspaceCrmAllowed: false, isWorkspaceMember: true }),
        leadA,
      ),
      false,
    );

    // suspended workspace denied
    assert.equal(
      canAccessLead(baseCtx({ isWorkspaceCrmAllowed: false }), leadA),
      false,
    );

    // cross-workspace denied
    assert.equal(canAccessLead(baseCtx(), leadB), false);
  } finally {
    restore();
  }
}

function testSameBrokerageIsolationMatrix() {
  const restore = withScope("workspace");
  try {
    const leadA = {
      organizationId: ORG_LEGACY,
      workspaceId: WS_A,
      assignedAgentId: AGENT_A,
    };
    const leadB = {
      organizationId: ORG_LEGACY,
      workspaceId: WS_B,
      assignedAgentId: AGENT_B,
    };

    // Agent A → Workspace A lead allowed, Workspace B denied
    assert.equal(
      canAccessLead(
        baseCtx({ user: { id: AGENT_A }, workspaceId: WS_A }),
        leadA,
      ),
      true,
    );
    assert.equal(
      canAccessLead(
        baseCtx({ user: { id: AGENT_A }, workspaceId: WS_A }),
        leadB,
      ),
      false,
    );

    // Agent B → Workspace B lead allowed, Workspace A denied
    assert.equal(
      canAccessLead(
        baseCtx({ user: { id: AGENT_B }, workspaceId: WS_B }),
        leadB,
      ),
      true,
    );
    assert.equal(
      canAccessLead(
        baseCtx({ user: { id: AGENT_B }, workspaceId: WS_B }),
        leadA,
      ),
      false,
    );

    // brokerageAffiliation must not grant access (structural — never referenced in crm-read-scope)
    const readScope = read("src/lib/crm-read-scope.ts");
    assert.ok(!readScope.includes("brokerageAffiliation"));
    void BROKERAGE;
    void AGENT_C;
    void AGENT_D;
  } finally {
    restore();
  }
}

function testOwnerAdminAgentIsolation() {
  const restore = withScope("workspace");
  try {
    const leadB = {
      organizationId: ORG_LEGACY,
      workspaceId: WS_B,
      assignedAgentId: AGENT_B,
    };

    // Workspace A OWNER cannot access Workspace B
    assert.equal(
      canAccessLead(
        baseCtx({
          user: { id: "owner_a" },
          workspaceId: WS_A,
          canSeeTeamLeads: true,
        }),
        leadB,
      ),
      false,
    );

    // Workspace A ADMIN cannot access Workspace B
    assert.equal(
      canAccessLead(
        baseCtx({
          user: { id: "admin_a" },
          workspaceId: WS_A,
          canSeeTeamLeads: true,
        }),
        leadB,
      ),
      false,
    );

    // Workspace A AGENT cannot access Workspace B
    assert.equal(
      canAccessLead(
        baseCtx({ user: { id: AGENT_C }, workspaceId: WS_A }),
        leadB,
      ),
      false,
    );

    // same-workspace OWNER/ADMIN allowed
    const leadA = {
      organizationId: ORG_LEGACY,
      workspaceId: WS_A,
      assignedAgentId: AGENT_C,
    };
    assert.equal(
      canAccessLead(
        baseCtx({ canSeeTeamLeads: true, workspaceId: WS_A }),
        leadA,
      ),
      true,
    );

    // same-workspace AGENT follows assignment — other agent's lead denied
    assert.equal(
      canAccessLead(
        baseCtx({ user: { id: AGENT_A }, workspaceId: WS_A }),
        { ...leadA, assignedAgentId: AGENT_C },
      ),
      false,
    );

    // pond lead (unassigned) visible to workspace agent
    assert.equal(
      canAccessLead(
        baseCtx({ user: { id: AGENT_A }, workspaceId: WS_A }),
        { ...leadA, assignedAgentId: null },
      ),
      true,
    );
  } finally {
    restore();
  }
}

function testPlatformAdminWithoutMembership() {
  const restore = withScope("workspace");
  try {
    const leadB = {
      organizationId: ORG_LEGACY,
      workspaceId: WS_B,
      assignedAgentId: AGENT_B,
    };

    assert.equal(
      canAccessLead(
        baseCtx({
          user: { id: PLATFORM_ADMIN },
          isPlatformAdmin: true,
          canSeeTeamLeads: true,
          workspaceId: WS_A,
        }),
        leadB,
      ),
      false,
    );

    // platform admin without any workspace membership
    assert.equal(
      canAccessLead(
        baseCtx({
          user: { id: PLATFORM_ADMIN },
          isPlatformAdmin: true,
          canSeeTeamLeads: true,
          workspaceId: null,
          isWorkspaceMember: false,
          isWorkspaceCrmAllowed: false,
        }),
        leadB,
      ),
      false,
    );
  } finally {
    restore();
  }
}

function testPrimaryAgentNotAuthBypass() {
  const readScope = read("src/lib/crm-read-scope.ts");
  const workspaceCtx = read("src/lib/workspace-context.ts");
  assert.ok(!readScope.includes("primaryAgentId"));
  assert.ok(!workspaceCtx.includes("primaryAgentId"));
}

function testDeepLinkAuthorization() {
  const restore = withScope("workspace");
  try {
    const leadA = {
      organizationId: ORG_LEGACY,
      workspaceId: WS_A,
      assignedAgentId: AGENT_A,
    };
    const leadB = {
      organizationId: ORG_LEGACY,
      workspaceId: WS_B,
      assignedAgentId: AGENT_B,
    };

    // authorized deep link (same as leads/[id]/page canAccessLead gate)
    assert.equal(
      canAccessLead(baseCtx({ user: { id: AGENT_A } }), leadA),
      true,
    );
    assert.equal(
      canAccessLead(baseCtx({ user: { id: AGENT_A } }), leadB),
      false,
    );
  } finally {
    restore();
  }
}

function testCustomerGlobalStaysCustomerScoped() {
  const leadSummary = read("src/lib/agent/lead-summary.ts");
  assert.ok(leadSummary.includes("customerId"));
  assert.ok(!leadSummary.includes("workspaceId: ctx.workspaceId"));
  assert.ok(!leadSummary.includes('where: { workspaceId'));
}

function testLegacyBehaviorPreserved() {
  const restore = withScope("legacy");
  try {
    // platform admin bypass preserved in legacy
    assert.equal(
      canAccessLead(
        baseCtx({
          isPlatformAdmin: true,
          canSeeTeamLeads: true,
          workspaceId: null,
          isWorkspaceMember: false,
        }),
        {
          organizationId: ORG_LEGACY,
          workspaceId: WS_B,
          assignedAgentId: AGENT_B,
        },
      ),
      true,
    );

    // team leader bypass preserved in legacy
    assert.equal(
      canAccessLead(
        baseCtx({
          canSeeTeamLeads: true,
          workspaceId: WS_A,
        }),
        {
          organizationId: ORG_LEGACY,
          workspaceId: WS_A,
          assignedAgentId: AGENT_C,
        },
      ),
      true,
    );
  } finally {
    restore();
  }
}

function testWorkspaceModeNoOrgFallback() {
  const restore = withScope("workspace");
  try {
    const tenant = leadTenantWhere(baseCtx());
    assert.deepEqual(tenant, { workspaceId: WS_A });
    assert.ok(!("organizationId" in tenant));

    const taskTenant = agentTaskTenantWhere(baseCtx());
    assert.deepEqual(taskTenant, { workspaceId: WS_A });

    // ambiguous membership → fail closed
    const closed = leadTenantWhere(
      baseCtx({ hasAmbiguousWorkspaceMembership: true }),
    );
    assert.deepEqual(closed, { id: { in: [] } });
  } finally {
    restore();
  }
}

function testLeadScopeMineTeamPond() {
  const restore = withScope("workspace");
  try {
    const mine = leadScopeWhere(baseCtx(), "mine");
    assert.deepEqual(mine.workspaceId, WS_A);
    assert.ok(mine.OR);

    const pond = leadScopeWhere(baseCtx(), "pond");
    assert.equal(pond.assignedAgentId, null);

    const team = leadScopeWhere(
      baseCtx({ canSeeTeamLeads: true }),
      "team",
    );
    assert.deepEqual(team, { workspaceId: WS_A });
  } finally {
    restore();
  }
}

function testCentralModuleStructure() {
  const readScope = read("src/lib/crm-read-scope.ts");
  const workspaceCtx = read("src/lib/workspace-context.ts");
  const agent = read("src/lib/agent.ts");

  assert.ok(readScope.includes("parseCrmReadScope"));
  assert.ok(readScope.includes("leadTenantWhere"));
  assert.ok(readScope.includes("agentTaskTenantWhere"));
  assert.ok(readScope.includes("canAccessLead"));
  assert.ok(workspaceCtx.includes("resolveWorkspaceStaffContext"));
  assert.ok(workspaceCtx.includes('status: "ACTIVE"'));
  assert.ok(agent.includes("resolveWorkspaceStaffContext"));
  assert.ok(agent.includes("workspaceId: workspace.workspaceId"));
}

function testApprovedSurfacesWired() {
  const surfaces = [
    "src/app/(agent)/agent/page.tsx",
    "src/app/(agent)/agent/leads/page.tsx",
    "src/app/(agent)/agent/tasks/page.tsx",
    "src/app/(agent)/agent/inbox/page.tsx",
    "src/lib/agent/launchpad-deferred.ts",
    "src/lib/agent/statistics.ts",
    "src/lib/agent/desk-activity.ts",
    "src/app/(agent)/agent/appointments/page.tsx",
    "src/app/api/agent/tasks/route.ts",
  ];

  for (const rel of surfaces) {
    const src = read(rel);
    assert.ok(
      src.includes("crm-read-scope") || src.includes("leadScopeWhere"),
      `${rel} must use centralized read-scope helpers`,
    );
  }
}

function testRollbackFlagsDocumented() {
  const readScope = read("src/lib/crm-read-scope.ts");
  const ownership = read("src/lib/crm-ownership.ts");
  assert.ok(readScope.includes("WORKSPACE_READ_SCOPE"));
  assert.ok(ownership.includes("WORKSPACE_DUAL_WRITE"));
}

function leadA(assignedAgentId: string | null = AGENT_A) {
  return {
    organizationId: ORG_LEGACY,
    workspaceId: WS_A,
    assignedAgentId,
  };
}

function leadB(assignedAgentId: string | null = AGENT_B) {
  return {
    organizationId: ORG_LEGACY,
    workspaceId: WS_B,
    assignedAgentId,
  };
}

function appointmentOnLead(
  lead: ReturnType<typeof leadA>,
  agentId: string | null = AGENT_A,
) {
  return { agentId, lead };
}

function assertHandoffLeadAllowed(
  ctx: CrmScopeContext,
  lead: ReturnType<typeof leadA>,
  expected: boolean,
) {
  assert.equal(canAccessLead(ctx, lead), expected);
}

function testHandoffsLeadAuthorization() {
  const restore = withScope("workspace");
  try {
    // Workspace A agent + Workspace A lead → allowed
    assertHandoffLeadAllowed(baseCtx({ user: { id: AGENT_A } }), leadA(), true);
    // Workspace A OWNER + Workspace A lead → allowed
    assertHandoffLeadAllowed(
      baseCtx({ canSeeTeamLeads: true, user: { id: "owner_a" } }),
      leadA(AGENT_C),
      true,
    );
    // Workspace A ADMIN + Workspace A lead → allowed
    assertHandoffLeadAllowed(
      baseCtx({ canSeeTeamLeads: true, user: { id: "admin_a" } }),
      leadA(AGENT_C),
      true,
    );
    // Workspace A agent + Workspace B lead → denied
    assertHandoffLeadAllowed(baseCtx({ user: { id: AGENT_A } }), leadB(), false);
    // Workspace A OWNER + Workspace B lead → denied
    assertHandoffLeadAllowed(
      baseCtx({ canSeeTeamLeads: true, user: { id: "owner_a" } }),
      leadB(),
      false,
    );
    // Workspace A ADMIN + Workspace B lead → denied
    assertHandoffLeadAllowed(
      baseCtx({ canSeeTeamLeads: true, user: { id: "admin_a" } }),
      leadB(),
      false,
    );
    // Platform ADMIN without Workspace B membership + Workspace B lead → denied
    assertHandoffLeadAllowed(
      baseCtx({
        user: { id: PLATFORM_ADMIN },
        isPlatformAdmin: true,
        canSeeTeamLeads: true,
        workspaceId: WS_A,
      }),
      leadB(),
      false,
    );
    // Same brokerageAffiliation → still denied (structural)
    assertHandoffLeadAllowed(
      baseCtx({ user: { id: AGENT_A }, workspaceId: WS_A }),
      leadB(),
      false,
    );
    // Primary Agent of A + Workspace B lead → denied (no primaryAgentId in auth)
    assertHandoffLeadAllowed(
      baseCtx({ user: { id: "primary_agent_a" }, workspaceId: WS_A }),
      leadB(),
      false,
    );

    const handoffsRoute = read("src/app/api/agent/handoffs/route.ts");
    assert.ok(handoffsRoute.includes("requireAgentContext"));
    assert.ok(handoffsRoute.includes("canAccessLead"));
    assert.ok(handoffsRoute.includes('error: "Not found"'));
    assert.ok(handoffsRoute.includes("requireAgentUser"), "GET stays agent-scoped");
  } finally {
    restore();
  }
}

function testAppointmentsLeadAuthorization() {
  const restore = withScope("workspace");
  try {
    const cases: Array<{
      label: string;
      ctx: CrmScopeContext;
      appt: ReturnType<typeof appointmentOnLead>;
      expected: boolean;
      reason?: "lead" | "agent";
    }> = [
      {
        label: "WS-A agent + WS-A lead",
        ctx: baseCtx({ user: { id: AGENT_A } }),
        appt: appointmentOnLead(leadA()),
        expected: true,
      },
      {
        label: "WS-A OWNER + WS-A lead (own appointment)",
        ctx: baseCtx({ canSeeTeamLeads: true, user: { id: "owner_a" } }),
        appt: appointmentOnLead(leadA(AGENT_C), "owner_a"),
        expected: true,
      },
      {
        label: "WS-A ADMIN + WS-A lead (own appointment)",
        ctx: baseCtx({ canSeeTeamLeads: true, user: { id: "admin_a" } }),
        appt: appointmentOnLead(leadA(AGENT_C), "admin_a"),
        expected: true,
      },
      {
        label: "WS-A agent + WS-B lead",
        ctx: baseCtx({ user: { id: AGENT_A } }),
        appt: appointmentOnLead(leadB()),
        expected: false,
        reason: "lead",
      },
      {
        label: "WS-A OWNER + WS-B lead",
        ctx: baseCtx({ canSeeTeamLeads: true, user: { id: "owner_a" } }),
        appt: appointmentOnLead(leadB()),
        expected: false,
        reason: "lead",
      },
      {
        label: "WS-A ADMIN + WS-B lead",
        ctx: baseCtx({ canSeeTeamLeads: true, user: { id: "admin_a" } }),
        appt: appointmentOnLead(leadB()),
        expected: false,
        reason: "lead",
      },
      {
        label: "Platform ADMIN + WS-B lead",
        ctx: baseCtx({
          user: { id: PLATFORM_ADMIN },
          isPlatformAdmin: true,
          canSeeTeamLeads: true,
          workspaceId: WS_A,
        }),
        appt: appointmentOnLead(leadB()),
        expected: false,
        reason: "lead",
      },
      {
        label: "Primary Agent A + WS-B lead",
        ctx: baseCtx({ user: { id: "primary_agent_a" }, workspaceId: WS_A }),
        appt: appointmentOnLead(leadB()),
        expected: false,
        reason: "lead",
      },
    ];

    for (const c of cases) {
      const result = canMutateAppointment(c.ctx, c.appt);
      assert.equal(
        result.allowed,
        c.expected,
        `${c.label}: expected ${c.expected}`,
      );
      if (!c.expected && c.reason) {
        assert.equal(result.allowed, false);
        if (!result.allowed) {
          assert.equal(result.reason, c.reason, `${c.label} reason`);
        }
      }
    }

    // Unauthorized mutation blocked — agent assignment on another agent's appt
    const blocked = canMutateAppointment(
      baseCtx({ user: { id: AGENT_A } }),
      appointmentOnLead(leadA(AGENT_A), AGENT_C),
    );
    assert.equal(blocked.allowed, false);
    if (!blocked.allowed) assert.equal(blocked.reason, "agent");

    // Lead-less appointment — agentId ownership preserved
    const leadlessOwn = canMutateAppointment(baseCtx({ user: { id: AGENT_A } }), {
      agentId: AGENT_A,
      lead: null,
    });
    assert.equal(leadlessOwn.allowed, true);

    const leadlessOther = canMutateAppointment(baseCtx({ user: { id: AGENT_A } }), {
      agentId: AGENT_C,
      lead: null,
    });
    assert.equal(leadlessOther.allowed, false);
    if (!leadlessOther.allowed) assert.equal(leadlessOther.reason, "agent");

    const apptRoute = read("src/app/api/agent/appointments/route.ts");
    assert.ok(apptRoute.includes("requireAgentContext"));
    assert.ok(apptRoute.includes("canMutateAppointment"));
    assert.ok(apptRoute.includes('error: "Not found"'));
  } finally {
    restore();
  }
}

function testHandoffsAppointmentsLegacyMode() {
  const restore = withScope("legacy");
  try {
    // Handoff: platform admin can access any lead in legacy
    assert.equal(
      canAccessLead(
        baseCtx({
          isPlatformAdmin: true,
          canSeeTeamLeads: true,
          workspaceId: null,
          isWorkspaceMember: false,
        }),
        leadB(),
      ),
      true,
    );

    // Appointment: platform admin bypasses agent assignment
    const adminMutate = canMutateAppointment(
      baseCtx({
        user: { id: PLATFORM_ADMIN },
        isPlatformAdmin: true,
        canSeeTeamLeads: true,
      }),
      appointmentOnLead(leadA(), AGENT_C),
    );
    assert.equal(adminMutate.allowed, true);

    // Appointment: team leader can access lead but not another agent's assignment
    const teamLeadOtherAgent = canMutateAppointment(
      baseCtx({ canSeeTeamLeads: true, user: { id: "owner_a" } }),
      appointmentOnLead(leadA(AGENT_C), AGENT_C),
    );
    assert.equal(teamLeadOtherAgent.allowed, false);
    if (!teamLeadOtherAgent.allowed) {
      assert.equal(teamLeadOtherAgent.reason, "agent");
    }

    const teamLeadOwnAppt = canMutateAppointment(
      baseCtx({ canSeeTeamLeads: true, user: { id: "owner_a" } }),
      appointmentOnLead(leadA(AGENT_C), "owner_a"),
    );
    assert.equal(teamLeadOwnAppt.allowed, true);
  } finally {
    restore();
  }
}

function testDeepLinkUnchanged() {
  const leadsPage = read("src/app/(agent)/agent/leads/[id]/page.tsx");
  assert.ok(leadsPage.includes("canAccessLead"));
  assert.ok(leadsPage.includes("notFound()"));
  assert.ok(!read("src/app/api/agent/appointments/route.ts").includes("/agent/leads"));
}

async function main() {
  testFeatureFlagParsing();
  testWorkspaceMembershipGates();
  testSameBrokerageIsolationMatrix();
  testOwnerAdminAgentIsolation();
  testPlatformAdminWithoutMembership();
  testPrimaryAgentNotAuthBypass();
  testDeepLinkAuthorization();
  testCustomerGlobalStaysCustomerScoped();
  testLegacyBehaviorPreserved();
  testWorkspaceModeNoOrgFallback();
  testLeadScopeMineTeamPond();
  testCentralModuleStructure();
  testApprovedSurfacesWired();
  testRollbackFlagsDocumented();
  testHandoffsLeadAuthorization();
  testAppointmentsLeadAuthorization();
  testHandoffsAppointmentsLegacyMode();
  testDeepLinkUnchanged();
  console.log("workspace-read-scope:selftest: ok (handoffs + appointments security closure)");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "workspace read scope failed",
  );
  process.exit(1);
});
