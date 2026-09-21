/**
 * Phase 4A — New Leads staff email delivery (structural + preference unit).
 * Run: pnpm new-lead-email:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openLeadHandoffHref, openLeadProfileHref } from "../src/lib/agent/lead-profile-query";
import { isPushTypeEnabled } from "../src/lib/notifications/catalog";
import {
  isStaffCategoryPushEnabled,
  isStaffEmailCategoryEnabled,
  mergeStaffCategoryPrefs,
} from "../src/lib/notifications/staff-categories";

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
const affordability = read("src/app/api/tools/affordability-lead/route.ts");
const sellerReady = read("src/app/api/tools/seller-readiness/route.ts");
const packageJson = read("package.json");

function testHelperOwnsDedupePrefCtaWorker() {
  assert.ok(staffEvents.includes("export function scheduleNewLeadStaffEmail"));
  assert.ok(staffEvents.includes('isStaffEmailCategoryEnabled'));
  assert.ok(staffEvents.includes('"new_leads"'));
  assert.ok(staffEvents.includes("scheduleWorkerSideEffect"));
  assert.ok(staffEvents.includes("absoluteLeadCrmUrl"));
  assert.ok(staffEvents.includes("View lead in HouzzatPro"));
  assert.ok(staffEvents.includes("emailed.has(emailKey)"));
  assert.ok(staffEvents.includes("isAgentRole(user.role)"));
  assert.ok(
    !staffEvents.includes("void sendNotification"),
    "new lead email must not void-float sendNotification",
  );
}

function testExactCta() {
  const deskHref = openLeadProfileHref("lead_abc123");
  assert.equal(deskHref, "/agent/leads?lead=lead_abc123");
  const href = openLeadHandoffHref("lead_abc123");
  assert.equal(href, "/agent/open-lead/lead_abc123");
  assert.ok(staffEvents.includes("openLeadHandoffHref(leadId)"));
  assert.ok(staffEvents.includes("SITE_URL"));
}

function testSignupAssignedAgentEmail() {
  const fnStart = leadIntake.indexOf("export async function captureWebsiteLead");
  assert.ok(fnStart > 0);
  const body = leadIntake.slice(fnStart);
  assert.ok(body.includes("scheduleNewLeadStaffEmail("));
  assert.ok(body.includes("source: sourceKind"));
  assert.ok(body.includes("formatSignupLeadEmailSubject"));
  assert.ok(body.includes("assigneeId"));
  // Unassigned: email only inside `if (assigneeId)` — no desk fan-out from intake.
  const emailIdx = body.indexOf("scheduleNewLeadStaffEmail(");
  const assigneeGate = body.lastIndexOf("if (assigneeId)", emailIdx);
  assert.ok(assigneeGate > 0 && assigneeGate < emailIdx);
  assert.ok(
    !body.includes("deskRecipients"),
    "signup path must not invent desk recipients in this phase",
  );
}

function testPushEmailIndependenceCombos() {
  const combos: Array<[boolean, boolean]> = [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ];
  for (const [push, email] of combos) {
    let prefs: unknown = {};
    prefs = mergeStaffCategoryPrefs(prefs, {
      category: "new_leads",
      channel: "push",
      enabled: push,
    });
    prefs = mergeStaffCategoryPrefs(prefs, {
      category: "new_leads",
      channel: "email",
      enabled: email,
    });
    assert.equal(isStaffCategoryPushEnabled(prefs, "new_leads"), push);
    assert.equal(isPushTypeEnabled(prefs, "new_lead"), push);
    assert.equal(isStaffEmailCategoryEnabled(prefs, "new_leads"), email);
  }
  // Default ON preserves existing desk email delivery.
  assert.equal(isStaffEmailCategoryEnabled(null, "new_leads"), true);
}

function testSourcesUseCentralHelper() {
  for (const [name, body, source] of [
    ["listing", leadsRoute, "listing_inquiry"],
    ["valuation", valuationRoute, "valuation"],
    ["route-planner", routePlanner, "route_planner"],
    ["pre-construction", preCon, "pre_construction"],
  ] as const) {
    assert.ok(
      body.includes("scheduleNewLeadStaffEmail"),
      `${name} must call scheduleNewLeadStaffEmail`,
    );
    assert.ok(
      body.includes(`source: "${source}"`),
      `${name} must pass source ${source}`,
    );
    assert.ok(
      !body.includes("scheduleStaffNotificationEmail"),
      `${name} must not use ad-hoc scheduleStaffNotificationEmail for New Leads`,
    );
  }
  assert.ok(leadIntake.includes('sourceKind'));
  assert.ok(leadIntake.includes('"signup"'));
}

function testDuplicateProtectionInHelper() {
  assert.ok(staffEvents.includes("uniqueUserIds"));
  assert.ok(staffEvents.includes("emailed.add(emailKey)"));
  // Routes pass both assignee + desk into one helper call.
  for (const [name, body] of [
    ["listing", leadsRoute],
    ["valuation", valuationRoute],
    ["route-planner", routePlanner],
    ["pre-construction", preCon],
  ] as const) {
    assert.ok(
      body.includes("assigneeId: assignedAgentId"),
      `${name} must include assignee in New Lead email`,
    );
    assert.ok(
      body.includes("deskRecipients:"),
      `${name} must include desk recipients in same helper call`,
    );
  }
}

function testProviderFailureDoesNotBlockLead() {
  assert.ok(staffEvents.includes("new_lead email failed"));
  assert.ok(staffEvents.includes("new_lead email batch failed"));
  // scheduleNewLeadStaffEmail returns void and catches inside worker.
  const helperStart = staffEvents.indexOf(
    "export function scheduleNewLeadStaffEmail",
  );
  const helperEnd = staffEvents.indexOf(
    "export function scheduleStaffNotificationEmail",
  );
  const helper = staffEvents.slice(helperStart, helperEnd);
  assert.ok(helper.includes(".catch("));
  assert.ok(helper.includes("scheduleWorkerSideEffect"));
}

function testUnassignedNoRandomAgentEmail() {
  // Helper skips when recipientIds empty; signup only emails when assigneeId.
  assert.ok(
    staffEvents.includes("new_lead email skipped: no recipients"),
  );
  const capture = leadIntake.slice(
    leadIntake.indexOf("export async function captureWebsiteLead"),
  );
  const ifAssignee = capture.indexOf("if (assigneeId) {");
  const schedule = capture.indexOf("scheduleNewLeadStaffEmail(");
  assert.ok(ifAssignee > 0 && schedule > ifAssignee);
}

function testToolsNotActivated() {
  assert.ok(!affordability.includes("scheduleNewLeadStaffEmail"));
  assert.ok(!sellerReady.includes("scheduleNewLeadStaffEmail"));
  assert.ok(!affordability.includes("notifyNewLead"));
  assert.ok(!sellerReady.includes("notifyNewLead"));
}

function testSubjectsPresent() {
  assert.ok(leadIntake.includes("formatSignupLeadEmailSubject"));
  assert.ok(leadsRoute.includes("publicLeadNotificationCopy"));
  assert.ok(valuationRoute.includes("publicLeadNotificationCopy"));
  assert.ok(routePlanner.includes("publicLeadNotificationCopy"));
  assert.ok(preCon.includes("publicLeadNotificationCopy"));
}

function testPackageScript() {
  assert.ok(packageJson.includes('"new-lead-email:selftest"'));
}

testHelperOwnsDedupePrefCtaWorker();
testExactCta();
testSignupAssignedAgentEmail();
testPushEmailIndependenceCombos();
testSourcesUseCentralHelper();
testDuplicateProtectionInHelper();
testProviderFailureDoesNotBlockLead();
testUnassignedNoRandomAgentEmail();
testToolsNotActivated();
testSubjectsPresent();
testPackageScript();

console.log("new-lead-email-selftest: ok");
