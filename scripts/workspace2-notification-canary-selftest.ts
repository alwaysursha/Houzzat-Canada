/**
 * Stage 3J.6 — Notification_B canary selftest.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANARY_NOTIFICATION_CONFIRM_TOKEN,
  validateNotificationCanaryApplyConfirmation,
} from "./lib/tenant-notification-canary";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testApplyGuard() {
  assert.equal(
    validateNotificationCanaryApplyConfirmation({ apply: true, confirm: null }),
    `--apply requires --confirm=${CANARY_NOTIFICATION_CONFIRM_TOKEN}`,
  );
}

function testStructure() {
  const lib = read("scripts/lib/tenant-notification-canary.ts");
  const cli = read("scripts/workspace-tenant-notification-canary.ts");
  assert.ok(lib.includes("filterStaffRecipientsForLead"));
  assert.ok(lib.includes("authorizeStaffRecipientForLead"));
  assert.ok(lib.includes("resolveLeadDeskNotifiers"));
  assert.ok(lib.includes("WORKSPACE_NOTIFICATION_SCOPE"));
  assert.ok(lib.includes("openLeadHandoffHref"));
  assert.ok(!lib.includes("notifyNewLeadCapturedToStaff("));
  assert.ok(cli.includes("REFUSE --apply"));
}

function testOrgDoesNotAuthorizeAlone() {
  const lib = read("scripts/lib/tenant-notification-canary.ts");
  assert.ok(lib.includes("authorizeStaffRecipientForLead"));
  assert.ok(lib.includes("workspace member gate"));
  const recipients = read("src/lib/workspace-notification-recipients.ts");
  assert.ok(recipients.includes("isWorkspaceNotificationScope() && input.workspaceId"));
}

function testZeroDeviceSkipSafe() {
  const lib = read("scripts/lib/tenant-notification-canary.ts");
  assert.ok(lib.includes("pushDeviceCounts"));
  assert.ok(lib.includes("DRY-RUN"));
}

async function main() {
  testApplyGuard();
  testStructure();
  testOrgDoesNotAuthorizeAlone();
  testZeroDeviceSkipSafe();
  console.log("workspace2-notification-canary:selftest ok");
}

main();
