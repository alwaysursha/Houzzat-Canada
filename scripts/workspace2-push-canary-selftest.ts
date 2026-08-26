/**
 * Stage 3J.11 — Tenant B push canary selftest.
 * Run: pnpm workspace2-push-canary:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANARY_PUSH_CONFIRM_TOKEN,
  CANARY_PUSH_MARKER,
  validatePushCanaryApplyConfirmation,
} from "./lib/tenant-push-canary";
import { openLeadHandoffHref } from "../src/lib/agent/lead-profile-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testApplyGuard() {
  assert.equal(
    validatePushCanaryApplyConfirmation({ apply: true, confirm: null }),
    `--apply requires --confirm=${CANARY_PUSH_CONFIRM_TOKEN}`,
  );
  assert.equal(
    validatePushCanaryApplyConfirmation({
      apply: true,
      confirm: CANARY_PUSH_CONFIRM_TOKEN,
    }),
    null,
  );
}

function testStructure() {
  const lib = read("scripts/lib/tenant-push-canary.ts");
  const cli = read("scripts/workspace-push-canary.ts");
  assert.ok(lib.includes("filterStaffRecipientsForLead"));
  assert.ok(lib.includes("resolveLeadDeskNotifiers"));
  assert.ok(lib.includes("deliverPushToUsersNow"));
  assert.ok(lib.includes("openLeadHandoffHref"));
  assert.ok(lib.includes(CANARY_PUSH_MARKER));
  assert.ok(lib.includes("Email"));
  assert.ok(lib.includes("SKIP"));
  assert.ok(!lib.includes("scheduleNewLeadStaffEmail"));
  assert.ok(!lib.includes("notifyNewLeadCapturedToStaff("));
  assert.ok(cli.includes("tenant-canary-push"));
  assert.ok(cli.includes("DRY RUN — NO PUSH SENT") || lib.includes("DRY RUN — NO PUSH SENT"));
}

function testDeepLink() {
  const href = openLeadHandoffHref("lead_b_example");
  assert.equal(href, "/agent/open-lead/lead_b_example");
  assert.ok(!href.includes("workspaceId"));
  assert.ok(!href.includes("?"));
}

function testIdempotencyMarker() {
  const lib = read("scripts/lib/tenant-push-canary.ts");
  assert.ok(lib.includes("findSuccessfulPushMarker"));
  assert.ok(lib.includes('status: "SENT"'));
  assert.ok(lib.includes('status: "FAILED"'));
  assert.ok(lib.includes('status: "ATTEMPTED"'));
  assert.ok(lib.includes("isFirebasePushConfigured"));
  assert.ok(lib.includes("refuse stub send"));
  assert.ok(lib.includes("retryable"));
}

function testAwaitablePushExport() {
  const push = read("src/lib/notifications/push.ts");
  assert.ok(push.includes("export async function deliverPushToUsersNow"));
  assert.ok(push.includes("export function isFirebasePushConfigured"));
  assert.ok(push.includes('return "skipped"'));
  assert.ok(push.includes("[push:stub]"));
}

function testHouzzatExclusion() {
  const lib = read("scripts/lib/tenant-push-canary.ts");
  assert.ok(lib.includes("houzzatInAuthorized"));
  assert.ok(lib.includes("Houzzat user"));
}

async function main() {
  testApplyGuard();
  testStructure();
  testDeepLink();
  testIdempotencyMarker();
  testHouzzatExclusion();
  testAwaitablePushExport();
  console.log("workspace2-push-canary:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
