/**
 * Lead Profile V2 contact mutations → Activity refresh selftest.
 * Run: node --import tsx scripts/lead-profile-v2-contact-activity-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyV2ContactMutationRefresh,
  V2_CONTACT_EDIT_ENDPOINT,
  V2_CONTACT_REQUEST_UPDATE_ENDPOINT,
  v2ContactEditWritesLeadActivity,
  v2ContactMutationActivityType,
  v2ContactMutationMayAffectAlwaysVisibleResource,
  v2ContactMutationRefreshPlan,
  v2ContactRequestUpdateWritesLeadActivity,
} from "../src/lib/agent/lead-profile-v2/contact-refresh-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/app/api/agent/leads/contact/route.ts",
  "src/app/api/agent/leads/contact-reminder/route.ts",
];

function sliceFn(src: string, start: string, end: string) {
  return src.split(start)[1]?.split(end)[0] ?? "";
}

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

function testServerContactEditActivity() {
  const route = read("src/app/api/agent/leads/contact/route.ts");
  assert.ok(route.includes("prisma.leadActivity.create"));
  assert.ok(route.includes('type: "contact_update"'));
  assert.ok(route.includes("if (changes.length)"));
  assert.equal(route.includes("agentTask"), false);
  assert.equal(route.includes("leadEmailLog"), false);
  assert.equal(route.includes("savedSearch"), false);
  assert.equal(route.includes("savedListing"), false);
  assert.equal(route.includes("customerAlert"), false);
  assert.equal(v2ContactMutationActivityType("edit"), "contact_update");
  assert.equal(v2ContactEditWritesLeadActivity({ changed: true }), true);
  assert.equal(v2ContactEditWritesLeadActivity({ changed: false }), false);
}

function testServerContactRequestUpdateActivity() {
  const route = read("src/app/api/agent/leads/contact-reminder/route.ts");
  assert.ok(route.includes("prisma.leadActivity.create"));
  assert.ok(route.includes('type: "contact_update_request"'));
  assert.ok(route.includes("emailUpdateRequestedAt"));
  assert.ok(route.includes("phoneUpdateRequestedAt"));
  assert.ok(route.includes("scheduleCustomerContactRequestNotice"));
  assert.equal(route.includes("agentTask"), false);
  assert.equal(route.includes("savedSearch"), false);
  assert.equal(v2ContactMutationActivityType("request-update"), "contact_update_request");
  assert.equal(v2ContactRequestUpdateWritesLeadActivity(), true);
  const notice = read("src/lib/account/contact-update-notify.ts");
  assert.ok(notice.includes("scheduleWorkerSideEffect"));
}

function testRefreshPlanShape() {
  const plan = v2ContactMutationRefreshPlan();
  assert.equal(plan.reloadShell, true);
  assert.equal(plan.reloadTimeline, true);
  assert.equal(plan.reloadRail, false);
  assert.equal(plan.reloadLookingFor, false);
  assert.equal(plan.reloadNextReminder, false);
  assert.equal(plan.reloadTasks, false);
  assert.equal(plan.reloadAppointments, false);
  assert.equal(plan.reloadEmails, false);
  assert.equal(plan.reloadEngagement, false);
  assert.equal(plan.reloadSavedSearches, false);
  assert.equal(plan.wholeProfileReload, false);

  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("shell"), true);
  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("timeline"), true);
  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("rail"), false);
  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("looking-for"), false);
  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("next-reminder"), false);
  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("tasks"), false);
  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("appointments"), false);
  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("emails"), false);
  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("engagement"), false);
  assert.equal(v2ContactMutationMayAffectAlwaysVisibleResource("saved-searches"), false);
}

function testApplyOrderAndIsolation() {
  const calls: string[] = [];
  assert.doesNotThrow(() => {
    applyV2ContactMutationRefresh({
      reloadShell: () => calls.push("shell"),
      reloadTimeline: () => {
        calls.push("timeline");
        throw new Error("timeline GET failed");
      },
    });
  });
  assert.deepEqual(calls, ["shell", "timeline"]);

  const calls2: string[] = [];
  applyV2ContactMutationRefresh({
    reloadShell: () => calls2.push("shell"),
    reloadTimeline: () => calls2.push("timeline"),
  });
  assert.deepEqual(calls2, ["shell", "timeline"]);
}

function testHostWiresContactRefresh() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(host.includes("applyV2ContactMutationRefresh"));
  assert.ok(host.includes("onContactMutated"));
  assert.equal(V2_CONTACT_EDIT_ENDPOINT, "/api/agent/leads/contact");
  assert.equal(
    V2_CONTACT_REQUEST_UPDATE_ENDPOINT,
    "/api/agent/leads/contact-reminder",
  );
  assert.ok(host.includes('fetch("/api/agent/leads/contact"'));
  assert.ok(host.includes('fetch("/api/agent/leads/contact-reminder"'));

  const saveContact = sliceFn(
    host,
    "async function saveContact()",
    "async function requestContactUpdate",
  );
  assert.ok(saveContact.includes("onContactMutated()"));
  assert.equal(saveContact.includes("reloadRail"), false);
  assert.equal(saveContact.includes("reloadLookingFor"), false);
  assert.equal(saveContact.includes("reloadNextReminder"), false);
  assert.equal(saveContact.includes("reloadTasks"), false);
  assert.equal(saveContact.includes("reloadAppointments"), false);
  assert.equal(saveContact.includes("reloadEmails"), false);
  assert.equal(saveContact.includes("reloadEngagement"), false);
  assert.equal(saveContact.includes("reloadSavedSearches"), false);
  assert.equal(saveContact.includes("refreshProfile"), false);
  assert.equal(saveContact.includes("/summary"), false);
  assert.equal(saveContact.includes("retry"), false);
  assert.equal(saveContact.includes("for (let attempt"), false);

  const requestUpdate = sliceFn(
    host,
    "async function requestContactUpdate",
    "async function toggleProfileFlag",
  );
  assert.ok(requestUpdate.includes("onContactMutated()"));
  assert.equal(requestUpdate.includes("reloadRail"), false);
  assert.equal(requestUpdate.includes("reloadLookingFor"), false);
  assert.equal(requestUpdate.includes("reloadNextReminder"), false);
  assert.equal(requestUpdate.includes("reloadTasks"), false);
  assert.equal(requestUpdate.includes("reloadAppointments"), false);
  assert.equal(requestUpdate.includes("reloadEmails"), false);
  assert.equal(requestUpdate.includes("reloadEngagement"), false);
  assert.equal(requestUpdate.includes("reloadSavedSearches"), false);
  assert.equal(requestUpdate.includes("refreshProfile"), false);
  assert.equal(requestUpdate.includes("/summary"), false);

  const onContact = sliceFn(
    host,
    "const onContactMutated = useCallback",
    "const onTaskAffectingLeadWrite",
  );
  assert.ok(onContact.includes("reloadShell: reload"));
  assert.ok(onContact.includes("reloadTimeline: reloadDefaultTimeline"));
  assert.equal(onContact.includes("reloadRail"), false);
  assert.equal(onContact.includes("reloadNextReminder"), false);
  assert.equal(onContact.includes("reloadTasks"), false);
}

function testTimelineAlwaysLoadedUsesDefaultReload() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Timeline.ts",
  );
  assert.ok(hook.includes('fetchPage({\n      scope: "recent"'));
  assert.ok(hook.includes("const reloadDefault = useCallback"));
  assert.ok(hook.includes('filters: new Set(DEFAULT_ACTIVITY_FILTER_IDS)'));
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(host.includes("useLeadProfileV2Timeline(session, leadId)"));
  assert.equal(host.includes("tab === \"activity\""), false);
  const query = read("src/lib/agent/lead-profile-v2/contact-refresh-query.ts");
  assert.ok(query.includes("reloadDefault"));
  assert.ok(query.includes("always loaded"));
}

function testDefaultFiltersIncludeLeadInfo() {
  const filters = read("src/lib/agent/activity-filters.ts");
  assert.ok(filters.includes('"lead_info"'));
  assert.ok(filters.includes('"contact_update"'));
  assert.ok(filters.includes('"contact_update_request"'));
  const defaults = sliceFn(
    filters,
    "export const DEFAULT_ACTIVITY_FILTER_IDS",
    "export type TimelineScope",
  );
  assert.ok(defaults.includes('"lead_info"'));
}

function testTimelineGateNoRetry() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Timeline.ts",
  );
  assert.ok(hook.includes("session.request(V2_TIMELINE_RESOURCE_KEY"));
  assert.ok(hook.includes("session.abort(V2_TIMELINE_RESOURCE_KEY)"));
  assert.ok(hook.includes("canApplyV2TimelineResponse"));
  assert.equal(hook.includes("retries"), false);
  assert.equal(hook.includes("for (let attempt"), false);
  const gate = read("src/lib/agent/lead-profile-v2/request-gate.ts");
  assert.ok(gate.includes("No retries"));
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const saveContact = sliceFn(
    host,
    "async function saveContact()",
    "async function requestContactUpdate",
  );
  assert.ok(saveContact.includes("onContactMutated()"));
  assert.equal(saveContact.includes("await onContactMutated"), false);
}

function testNoWholeProfileReload() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const saveContact = sliceFn(
    host,
    "async function saveContact()",
    "async function requestContactUpdate",
  );
  const requestUpdate = sliceFn(
    host,
    "async function requestContactUpdate",
    "async function toggleProfileFlag",
  );
  for (const src of [saveContact, requestUpdate]) {
    assert.equal(src.includes("/summary"), false);
    assert.equal(src.includes("refreshProfile"), false);
    assert.equal(src.includes("applyV2IdentityLeadWriteRefresh"), false);
    assert.equal(src.includes("applyV2TaskAffectingLeadWriteRefresh"), false);
  }
}

function testExistingEndpointsUnchanged() {
  const edit = read("src/app/api/agent/leads/contact/route.ts");
  const reminder = read("src/app/api/agent/leads/contact-reminder/route.ts");
  assert.ok(edit.includes("canAccessLead"));
  assert.ok(reminder.includes("canAccessLead"));
  assert.equal(edit.includes("leads-v2"), false);
  assert.equal(reminder.includes("leads-v2"), false);
}

testLegacyUntouchedByV2Imports();
testServerContactEditActivity();
testServerContactRequestUpdateActivity();
testRefreshPlanShape();
testApplyOrderAndIsolation();
testHostWiresContactRefresh();
testTimelineAlwaysLoadedUsesDefaultReload();
testDefaultFiltersIncludeLeadInfo();
testTimelineGateNoRetry();
testNoWholeProfileReload();
testExistingEndpointsUnchanged();

console.log("lead-profile-v2-contact-activity-selftest: ok");
