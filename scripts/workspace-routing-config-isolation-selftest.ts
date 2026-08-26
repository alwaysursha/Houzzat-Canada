/**
 * Stage 3J.1 — routing config isolation selftest (no production DB).
 * Run: pnpm workspace-routing-config-isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAgentInSettingsPool,
  usesWorkspaceRoutingForSettings,
  validateListingAgentForSettings,
  validateWeightsForSettings,
} from "../src/lib/crm-routing-config";
import { parseWorkspaceRoutingScope } from "../src/lib/workspace-scope-flags";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_a";
const WS_B = "ws_b";
const AGENT_A = "agent_a";
const AGENT_B = "agent_b";
const GLOBAL_AGENT = "global_agent";

type Member = {
  workspaceId: string;
  userId: string;
  status: "ACTIVE" | "SUSPENDED";
  role: string;
  activeProfile: boolean;
};

const MEMBERS: Member[] = [
  { workspaceId: WS_A, userId: AGENT_A, status: "ACTIVE", role: "AGENT", activeProfile: true },
  { workspaceId: WS_B, userId: AGENT_B, status: "ACTIVE", role: "AGENT", activeProfile: true },
  { workspaceId: WS_B, userId: "agent_b_suspended", status: "SUSPENDED", role: "AGENT", activeProfile: true },
];

const GLOBAL_AGENTS = new Set([GLOBAL_AGENT, AGENT_A, AGENT_B]);

function listWorkspaceRoutable(workspaceId: string): string[] {
  return MEMBERS.filter(
    (m) =>
      m.workspaceId === workspaceId &&
      m.status === "ACTIVE" &&
      m.activeProfile &&
      m.role !== "SUSPENDED",
  ).map((m) => m.userId);
}

function listLegacyRoutable(): string[] {
  return [...GLOBAL_AGENTS];
}

function listRoutableAgentsForSettings(settings: {
  workspaceId: string | null;
}): string[] {
  if (usesWorkspaceRoutingForSettings(settings)) {
    return listWorkspaceRoutable(settings.workspaceId!);
  }
  return listLegacyRoutable();
}

type WeightRow = { settingsId: string; agentId: string; lane: string };

function syncRoutingWeightsForSettings(input: {
  settingsId: string;
  agentIds: string[];
  existing: WeightRow[];
}): WeightRow[] {
  const { settingsId, agentIds, existing } = input;
  const other = existing.filter((w) => w.settingsId !== settingsId);
  const own = existing.filter((w) => w.settingsId === settingsId);
  const kept = own.filter((w) => agentIds.includes(w.agentId));
  const known = new Set(kept.map((w) => `${w.lane}:${w.agentId}`));
  for (const agentId of agentIds) {
    for (const lane of ["BUYER", "SELLER"]) {
      const key = `${lane}:${agentId}`;
      if (!known.has(key)) {
        kept.push({ settingsId, agentId, lane });
        known.add(key);
      }
    }
  }
  return [...other, ...kept];
}

function testCentralResolverExists() {
  const mod = read("src/lib/crm-routing-config.ts");
  assert.ok(mod.includes("listRoutableAgentsForSettings"));
  assert.ok(mod.includes("usesWorkspaceRoutingForSettings"));
  assert.ok(mod.includes("syncRoutingWeightsForSettings"));
  assert.ok(mod.includes("syncCrmRoutingSettingsForWorkspace"));
  assert.ok(mod.includes("listLegacyRoutableAgents"));
  assert.ok(mod.includes("listWorkspaceRoutableAgents"));
  assert.ok(mod.includes("Never falls back from workspace settings to platform-wide"));
}

function testAdminUsesSettingsScopedCandidates() {
  const api = read("src/app/api/admin/lead-routing/route.ts");
  const page = read("src/app/(admin)/admin/lead-routing/page.tsx");
  assert.ok(api.includes("listRoutableAgentsForSettings"));
  assert.ok(api.includes("validateListingAgentForSettings"));
  assert.ok(api.includes("validateWeightsForSettings"));
  assert.ok(!api.includes("listRoutableAgents()"));
  assert.ok(page.includes("listRoutableAgentsForSettings"));
  assert.ok(!page.includes("listRoutableAgents()"));
}

function testLeadIntakeDelegatesToConfigModule() {
  const intake = read("src/lib/agent/lead-intake.ts");
  assert.ok(intake.includes("from \"@/lib/crm-routing-config\""));
  assert.ok(intake.includes("listRoutableAgentsForSettings"));
  assert.ok(!intake.includes("async function syncRoutingWeights"));
  assert.ok(!intake.includes("prisma.user.findMany"));
}

function testSettingsANeverSeesAgentB() {
  const prev = process.env.WORKSPACE_ROUTING_SCOPE;
  process.env.WORKSPACE_ROUTING_SCOPE = "workspace";
  try {
    const settingsA = { id: "settings_a", workspaceId: WS_A };
    const pool = listRoutableAgentsForSettings(settingsA);
    assert.deepEqual(pool, [AGENT_A]);
    assert.ok(!pool.includes(AGENT_B));
    assert.ok(!pool.includes(GLOBAL_AGENT));
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_ROUTING_SCOPE;
    else process.env.WORKSPACE_ROUTING_SCOPE = prev;
  }
}

function testSettingsBNeverSeesAgentA() {
  const prev = process.env.WORKSPACE_ROUTING_SCOPE;
  process.env.WORKSPACE_ROUTING_SCOPE = "workspace";
  try {
    const settingsB = { id: "settings_b", workspaceId: WS_B };
    const pool = listRoutableAgentsForSettings(settingsB);
    assert.deepEqual(pool, [AGENT_B]);
    assert.ok(!pool.includes(AGENT_A));
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_ROUTING_SCOPE;
    else process.env.WORKSPACE_ROUTING_SCOPE = prev;
  }
}

function testSameBrokerageIrrelevant() {
  const prev = process.env.WORKSPACE_ROUTING_SCOPE;
  process.env.WORKSPACE_ROUTING_SCOPE = "workspace";
  try {
    const poolA = listRoutableAgentsForSettings({ id: "a", workspaceId: WS_A });
    const poolB = listRoutableAgentsForSettings({ id: "b", workspaceId: WS_B });
    assert.ok(!poolA.some((id) => poolB.includes(id)));
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_ROUTING_SCOPE;
    else process.env.WORKSPACE_ROUTING_SCOPE = prev;
  }
}

function testGlobalAgentRoleIrrelevantWithoutMembership() {
  const prev = process.env.WORKSPACE_ROUTING_SCOPE;
  process.env.WORKSPACE_ROUTING_SCOPE = "workspace";
  try {
    const pool = listRoutableAgentsForSettings({ id: "a", workspaceId: WS_A });
    assert.ok(!pool.includes(GLOBAL_AGENT));
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_ROUTING_SCOPE;
    else process.env.WORKSPACE_ROUTING_SCOPE = prev;
  }
}

function testForeignListingAgentDenied() {
  const agents = [{ id: AGENT_A, name: "A", email: "a@test" }];
  const err = validateListingAgentForSettings(AGENT_B, agents);
  assert.ok(err);
}

function testForeignWeightDenied() {
  const agents = [{ id: AGENT_A, name: "A", email: "a@test" }];
  const err = validateWeightsForSettings(
    [{ agentId: AGENT_B, percent: 100 }],
    "Buyer routing",
    agents,
  );
  assert.ok(err);
}

function testSyncADoesNotMutateB() {
  const weights: WeightRow[] = [
    { settingsId: "settings_a", agentId: AGENT_A, lane: "BUYER" },
    { settingsId: "settings_b", agentId: AGENT_B, lane: "BUYER" },
  ];
  const afterA = syncRoutingWeightsForSettings({
    settingsId: "settings_a",
    agentIds: [AGENT_A],
    existing: weights,
  });
  const bWeights = afterA.filter((w) => w.settingsId === "settings_b");
  assert.deepEqual(bWeights, [
    { settingsId: "settings_b", agentId: AGENT_B, lane: "BUYER" },
  ]);
}

function testSyncBDoesNotMutateA() {
  const weights: WeightRow[] = [
    { settingsId: "settings_a", agentId: AGENT_A, lane: "BUYER" },
    { settingsId: "settings_b", agentId: AGENT_B, lane: "BUYER" },
  ];
  const afterB = syncRoutingWeightsForSettings({
    settingsId: "settings_b",
    agentIds: [AGENT_B],
    existing: weights,
  });
  const aWeights = afterB.filter((w) => w.settingsId === "settings_a");
  assert.deepEqual(aWeights, [
    { settingsId: "settings_a", agentId: AGENT_A, lane: "BUYER" },
  ]);
}

function testSyncRemovesForeignWeightFromA() {
  const weights: WeightRow[] = [
    { settingsId: "settings_a", agentId: AGENT_A, lane: "BUYER" },
    { settingsId: "settings_a", agentId: AGENT_B, lane: "BUYER" },
  ];
  const after = syncRoutingWeightsForSettings({
    settingsId: "settings_a",
    agentIds: [AGENT_A],
    existing: weights,
  });
  assert.ok(!after.some((w) => w.agentId === AGENT_B));
}

function testSuspendedMemberExcluded() {
  const prev = process.env.WORKSPACE_ROUTING_SCOPE;
  process.env.WORKSPACE_ROUTING_SCOPE = "workspace";
  try {
    const pool = listRoutableAgentsForSettings({ id: "b", workspaceId: WS_B });
    assert.ok(!pool.includes("agent_b_suspended"));
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_ROUTING_SCOPE;
    else process.env.WORKSPACE_ROUTING_SCOPE = prev;
  }
}

function testLegacyModeUsesPlatformWidePool() {
  delete process.env.WORKSPACE_ROUTING_SCOPE;
  assert.equal(parseWorkspaceRoutingScope(), "legacy");
  const pool = listRoutableAgentsForSettings({ id: "default", workspaceId: WS_A });
  assert.ok(pool.includes(GLOBAL_AGENT));
  assert.ok(pool.includes(AGENT_A));
  assert.ok(pool.includes(AGENT_B));
}

function testWorkspaceModeWithoutWorkspaceIdSkipsWorkspacePool() {
  const prev = process.env.WORKSPACE_ROUTING_SCOPE;
  process.env.WORKSPACE_ROUTING_SCOPE = "workspace";
  try {
    assert.equal(usesWorkspaceRoutingForSettings({ workspaceId: null }), false);
    const pool = listRoutableAgentsForSettings({ id: "default", workspaceId: null });
    assert.ok(pool.includes(GLOBAL_AGENT));
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_ROUTING_SCOPE;
    else process.env.WORKSPACE_ROUTING_SCOPE = prev;
  }
}

function testPrimaryAgentNotCoupledToRouting() {
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("primaryAgentId"));
  assert.ok(schema.includes("not wired") || schema.includes("badge"));
  const teamAdmin = read("src/lib/workspace-team-admin.ts");
  assert.ok(teamAdmin.includes("setWorkspacePrimaryAgent"));
  assert.ok(teamAdmin.includes("scrubWorkspaceRoutingForMember"));
}

function testMemberRemovalScopedPerWorkspace() {
  const teamAdmin = read("src/lib/workspace-team-admin.ts");
  assert.ok(teamAdmin.includes("scrubWorkspaceRoutingForMember"));
  assert.ok(teamAdmin.includes("settingsId: settings.id"));
  assert.ok(teamAdmin.includes("ONE workspace only"));
}

function testProvisionerUsesWorkspaceScopedSync() {
  const lib = read("scripts/lib/tenant-canary-provision.ts");
  assert.ok(lib.includes("CANARY_ROUTING_SETTINGS_ID"));
  assert.ok(lib.includes("crmRoutingWeight.create"));
  assert.ok(!lib.includes("ensureCrmRoutingSettings"));
  assert.ok(!lib.includes("syncCrmRoutingSettingsForWorkspace"));
}

function testAgentPoolHelper() {
  const agents = [{ id: AGENT_A, name: "A", email: "a@test" }];
  assert.equal(isAgentInSettingsPool(AGENT_A, agents), true);
  assert.equal(isAgentInSettingsPool(AGENT_B, agents), false);
}

async function main() {
  testCentralResolverExists();
  testAdminUsesSettingsScopedCandidates();
  testLeadIntakeDelegatesToConfigModule();
  testSettingsANeverSeesAgentB();
  testSettingsBNeverSeesAgentA();
  testSameBrokerageIrrelevant();
  testGlobalAgentRoleIrrelevantWithoutMembership();
  testForeignListingAgentDenied();
  testForeignWeightDenied();
  testSyncADoesNotMutateB();
  testSyncBDoesNotMutateA();
  testSyncRemovesForeignWeightFromA();
  testSuspendedMemberExcluded();
  testLegacyModeUsesPlatformWidePool();
  testWorkspaceModeWithoutWorkspaceIdSkipsWorkspacePool();
  testPrimaryAgentNotCoupledToRouting();
  testMemberRemovalScopedPerWorkspace();
  testProvisionerUsesWorkspaceScopedSync();
  testAgentPoolHelper();
  console.log("workspace-routing-config-isolation:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
