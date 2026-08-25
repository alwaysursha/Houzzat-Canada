/**
 * Stage 3J.1 — routing weight sync regression (no production DB).
 * Run: pnpm workspace-routing-weight-sync:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planRoutingWeightSync,
  validateWeightsForSettings,
} from "../src/lib/crm-routing-config";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const AGENT_A = "agent_a";
const AGENT_B = "agent_b";
const AGENT_C = "agent_c";

type Existing = {
  id: string;
  agentId: string;
  lane: "BUYER" | "SELLER";
  percent: number;
};

function existing(
  rows: Array<{ id: string; agentId: string; lane: "BUYER" | "SELLER"; percent: number }>,
): Existing[] {
  return rows;
}

function lanePercent(
  planned: ReturnType<typeof planRoutingWeightSync>,
  lane: "BUYER" | "SELLER",
  agentId: string,
): number {
  return planned.find((w) => w.lane === lane && w.agentId === agentId)?.percent ?? -1;
}

function laneSum(
  planned: ReturnType<typeof planRoutingWeightSync>,
  lane: "BUYER" | "SELLER",
): number {
  return planned.filter((w) => w.lane === lane).reduce((s, w) => s + w.percent, 0);
}

function agents(...ids: string[]) {
  return ids.map((id) => ({ id, name: id, email: `${id}@test` }));
}

function testExisting100PlusNewAgentGetsZero() {
  const planned = planRoutingWeightSync({
    agentIds: [AGENT_A, AGENT_B],
    existing: existing([
      { id: "w1", agentId: AGENT_A, lane: "BUYER", percent: 100 },
      { id: "w2", agentId: AGENT_A, lane: "SELLER", percent: 100 },
    ]),
  });
  assert.equal(lanePercent(planned, "BUYER", AGENT_A), 100);
  assert.equal(lanePercent(planned, "BUYER", AGENT_B), 0);
  assert.equal(lanePercent(planned, "SELLER", AGENT_A), 100);
  assert.equal(lanePercent(planned, "SELLER", AGENT_B), 0);
  assert.equal(laneSum(planned, "BUYER"), 100);
  assert.equal(laneSum(planned, "SELLER"), 100);
}

function testMultipleNewAgentsAllZero() {
  const planned = planRoutingWeightSync({
    agentIds: [AGENT_A, AGENT_B, AGENT_C],
    existing: existing([
      { id: "w1", agentId: AGENT_A, lane: "BUYER", percent: 100 },
      { id: "w2", agentId: AGENT_A, lane: "SELLER", percent: 100 },
    ]),
  });
  assert.equal(lanePercent(planned, "BUYER", AGENT_B), 0);
  assert.equal(lanePercent(planned, "BUYER", AGENT_C), 0);
  assert.equal(lanePercent(planned, "BUYER", AGENT_A), 100);
  assert.equal(laneSum(planned, "BUYER"), 100);
}

function testRemovalDropsInactiveAgent() {
  const planned = planRoutingWeightSync({
    agentIds: [AGENT_A],
    existing: existing([
      { id: "w1", agentId: AGENT_A, lane: "BUYER", percent: 100 },
      { id: "w2", agentId: AGENT_B, lane: "BUYER", percent: 0 },
      { id: "w3", agentId: AGENT_A, lane: "SELLER", percent: 100 },
      { id: "w4", agentId: AGENT_B, lane: "SELLER", percent: 0 },
    ]),
  });
  assert.equal(planned.filter((w) => w.agentId === AGENT_B).length, 0);
  assert.equal(lanePercent(planned, "BUYER", AGENT_A), 100);
}

function testReactivationGetsZeroNotPriorPercent() {
  const planned = planRoutingWeightSync({
    agentIds: [AGENT_A, AGENT_B],
    existing: existing([
      { id: "w1", agentId: AGENT_A, lane: "BUYER", percent: 100 },
      // AGENT_B previously had 50% but was removed from pool — no row survives
    ]),
  });
  assert.equal(lanePercent(planned, "BUYER", AGENT_B), 0);
  assert.equal(lanePercent(planned, "BUYER", AGENT_A), 100);
  assert.equal(laneSum(planned, "BUYER"), 100);
}

function testBootstrapSingleAgentGets100() {
  const planned = planRoutingWeightSync({
    agentIds: [AGENT_A],
    existing: [],
  });
  assert.equal(lanePercent(planned, "BUYER", AGENT_A), 100);
  assert.equal(lanePercent(planned, "SELLER", AGENT_A), 100);
}

function testBootstrapMultipleAgentsAllZero() {
  const planned = planRoutingWeightSync({
    agentIds: [AGENT_A, AGENT_B],
    existing: [],
  });
  assert.equal(lanePercent(planned, "BUYER", AGENT_A), 0);
  assert.equal(lanePercent(planned, "BUYER", AGENT_B), 0);
  assert.equal(laneSum(planned, "BUYER"), 0);
}

function testPatchTotalsOver100Rejected() {
  const pool = agents(AGENT_A, AGENT_B);
  const err = validateWeightsForSettings(
    [
      { agentId: AGENT_A, percent: 100 },
      { agentId: AGENT_B, percent: 50 },
    ],
    "Buyer routing",
    pool,
  );
  assert.ok(err);
  assert.match(err!, /cannot exceed 100/);
  assert.match(err!, /150/);
}

function testPatchTotalsExactly100Accepted() {
  const pool = agents(AGENT_A, AGENT_B);
  const err = validateWeightsForSettings(
    [
      { agentId: AGENT_A, percent: 100 },
      { agentId: AGENT_B, percent: 0 },
    ],
    "Buyer routing",
    pool,
  );
  assert.equal(err, null);
}

function testPatchTotalsUnder100Accepted() {
  const pool = agents(AGENT_A, AGENT_B);
  const err = validateWeightsForSettings(
    [
      { agentId: AGENT_A, percent: 80 },
      { agentId: AGENT_B, percent: 0 },
    ],
    "Buyer routing",
    pool,
  );
  assert.equal(err, null);
}

function testForeignAgentRejected() {
  const pool = agents(AGENT_A);
  const err = validateWeightsForSettings(
    [{ agentId: AGENT_B, percent: 100 }],
    "Seller routing",
    pool,
  );
  assert.ok(err);
}

function testHealExisting150PercentOverflow() {
  const planned = planRoutingWeightSync({
    agentIds: [AGENT_A, AGENT_B],
    existing: existing([
      { id: "w1", agentId: AGENT_A, lane: "BUYER", percent: 100 },
      { id: "w2", agentId: AGENT_B, lane: "BUYER", percent: 50 },
      { id: "w3", agentId: AGENT_A, lane: "SELLER", percent: 100 },
      { id: "w4", agentId: AGENT_B, lane: "SELLER", percent: 50 },
    ]),
  });
  assert.equal(lanePercent(planned, "BUYER", AGENT_A), 100);
  assert.equal(lanePercent(planned, "BUYER", AGENT_B), 0);
  assert.equal(laneSum(planned, "BUYER"), 100);
  assert.equal(laneSum(planned, "SELLER"), 100);
}

function testSyncModuleExportsPlanner() {
  const mod = readFileSync(join(root, "src/lib/crm-routing-config.ts"), "utf8");
  assert.ok(mod.includes("planRoutingWeightSync"));
  assert.ok(mod.includes("bootstrapPercent"));
  assert.ok(!mod.includes("Math.floor(100 / agentIds.length)"));
}

function main() {
  testExisting100PlusNewAgentGetsZero();
  testMultipleNewAgentsAllZero();
  testRemovalDropsInactiveAgent();
  testReactivationGetsZeroNotPriorPercent();
  testBootstrapSingleAgentGets100();
  testBootstrapMultipleAgentsAllZero();
  testPatchTotalsOver100Rejected();
  testPatchTotalsExactly100Accepted();
  testPatchTotalsUnder100Accepted();
  testForeignAgentRejected();
  testHealExisting150PercentOverflow();
  testSyncModuleExportsPlanner();
  console.log("workspace-routing-weight-sync:selftest: ok");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
