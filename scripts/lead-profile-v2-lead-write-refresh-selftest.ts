/**
 * Lead Profile V2 Claim / Pipeline / Reassign refresh selftest.
 * Run: node --import tsx scripts/lead-profile-v2-lead-write-refresh-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyV2IdentityLeadWriteRefresh,
  applyV2TaskAffectingLeadWriteRefresh,
  v2LeadWriteMayAffectOpenAgentTasks,
  v2PipelineTransitionAffectsOpenAgentTasks,
} from "../src/lib/agent/lead-profile-v2/lead-write-refresh-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/components/agent/LeadActions.tsx",
  "src/components/agent/PipelineStatusMenu.tsx",
  "src/components/agent/TeamAdminClient.tsx",
  "src/app/api/agent/leads/route.ts",
  "src/app/api/agent/team/route.ts",
  "src/lib/mobile/v2/lead-write-effects.ts",
];

function testLegacyUntouchedByV2Imports() {
  for (const rel of LEGACY_FILES) {
    const src = read(rel);
    assert.equal(
      src.includes("lead-profile-v2"),
      false,
      `${rel} must not import V2`,
    );
    assert.equal(
      src.includes("leads-v2"),
      false,
      `${rel} must not reference V2 routes`,
    );
  }
}

function testServerTaskSideEffects() {
  const leads = read("src/app/api/agent/leads/route.ts");
  assert.ok(leads.includes("createCallNewLeadTaskHttpSafe"));
  assert.ok(leads.includes("parsed.data.claim"));
  assert.ok(leads.includes("onLeadAttemptedContactHttpSafe"));
  assert.ok(leads.includes('parsed.data.status === "ATTEMPTED_CONTACT"'));
  assert.ok(leads.includes("cancelOpenAgentTasksByTitleHttpSafe"));
  const team = read("src/app/api/agent/team/route.ts");
  assert.ok(team.includes('actionRaw === "reassign"'));
  assert.equal(team.includes("createCallNewLeadTaskHttpSafe"), false);
  assert.equal(team.includes("onLeadAttemptedContactHttpSafe"), false);
  assert.equal(team.includes("cancelOpenAgentTasksByTitleHttpSafe"), false);
}

function testMutationKindRules() {
  assert.equal(v2LeadWriteMayAffectOpenAgentTasks("claim"), true);
  assert.equal(v2LeadWriteMayAffectOpenAgentTasks("pipeline"), true);
  assert.equal(v2LeadWriteMayAffectOpenAgentTasks("reassign"), false);
}

function testPipelineTransitionRules() {
  assert.equal(
    v2PipelineTransitionAffectsOpenAgentTasks({
      from: "NEW_LEAD",
      to: "ATTEMPTED_CONTACT",
    }),
    true,
  );
  assert.equal(
    v2PipelineTransitionAffectsOpenAgentTasks({
      from: "CONTACTED",
      to: "ATTEMPTED_CONTACT",
    }),
    true,
  );
  assert.equal(
    v2PipelineTransitionAffectsOpenAgentTasks({
      from: "NEW_LEAD",
      to: "CONTACTED",
    }),
    true,
  );
  assert.equal(
    v2PipelineTransitionAffectsOpenAgentTasks({
      from: "CONTACTED",
      to: "APPT_SET",
    }),
    false,
  );
  assert.equal(
    v2PipelineTransitionAffectsOpenAgentTasks({
      from: "ATTEMPTED_CONTACT",
      to: "ATTEMPTED_CONTACT",
    }),
    false,
  );
  const menu = read("src/components/agent/PipelineStatusMenu.tsx");
  assert.ok(menu.includes("onUpdated?: () => void"));
  assert.equal(menu.includes("onUpdated?: (status"), false);
  assert.equal(menu.includes("onUpdated?: (next"), false);
}

function testHelpersRefreshShape() {
  const identity: string[] = [];
  applyV2IdentityLeadWriteRefresh({
    reloadShell: () => identity.push("shell"),
    reloadTimeline: () => identity.push("timeline"),
    reloadRail: () => identity.push("rail"),
  });
  assert.deepEqual(identity, ["shell", "timeline", "rail"]);

  const loaded: string[] = [];
  applyV2TaskAffectingLeadWriteRefresh({
    tab: "reminders",
    reloadShell: () => loaded.push("shell"),
    reloadTimeline: () => loaded.push("timeline"),
    reloadRail: () => loaded.push("rail"),
    reloadNextReminder: () => loaded.push("nextReminder"),
    reloadTasks: () => loaded.push("reloadTasks"),
    invalidateTasks: () => loaded.push("invalidateTasks"),
  });
  assert.deepEqual(loaded, [
    "shell",
    "timeline",
    "rail",
    "nextReminder",
    "reloadTasks",
  ]);

  const lazy: string[] = [];
  applyV2TaskAffectingLeadWriteRefresh({
    tab: "activity",
    reloadShell: () => lazy.push("shell"),
    reloadTimeline: () => lazy.push("timeline"),
    reloadRail: () => lazy.push("rail"),
    reloadNextReminder: () => lazy.push("nextReminder"),
    reloadTasks: () => lazy.push("reloadTasks"),
    invalidateTasks: () => lazy.push("invalidateTasks"),
  });
  assert.deepEqual(lazy, [
    "shell",
    "timeline",
    "rail",
    "nextReminder",
    "invalidateTasks",
  ]);
}

function testHostWiring() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const rail = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  );
  assert.ok(host.includes("applyV2IdentityLeadWriteRefresh"));
  assert.ok(host.includes("applyV2TaskAffectingLeadWriteRefresh"));
  const identity =
    host.split("const onUpdated =")[1]?.split("const onTaskAffectingLeadWrite")[0] ??
    "";
  assert.ok(identity.includes("applyV2IdentityLeadWriteRefresh"));
  assert.equal(identity.includes("reloadNextReminder"), false);
  assert.equal(identity.includes("reloadTasks"), false);
  assert.equal(identity.includes("invalidateTasks"), false);
  const taskWrite =
    host.split("const onTaskAffectingLeadWrite =")[1]?.split(
      "const refreshProfile",
    )[0] ?? "";
  assert.ok(taskWrite.includes("reloadNextReminder"));
  assert.ok(taskWrite.includes("reloadTasks"));
  assert.ok(taskWrite.includes("invalidateTasks"));
  assert.ok(taskWrite.includes("tab"));
  assert.ok(host.includes("void refreshProfile()"));
  assert.ok(rail.includes("onUpdated={onClaimUpdated}"));
  assert.ok(rail.includes("onUpdated={onPipelineUpdated}"));
  assert.ok(rail.includes("onUpdated={onReassignUpdated}"));
  assert.ok(host.includes("onClaimUpdated={onTaskAffectingLeadWrite}"));
  assert.ok(host.includes("onPipelineUpdated={onTaskAffectingLeadWrite}"));
  assert.ok(host.includes("onReassignUpdated={onUpdated}"));
  assert.equal(host.includes("/summary"), false);
}

function testNoWholeProfileReloadOnWriteHelper() {
  const helper = read(
    "src/lib/agent/lead-profile-v2/lead-write-refresh-query.ts",
  );
  assert.equal(helper.includes("reloadLookingFor"), false);
  assert.equal(helper.includes("reloadEmails"), false);
  assert.equal(helper.includes("reloadEngagement"), false);
  assert.equal(helper.includes("reloadAppointments"), false);
  const helperFns = helper.split("export function applyV2TaskAffectingLeadWriteRefresh")[1] ?? "";
  assert.equal(helperFns.includes("retries"), false);
}

function testNoRetriesOnSharedMutations() {
  const claim = read("src/components/agent/LeadActions.tsx");
  const pipeline = read("src/components/agent/PipelineStatusMenu.tsx");
  const team = read("src/components/agent/TeamAdminClient.tsx");
  const reassign =
    team.split("export function ReassignSelect")[1]?.split("option value=\"\"")[0] ??
    "";
  for (const src of [claim, pipeline, reassign]) {
    assert.equal(src.includes("for (let attempt"), false);
    assert.equal(src.includes("retries"), false);
  }
}

function main() {
  testLegacyUntouchedByV2Imports();
  testServerTaskSideEffects();
  testMutationKindRules();
  testPipelineTransitionRules();
  testHelpersRefreshShape();
  testHostWiring();
  testNoWholeProfileReloadOnWriteHelper();
  testNoRetriesOnSharedMutations();
  console.log("lead-profile-v2-lead-write-refresh-selftest: ok");
}

main();
