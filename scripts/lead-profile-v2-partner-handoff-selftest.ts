/**
 * Lead Profile V2 Info → Partner Handoff selftest.
 * Run: node --import tsx scripts/lead-profile-v2-partner-handoff-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  V2_HANDOFF_ENDPOINT,
  V2_HANDOFF_GET_TAKE,
  V2_HANDOFF_HISTORY_UI_TAKE,
  v2HandoffParentRefreshPlan,
  v2HandoffSendDisabled,
  v2HandoffSendPayload,
} from "../src/lib/agent/lead-profile-v2/partner-handoff-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/components/agent/HandoffClient.tsx",
  "src/app/api/agent/handoffs/route.ts",
  "src/app/api/agent/leads/[id]/summary/route.ts",
  "src/lib/agent/lead-summary.ts",
  "src/lib/agent/lead-profile-snapshot.ts",
  "src/lib/agent/lead-profile-panels.ts",
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

function testVisibilityAndMount() {
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  const info = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2InfoPanel.tsx",
  );
  assert.ok(legacy.includes('<Panel title="Partner handoff">'));
  assert.ok(legacy.includes("<HandoffClient leadId={leadId} />"));
  assert.ok(info.includes("Partner handoff"));
  assert.ok(info.includes("<HandoffClient leadId={data.lead.id} />"));
  assert.ok(info.includes('from "@/components/agent/HandoffClient"'));
  const detailsIdx = info.indexOf(">Details<");
  const attrIdx = info.indexOf("Attribution");
  const handoffIdx = info.indexOf("Partner handoff");
  assert.ok(detailsIdx >= 0 && attrIdx > detailsIdx && handoffIdx > attrIdx);
}

function testHandoffClientUnchangedBehavior() {
  const client = read("src/components/agent/HandoffClient.tsx");
  assert.ok(client.includes('fetch("/api/agent/handoffs")'));
  assert.ok(client.includes('method: "POST"'));
  assert.ok(client.includes("partnerId"));
  assert.ok(client.includes("leadId"));
  assert.ok(client.includes("notes: notes || undefined"));
  assert.ok(client.includes("Refer to partner"));
  assert.ok(client.includes('placeholder="Notes for partner"'));
  assert.ok(client.includes("Send handoff"));
  assert.ok(client.includes("Handoff sent."));
  assert.ok(client.includes('data.error ?? "Failed"'));
  assert.ok(client.includes("setTrackUrl(data.trackUrl ?? null)"));
  assert.ok(client.includes("handoffs.slice(0, 5)"));
  assert.ok(client.includes("disabled={!partnerId}"));
  assert.ok(client.includes("h.customerName ?? \"client\""));
  assert.ok(client.includes("{h.status}"));
  assert.ok(client.includes("await load()"));
  assert.equal(client.includes("workspaceId"), false);
  assert.equal(client.includes("retries"), false);
  assert.equal(client.includes("for (let attempt"), false);
}

function testPayloadAndDisable() {
  assert.equal(V2_HANDOFF_ENDPOINT, "/api/agent/handoffs");
  assert.deepEqual(
    v2HandoffSendPayload({
      leadId: "lead-1",
      partnerId: "p1",
      notes: "Please call",
    }),
    {
      partnerId: "p1",
      leadId: "lead-1",
      notes: "Please call",
    },
  );
  assert.deepEqual(
    v2HandoffSendPayload({
      leadId: "lead-1",
      partnerId: "p1",
      notes: "",
    }),
    {
      partnerId: "p1",
      leadId: "lead-1",
      notes: undefined,
    },
  );
  const payload = JSON.stringify(
    v2HandoffSendPayload({
      leadId: "lead-1",
      partnerId: "p1",
      notes: "x",
    }),
  );
  assert.equal(payload.includes("workspace"), false);
  assert.equal(v2HandoffSendDisabled(""), true);
  assert.equal(v2HandoffSendDisabled("p1"), false);
}

function testHistoryBoundAndOrder() {
  assert.equal(V2_HANDOFF_GET_TAKE, 30);
  assert.equal(V2_HANDOFF_HISTORY_UI_TAKE, 5);
  const route = read("src/app/api/agent/handoffs/route.ts");
  assert.ok(route.includes("orderBy: { name: \"asc\" }"));
  assert.ok(route.includes("orderBy: { createdAt: \"desc\" }"));
  assert.ok(route.includes("take: 30"));
  const client = read("src/components/agent/HandoffClient.tsx");
  assert.ok(client.includes("handoffs.slice(0, 5)"));
}

function testNoNewV2Resource() {
  const info = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2InfoPanel.tsx",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(info.includes("leads-v2"), false);
  assert.equal(host.includes("/api/agent/handoffs"), false);
  assert.equal(host.includes("onHandoff"), false);
  const plan = v2HandoffParentRefreshPlan();
  assert.equal(plan.reloadShell, false);
  assert.equal(plan.reloadRail, false);
  assert.equal(plan.reloadTimeline, false);
  assert.equal(plan.reloadTasks, false);
  assert.equal(plan.reloadLookingFor, false);
  assert.equal(plan.reloadNextReminder, false);
  assert.equal(plan.reloadEmails, false);
  assert.equal(plan.reloadAppointments, false);
  assert.equal(plan.reloadEngagement, false);
}

function testServerAuthorization() {
  const route = read("src/app/api/agent/handoffs/route.ts");
  assert.ok(route.includes("requireAgentContextFromRequest(request)"));
  assert.ok(route.includes("canAccessLead(ctx, lead)"));
  assert.ok(route.includes("active: true"));
  assert.ok(route.includes('z.string().optional()'));
  assert.equal(route.includes("workspaceId: z."), false);
  assert.equal(route.includes("lead-profile-v2"), false);
  assert.ok(route.includes("Partner not found"));
  assert.ok(route.includes('error: "Not found"'));
}

function testFailureIsolation() {
  const client = read("src/components/agent/HandoffClient.tsx");
  const send = client.split("async function send()")[1]?.split("return (")[0] ?? "";
  assert.ok(send.includes("setMessage(data.error ?? \"Failed\")"));
  assert.equal(send.includes("throw"), false);
  assert.ok(send.includes("setNotes(\"\")") === true);
  const failBranch = send.split("if (!res.ok)")[1]?.split("setTrackUrl")[0] ?? "";
  assert.equal(failBranch.includes("setNotes"), false);
  const info = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2InfoPanel.tsx",
  );
  assert.ok(info.includes("Details"));
  assert.ok(info.includes("HandoffClient"));
}

function testNoV2MutationEndpoint() {
  const query = read(
    "src/lib/agent/lead-profile-v2/partner-handoff-query.ts",
  );
  assert.equal(query.includes("leads-v2"), false);
  assert.ok(query.includes("/api/agent/handoffs"));
}

function main() {
  testLegacyUntouchedByV2Imports();
  testVisibilityAndMount();
  testHandoffClientUnchangedBehavior();
  testPayloadAndDisable();
  testHistoryBoundAndOrder();
  testNoNewV2Resource();
  testServerAuthorization();
  testFailureIsolation();
  testNoV2MutationEndpoint();
  console.log("lead-profile-v2-partner-handoff-selftest: ok");
}

main();
