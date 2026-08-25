/**
 * Phase 2 — staff notification emitter normalization (structural).
 * Run: pnpm staff-notify:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const staffEvents = read("src/lib/notifications/staff-events.ts");
const leadIntake = read("src/lib/agent/lead-intake.ts");
const leadsRoute = read("src/app/api/leads/route.ts");
const valuationRoute = read("src/app/api/valuation/route.ts");
const routePlanner = read("src/app/api/route-planner/request/route.ts");
const preCon = read("src/app/api/pre-construction/inquiry/route.ts");
const beacon = read("src/app/api/analytics/beacon/route.ts");
const assignAgent = read(
  "src/app/api/admin/people/[id]/assign-agent/route.ts",
);
const affordability = read("src/app/api/tools/affordability-lead/route.ts");
const sellerReady = read("src/app/api/tools/seller-readiness/route.ts");
const resendWebhook = read("src/lib/email/resend-webhook.ts");

function testCentralHelpersExist() {
  assert.ok(staffEvents.includes("export function notifyNewLeadCapturedToStaff"));
  assert.ok(staffEvents.includes("export function notifyNewLeadCaptured"));
  assert.ok(staffEvents.includes("export function scheduleStaffNotificationEmail"));
  assert.ok(staffEvents.includes("export function scheduleNewLeadStaffEmail"));
  assert.ok(staffEvents.includes("export function scheduleNotifyCustomerCameOnline"));
  assert.ok(staffEvents.includes("scheduleWorkerSideEffect"));
  assert.ok(staffEvents.includes("openLeadHandoffHref"));
}

function testSignupUnchangedPattern() {
  assert.ok(leadIntake.includes("notifyNewLeadCaptured("));
  const fnStart = leadIntake.indexOf("export async function captureWebsiteLead");
  assert.ok(fnStart > 0);
  const body = leadIntake.slice(fnStart);
  const notifyIdx = body.indexOf("notifyNewLeadCaptured(");
  const taskIdx = body.indexOf("createCallNewLeadTask(");
  assert.ok(notifyIdx > 0 && taskIdx > notifyIdx, "signup: push before task");
  assert.ok(leadIntake.includes("call-new-lead-task failed"));
}

function testListingInquirySinglePrimaryPush() {
  assert.ok(leadsRoute.includes("notifyNewLeadCapturedToStaff"));
  assert.ok(leadsRoute.includes("scheduleNewLeadStaffEmail"));
  assert.ok(
    !leadsRoute.includes("scheduleStaffNotificationEmail"),
    "listing inquiry must use scheduleNewLeadStaffEmail, not generic desk email helper",
  );
  assert.ok(
    !leadsRoute.includes('type: "contact_requested"'),
    "listing inquiry must not emit contact_requested (one action → one push)",
  );
  assert.ok(
    !leadsRoute.includes('type: "appointment"'),
    "listing inquiry must not emit appointment push (one action → one push)",
  );
  assert.ok(
    !leadsRoute.includes("sendPushToUsers"),
    "listing inquiry must use central new_lead helper, not ad-hoc sendPushToUsers",
  );
  assert.ok(leadsRoute.includes("call-new-lead-task failed"));
}

function testValuationRoutePlannerPreCon() {
  for (const [name, body] of [
    ["valuation", valuationRoute],
    ["route-planner", routePlanner],
    ["pre-construction", preCon],
  ] as const) {
    assert.ok(
      body.includes("notifyNewLeadCapturedToStaff"),
      `${name} must use notifyNewLeadCapturedToStaff`,
    );
    assert.ok(
      body.includes("scheduleNewLeadStaffEmail"),
      `${name} must schedule New Leads email via central helper`,
    );
    assert.ok(
      !body.includes("scheduleStaffNotificationEmail"),
      `${name} must not use ad-hoc scheduleStaffNotificationEmail for New Leads`,
    );
    assert.ok(
      !body.includes("void sendNotification"),
      `${name} must not void-float desk email`,
    );
    assert.ok(
      !body.includes("sendPushToUsers"),
      `${name} must not ad-hoc sendPushToUsers`,
    );
  }

  // Pre-con: only one createCallNewLeadTask (was duplicated).
  const taskMatches = preCon.match(/createCallNewLeadTask\(/g) ?? [];
  assert.equal(taskMatches.length, 1, "pre-con must create Call New task once");
}

function testReassignmentDedupe() {
  assert.ok(assignAgent.includes("!createdLead"));
  assert.ok(assignAgent.includes("notifyLeadAssignedToAgent"));
  assert.ok(staffEvents.includes('type: "lead_reassigned"'));
  assert.ok(staffEvents.includes("openLeadHandoffHref(input.leadId)"));
}

function testBeaconWorkerOwnership() {
  assert.ok(beacon.includes("scheduleNotifyCustomerCameOnline"));
  assert.ok(!beacon.includes("void notifyCustomerCameOnline"));
  assert.ok(
    staffEvents.includes("scheduleNotifyCustomerCameOnline"),
  );
}

function testAlertEngagementHref() {
  assert.ok(resendWebhook.includes("notifyAlertEngagement"));
  assert.ok(resendWebhook.includes("authorizeStaffRecipientForLead"));
  assert.ok(resendWebhook.includes("openLeadHandoffHref(input.leadId)"));
  assert.ok(resendWebhook.includes('type: "alert_engagement"'));
}

function testMissingToolsNotWired() {
  assert.ok(!affordability.includes("notifyNewLead"));
  assert.ok(!affordability.includes("sendPushTo"));
  assert.ok(!sellerReady.includes("notifyNewLead"));
  assert.ok(!sellerReady.includes("sendPushTo"));
  assert.ok(affordability.includes("createCallNewLeadTask"));
  assert.ok(sellerReady.includes("createCallNewLeadTask"));
}

function testExactHrefsInHelpers() {
  assert.ok(staffEvents.includes("href: openLeadHandoffHref"));
  assert.ok(
    staffEvents.includes(
      'href: first.leadId ? openLeadHandoffHref(first.leadId) : "/agent/tasks"',
    ),
  );
}

testCentralHelpersExist();
testSignupUnchangedPattern();
testListingInquirySinglePrimaryPush();
testValuationRoutePlannerPreCon();
testReassignmentDedupe();
testBeaconWorkerOwnership();
testAlertEngagementHref();
testMissingToolsNotWired();
testExactHrefsInHelpers();

console.log("staff-notify-emitters-selftest: ok");
