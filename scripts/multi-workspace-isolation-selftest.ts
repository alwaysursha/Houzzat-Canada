/**
 * Stage 3G — multi-workspace isolation fixture selftest (no production DB).
 * Run: pnpm multi-workspace-isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canAccessLead,
  leadTenantWhere,
  parseCrmReadScope,
} from "../src/lib/crm-read-scope";
import {
  BROKERAGE,
  FIXTURE,
  USERS,
  WS_A,
  WS_B,
  ambiguousMembershipCtx,
  appointmentAuth,
  childVisibleViaLead,
  ctxFor,
  hotnessCohortIds,
  leadById,
  rejectForeignWorkspaceId,
  statisticsLeadCount,
  visibleLeadIds,
  visibleTaskIds,
} from "./lib/multi-workspace-isolation-fixtures";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function withWorkspaceMode() {
  const prev = process.env.WORKSPACE_READ_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  return () => {
    if (prev === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev;
  };
}

function assertDenied(ctx: ReturnType<typeof ctxFor>, leadId: string) {
  assert.equal(canAccessLead(ctx, leadById(leadId)), false, `${leadId} denied`);
}

function assertAllowed(ctx: ReturnType<typeof ctxFor>, leadId: string) {
  assert.equal(canAccessLead(ctx, leadById(leadId)), true, `${leadId} allowed`);
}

function testFixtureShape() {
  assert.equal(FIXTURE.workspaces.a.brokerageAffiliation, BROKERAGE);
  assert.equal(FIXTURE.workspaces.b.brokerageAffiliation, BROKERAGE);
  assert.notEqual(FIXTURE.workspaces.a.id, FIXTURE.workspaces.b.id);
  assert.equal(FIXTURE.leads.filter((l) => l.workspaceId === WS_A).length, 3);
  assert.equal(FIXTURE.leads.filter((l) => l.workspaceId === WS_B).length, 2);
}

function testLeadListIsolation() {
  const agentA = ctxFor("a", "AGENT", USERS.agentA1);
  const ownerA = ctxFor("a", "OWNER", USERS.ownerA);
  const agentB = ctxFor("b", "AGENT", USERS.agentB1);
  const ownerB = ctxFor("b", "OWNER", USERS.ownerB);

  const aMine = visibleLeadIds(agentA, "mine");
  const aTeam = visibleLeadIds(ownerA, "team");
  const aPond = visibleLeadIds(ownerA, "pond");
  const bTeam = visibleLeadIds(ownerB, "team");

  assert.ok(aMine.every((id) => id.startsWith("lead_a")));
  assert.ok(aTeam.every((id) => id.startsWith("lead_a")));
  assert.equal(aPond.length, 1);
  assert.ok(bTeam.every((id) => id.startsWith("lead_b")));

  assert.ok(!aTeam.some((id) => id.startsWith("lead_b")));
  assert.ok(!bTeam.some((id) => id.startsWith("lead_a")));
}

function testLeadDetailIsolation() {
  const ownerA = ctxFor("a", "OWNER", USERS.ownerA);
  const adminA = ctxFor("a", "ADMIN", USERS.adminA);
  const agentA = ctxFor("a", "AGENT", USERS.agentA1);

  assertAllowed(ownerA, "lead_a1");
  assertDenied(ownerA, "lead_b1");
  assertAllowed(adminA, "lead_a2");
  assertDenied(adminA, "lead_b2");
  assertAllowed(agentA, "lead_a1");
  assertDenied(agentA, "lead_b1");

  const primaryCtx = ctxFor("a", "AGENT", USERS.agentA1);
  assertDenied(primaryCtx, "lead_b1");
}

function testPlatformAdminAndBrokerage() {
  const platform = ctxFor("a", "OWNER", USERS.platformAdmin, {
    isPlatformAdmin: true,
    canSeeTeamLeads: true,
    workspaceId: WS_A,
  });
  assertDenied(platform, "lead_b1");

  const ownerA = ctxFor("a", "OWNER", USERS.ownerA);
  assert.equal(FIXTURE.workspaces.a.brokerageAffiliation, BROKERAGE);
  assertDenied(ownerA, "lead_b1");
  void BROKERAGE;
}

function testTaskIsolation() {
  const agentA = ctxFor("a", "AGENT", USERS.agentA1);
  const agentB = ctxFor("b", "AGENT", USERS.agentB1);
  const aTasks = visibleTaskIds(agentA);
  const bTasks = visibleTaskIds(agentB);
  assert.deepEqual(aTasks, ["task_a1"]);
  assert.deepEqual(bTasks, ["task_b1"]);
  for (const t of FIXTURE.tasks) {
    if (t.workspaceId === WS_A) {
      assert.equal(t.leadId.startsWith("lead_a"), true);
    }
  }
}

function testNoteEmailActivityIsolation() {
  const ownerA = ctxFor("a", "OWNER", USERS.ownerA);
  const ownerB = ctxFor("b", "OWNER", USERS.ownerB);
  const aNotes = childVisibleViaLead(ownerA, FIXTURE.notes);
  const bNotes = childVisibleViaLead(ownerB, FIXTURE.notes);
  assert.deepEqual(aNotes.map((n) => n.id), ["note_a1"]);
  assert.deepEqual(bNotes.map((n) => n.id), ["note_b1"]);

  const aEmails = childVisibleViaLead(ownerA, FIXTURE.emailLogs);
  const bEmails = childVisibleViaLead(ownerB, FIXTURE.emailLogs);
  assert.deepEqual(aEmails.map((e) => e.id), ["email_a1"]);
  assert.deepEqual(bEmails.map((e) => e.id), ["email_b1"]);

  const aActs = childVisibleViaLead(ownerA, FIXTURE.activities);
  const bActs = childVisibleViaLead(ownerB, FIXTURE.activities);
  assert.equal(aActs.length, 1);
  assert.equal(bActs.length, 1);
  assert.notEqual(aActs[0]!.id, bActs[0]!.id);
}

function testAppointmentIsolation() {
  const agentA = ctxFor("a", "AGENT", USERS.agentA1);
  const ownerA = ctxFor("a", "OWNER", USERS.ownerA);
  const agentB = ctxFor("b", "AGENT", USERS.agentB1);

  assert.equal(appointmentAuth(agentA, FIXTURE.appointments[0]!).allowed, true);
  assert.equal(appointmentAuth(agentA, FIXTURE.appointments[1]!).allowed, false);
  assert.equal(appointmentAuth(ownerA, FIXTURE.appointments[1]!).allowed, false);
  assert.equal(appointmentAuth(agentB, FIXTURE.appointments[1]!).allowed, true);
}

function testStatisticsIsolation() {
  const ownerA = ctxFor("a", "OWNER", USERS.ownerA);
  const ownerB = ctxFor("b", "OWNER", USERS.ownerB);
  const countA = statisticsLeadCount(ownerA);
  const countB = statisticsLeadCount(ownerB);
  assert.equal(countA, 3);
  assert.equal(countB, 2);
  assert.notEqual(countA + countB, countA);
}

function testHotnessIsolation() {
  const agentA = ctxFor("a", "AGENT", USERS.agentA1);
  const agentB = ctxFor("b", "AGENT", USERS.agentB1);
  const cohortA = hotnessCohortIds(agentA);
  const cohortB = hotnessCohortIds(agentB);
  assert.ok(cohortA.every((id) => leadById(id).workspaceId === WS_A));
  assert.ok(cohortB.every((id) => leadById(id).workspaceId === WS_B));
}

function testSharedConsumerIdentity() {
  const ownerA = ctxFor("a", "OWNER", USERS.ownerA);
  const ownerB = ctxFor("b", "OWNER", USERS.ownerB);
  const sharedLeadsA = FIXTURE.leads.filter(
    (l) => l.customerId === USERS.customerShared && canAccessLead(ownerA, l),
  );
  const sharedLeadsB = FIXTURE.leads.filter(
    (l) => l.customerId === USERS.customerShared && canAccessLead(ownerB, l),
  );
  assert.deepEqual(
    sharedLeadsA.map((l) => l.id).sort(),
    ["lead_a_shared_customer"],
  );
  assert.deepEqual(sharedLeadsB.map((l) => l.id).sort(), ["lead_b1"]);
}

function testMultiMembershipFailClosed() {
  const ctx = ambiguousMembershipCtx(USERS.sharedUser);
  const tenant = leadTenantWhere(ctx);
  assert.deepEqual(tenant, { id: { in: [] } });
  assert.equal(canAccessLead(ctx, leadById("lead_a1")), false);
  assert.equal(canAccessLead(ctx, leadById("lead_b1")), false);
}

function testMembershipStatesDenied() {
  const lead = leadById("lead_a1");
  const invited = ctxFor("a", "AGENT", USERS.agentA1, {
    isWorkspaceCrmAllowed: false,
    isWorkspaceMember: false,
  });
  const suspended = ctxFor("a", "AGENT", USERS.agentA1, {
    isWorkspaceCrmAllowed: false,
    isWorkspaceMember: true,
  });
  assert.equal(canAccessLead(invited, lead), false);
  assert.equal(canAccessLead(suspended, lead), false);
}

function testAttackMatrix() {
  const agentA = ctxFor("a", "AGENT", USERS.agentA1);
  const ownerA = ctxFor("a", "OWNER", USERS.ownerA);

  assertDenied(agentA, "lead_b1");
  assert.equal(
    visibleTaskIds(agentA).includes("task_b1"),
    false,
  );
  assert.equal(rejectForeignWorkspaceId(agentA, WS_B), true);
  assert.equal(rejectForeignWorkspaceId(agentA, WS_A), false);

  assert.equal(canAccessLead(ownerA, leadById("lead_b1")), false);
  assert.equal(
    canAccessLead(
      ctxFor("a", "AGENT", FIXTURE.workspaces.a.primaryAgentId!),
      leadById("lead_b1"),
    ),
    false,
  );
}

function testDeepLinkDenied() {
  const agentA = ctxFor("a", "AGENT", USERS.agentA1);
  assert.equal(canAccessLead(agentA, leadById("lead_b1")), false);
}

function testConsumerGlobalUnchanged() {
  const leadSummary = read("src/lib/agent/lead-summary.ts");
  assert.ok(leadSummary.includes("customerId"));
  assert.ok(!leadSummary.includes("workspaceId: ctx.workspaceId"));
}

function testRoutingSchemaPrepared() {
  const schema = read("prisma/schema.prisma");
  const start = schema.indexOf("model CrmRoutingSettings");
  const end = schema.indexOf("\nmodel ", start + 1);
  const block = schema.slice(start, end > 0 ? end : start + 800);
  assert.ok(block.includes("workspaceId"), "routing must support workspaceId column");
  const intake = read("src/lib/agent/lead-intake.ts");
  assert.ok(intake.includes("resolveWorkspaceRoutedAssignee"));
}

function testHandoffsSecured() {
  const route = read("src/app/api/agent/handoffs/route.ts");
  assert.ok(route.includes("canAccessLead"));
  assert.ok(route.includes("requireAgentContext"));
}

function testNoProductionMutationMarkers() {
  for (const rel of [
    "scripts/multi-workspace-isolation-selftest.ts",
    "scripts/lib/multi-workspace-isolation-fixtures.ts",
  ]) {
    const content = read(rel);
    assert.ok(!/from\s+["'].*prisma/.test(content), `${rel} must not import prisma client`);
    assert.ok(!/\bprisma\.\w+/.test(content), `${rel} must not call prisma client`);
  }
}

function run(name: string, fn: () => void) {
  try {
    fn();
  } catch (error) {
    throw new Error(
      `${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  const restore = withWorkspaceMode();
  try {
    assert.equal(parseCrmReadScope(), "workspace");
    run("fixtureShape", testFixtureShape);
    run("leadListIsolation", testLeadListIsolation);
    run("leadDetailIsolation", testLeadDetailIsolation);
    run("platformAdminAndBrokerage", testPlatformAdminAndBrokerage);
    run("taskIsolation", testTaskIsolation);
    run("noteEmailActivityIsolation", testNoteEmailActivityIsolation);
    run("appointmentIsolation", testAppointmentIsolation);
    run("statisticsIsolation", testStatisticsIsolation);
    run("hotnessIsolation", testHotnessIsolation);
    run("sharedConsumerIdentity", testSharedConsumerIdentity);
    run("multiMembershipFailClosed", testMultiMembershipFailClosed);
    run("membershipStatesDenied", testMembershipStatesDenied);
    run("attackMatrix", testAttackMatrix);
    run("deepLinkDenied", testDeepLinkDenied);
    run("consumerGlobalUnchanged", testConsumerGlobalUnchanged);
    run("routingSchemaPrepared", testRoutingSchemaPrepared);
    run("handoffsSecured", testHandoffsSecured);
    run("noProductionMutationMarkers", testNoProductionMutationMarkers);
    console.log("multi-workspace-isolation:selftest: ok (27+ cases)");
  } finally {
    restore();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "multi-workspace isolation failed",
  );
  process.exit(1);
});
