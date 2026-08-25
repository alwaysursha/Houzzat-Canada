/**
 * Stage 3H — workspace routing isolation selftest (fixture logic, no production DB).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BROKERAGE,
  FIXTURE,
  USERS,
  WS_A,
  WS_B,
} from "./lib/multi-workspace-isolation-fixtures";
import { parseWorkspaceRoutingScope } from "../src/lib/workspace-scope-flags";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

type RoutableMember = {
  workspaceId: string;
  userId: string;
  status: string;
  role: string;
  active: boolean;
};

const MEMBERS: RoutableMember[] = [
  { workspaceId: WS_A, userId: USERS.agentA1, status: "ACTIVE", role: "AGENT", active: true },
  { workspaceId: WS_A, userId: USERS.agentA2, status: "ACTIVE", role: "AGENT", active: true },
  { workspaceId: WS_B, userId: USERS.agentB1, status: "ACTIVE", role: "AGENT", active: true },
  { workspaceId: WS_B, userId: USERS.agentB2, status: "SUSPENDED", role: "AGENT", active: true },
];

function listRoutable(workspaceId: string): string[] {
  return MEMBERS.filter(
    (m) =>
      m.workspaceId === workspaceId &&
      m.status === "ACTIVE" &&
      m.active &&
      m.role !== "SUSPENDED",
  ).map((m) => m.userId);
}

function pickBuyerLeadAssignee(leadWorkspaceId: string): string | null {
  const pool = listRoutable(leadWorkspaceId);
  return pool[0] ?? null;
}

function testBuyerLeadRoutesToSameWorkspace() {
  const assignee = pickBuyerLeadAssignee(WS_A);
  assert.equal(assignee, USERS.agentA1);
  assert.ok(!listRoutable(WS_A).includes(USERS.agentB1));
}

function testSameBrokerageDoesNotCrossRoute() {
  assert.equal(FIXTURE.workspaces.a.brokerageAffiliation, BROKERAGE);
  assert.equal(FIXTURE.workspaces.b.brokerageAffiliation, BROKERAGE);
  const aPool = listRoutable(WS_A);
  const bPool = listRoutable(WS_B);
  assert.ok(!aPool.some((id) => bPool.includes(id)));
}

function testSuspendedExcluded() {
  const bPool = listRoutable(WS_B);
  assert.ok(!bPool.includes(USERS.agentB2));
  assert.equal(bPool.length, 1);
}

function testPrimaryAgentBCannotGetALead() {
  const primaryB = FIXTURE.workspaces.b.primaryAgentId;
  assert.equal(primaryB, USERS.agentB1);
  const aPool = listRoutable(WS_A);
  assert.ok(!aPool.includes(primaryB!));
}

function testLegacyDefaultFlag() {
  delete process.env.WORKSPACE_ROUTING_SCOPE;
  assert.equal(parseWorkspaceRoutingScope(), "legacy");
}

function testSchemaHasWorkspaceRoutingColumn() {
  const schema = read("prisma/schema.prisma");
  const start = schema.indexOf("model CrmRoutingSettings");
  const end = schema.indexOf("\nmodel ", start + 1);
  const block = schema.slice(start, end > 0 ? end : start + 800);
  assert.ok(block.includes("workspaceId"));
}

function testRoutingModuleExists() {
  const mod = read("src/lib/workspace-routing.ts");
  assert.ok(mod.includes("listWorkspaceRoutableAgents"));
  assert.ok(mod.includes("resolveWorkspaceRoutedAssignee"));
  assert.ok(mod.includes("loadWorkspaceCrmRoutingSettings"));
  assert.ok(!mod.includes("crmRoutingSettings.create"));
  assert.ok(!mod.includes("legacy && !legacy.workspaceId"));
}

async function main() {
  testBuyerLeadRoutesToSameWorkspace();
  testSameBrokerageDoesNotCrossRoute();
  testSuspendedExcluded();
  testPrimaryAgentBCannotGetALead();
  testLegacyDefaultFlag();
  testSchemaHasWorkspaceRoutingColumn();
  testRoutingModuleExists();
  console.log("workspace-routing:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
