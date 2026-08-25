/**
 * Issue #2 — signup new_lead push wiring (structural, no Vitest).
 * Run: pnpm signup-lead-push:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  audienceForPushType,
  isPushTypeEnabled,
  shellForAudience,
} from "../src/lib/notifications/catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const leadIntake = readFileSync(
  join(root, "src/lib/agent/lead-intake.ts"),
  "utf8",
);
const staffEvents = readFileSync(
  join(root, "src/lib/notifications/staff-events.ts"),
  "utf8",
);
const signUpRoute = readFileSync(
  join(root, "src/app/api/auth/sign-up/route.ts"),
  "utf8",
);
const assignAgentRoute = readFileSync(
  join(root, "src/app/api/admin/people/[id]/assign-agent/route.ts"),
  "utf8",
);
const pushModule = readFileSync(
  join(root, "src/lib/notifications/push.ts"),
  "utf8",
);

function testCentralPushInLeadIntake() {
  assert.ok(
    leadIntake.includes('from "@/lib/notifications/staff-events"'),
    "lead-intake must import staff notification helpers",
  );
  assert.ok(
    leadIntake.includes("notifyNewLeadCaptured"),
    "captureWebsiteLead must call notifyNewLeadCaptured",
  );
  const notifyIdx = leadIntake.indexOf("notifyNewLeadCaptured(");
  const returnIdx = leadIntake.indexOf(
    "return { lead, assignedAgentId: assigneeId, organizationId }",
  );
  assert.ok(notifyIdx > 0 && notifyIdx < returnIdx, "push must fire before return");
  assert.ok(
    leadIntake.includes("if (assigneeId)"),
    "push must be gated on assigneeId",
  );
}

function testSignupRouteDoesNotPushDirectly() {
  assert.ok(signUpRoute.includes("captureWebsiteLead"), "signup still captures lead");
  assert.ok(
    !signUpRoute.includes("sendPushToUser"),
    "signup route must not send push directly — intake owns it",
  );
  assert.ok(
    !signUpRoute.includes("notifyNewLeadCaptured"),
    "signup route must not duplicate new_lead helper",
  );
}

function testNewLeadPayloadShape() {
  assert.ok(staffEvents.includes('type: "new_lead"'));
  assert.ok(staffEvents.includes('title: input.title ?? "New lead"'));
  assert.ok(
    staffEvents.includes("href: openLeadHandoffHref(input.leadId)"),
    "new_lead must deep-link to lead profile query (?lead=)",
  );
  assert.ok(
    staffEvents.includes("notifyNewLeadCapturedToStaff"),
    "signup convenience must delegate to staff fan-out helper",
  );
  assert.ok(
    staffEvents.includes("scheduleWorkerSideEffect"),
    "staff-events owns Worker scheduling for email/online",
  );
}

function testAdminDuplicateProtection() {
  assert.ok(
    assignAgentRoute.includes("!createdLead"),
    "admin assign must skip lead_reassigned when intake already sent new_lead",
  );
}

function testPushPrefsAndAudience() {
  assert.equal(audienceForPushType("new_lead"), "staff");
  assert.equal(shellForAudience("staff"), "houzzatpro");
  assert.equal(isPushTypeEnabled(null, "new_lead"), true);
  assert.equal(isPushTypeEnabled({ new_lead: false }, "new_lead"), false);
  assert.ok(
    pushModule.includes("HOUZZAT_PRO_ALERTS_CHANNEL_ID"),
    "staff pushes must use houzzat_pro_alerts channel constant",
  );
  assert.ok(pushModule.includes('visibility: "PRIVATE"'));
  assert.ok(pushModule.includes('priority: "HIGH"'));
}

function testAssignmentBeforePush() {
  const fnStart = leadIntake.indexOf("export async function captureWebsiteLead");
  assert.ok(fnStart > 0, "captureWebsiteLead must exist");
  const body = leadIntake.slice(fnStart);
  const assignIdx = body.indexOf("assignedAgentId: assigneeId");
  const notifyIdx = body.indexOf("notifyNewLeadCaptured(");
  assert.ok(
    assignIdx > 0 && notifyIdx > assignIdx,
    "assignment is set on create before push",
  );
}

function testPushBeforeTask() {
  const fnStart = leadIntake.indexOf("export async function captureWebsiteLead");
  const body = leadIntake.slice(fnStart);
  const notifyIdx = body.indexOf("notifyNewLeadCaptured(");
  const taskIdx = body.indexOf("createCallNewLeadTask(");
  assert.ok(
    notifyIdx > 0 && taskIdx > notifyIdx,
    "push must fire before createCallNewLeadTask",
  );
}

function testTaskFailureIsolation() {
  const fnStart = leadIntake.indexOf("export async function captureWebsiteLead");
  const body = leadIntake.slice(fnStart);
  assert.ok(
    body.includes("[lead-intake] call-new-lead-task failed"),
    "task failures must be logged",
  );
  const tryIdx = body.indexOf("try {");
  const taskIdx = body.indexOf("createCallNewLeadTask(");
  const notifyIdx = body.indexOf("notifyNewLeadCaptured(");
  assert.ok(
    notifyIdx > 0 && notifyIdx < tryIdx && tryIdx < taskIdx,
    "task try/catch must wrap only createCallNewLeadTask after push",
  );
}

function testUnassignedNoPush() {
  const fnStart = leadIntake.indexOf("export async function captureWebsiteLead");
  const body = leadIntake.slice(fnStart);
  const notifyBlock = body.slice(
    body.indexOf("if (assigneeId) {"),
    body.indexOf("createCallNewLeadTask("),
  );
  assert.ok(
    notifyBlock.includes("notifyNewLeadCaptured"),
    "push gated inside assigneeId block",
  );
  assert.ok(
    !notifyBlock.includes("else"),
    "no push fallback branch for unassigned leads",
  );
}

testCentralPushInLeadIntake();
testSignupRouteDoesNotPushDirectly();
testNewLeadPayloadShape();
testAdminDuplicateProtection();
testPushPrefsAndAudience();
testAssignmentBeforePush();
testPushBeforeTask();
testTaskFailureIsolation();
testUnassignedNoPush();

console.log("signup-lead-push-selftest: ok");
