/**
 * Stage 3J.11.2 — Worker-hosted Tenant B push canary selftest.
 * Run: pnpm workspace2-worker-push-canary:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openLeadHandoffHref } from "../src/lib/agent/lead-profile-query";
import {
  FORBIDDEN_CLIENT_TARGET_KEYS,
  TENANT_B_LEAD_MARKER,
  TENANT_B_PUSH_CONFIRM,
  TENANT_B_PUSH_MARKER,
  TENANT_B_PUSH_TITLE,
  TENANT_B_WORKSPACE_SLUG,
  countPushDeliveryStatuses,
  isRetryableTenantBPushMarkerStatus,
  parseTenantBPushCanaryBody,
  readTenantBPushMarkerStatus,
} from "../src/lib/workspace-canary/tenant-b-push-canary";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testRouteGuards() {
  const route = read("src/app/api/admin/workspace-canary/push/route.ts");
  assert.ok(route.includes("requireAdminUser"));
  assert.ok(route.includes("isTrustedStaffMutationOrigin"));
  assert.ok(route.includes("parseTenantBPushCanaryBody"));
  assert.ok(route.includes("runTenantBPushCanary"));
  assert.ok(route.includes('status: 401'));
  assert.ok(route.includes("Forbidden origin"));
  assert.ok(!route.includes("FIREBASE_SERVICE_ACCOUNT"));
  assert.ok(!route.includes("private_key"));
}

function testAuthIsPlatformAdminOnly() {
  const route = read("src/app/api/admin/workspace-canary/push/route.ts");
  const auth = read("src/lib/owner/auth.ts");
  assert.ok(route.includes("requireAdminUser"));
  assert.ok(auth.includes('user.role !== "ADMIN"'));
  assert.ok(!route.includes("requireAgentUser"));
  assert.ok(!route.includes("WorkspaceMember"));
}

function testBodyParsing() {
  assert.deepEqual(
    parseTenantBPushCanaryBody({
      mode: "dry-run",
      confirm: TENANT_B_PUSH_CONFIRM,
    }),
    {
      ok: true,
      value: { mode: "dry-run", confirm: TENANT_B_PUSH_CONFIRM },
    },
  );
  assert.equal(
    parseTenantBPushCanaryBody({
      mode: "send",
      confirm: "wrong",
    }).ok,
    false,
  );
  assert.equal(
    parseTenantBPushCanaryBody({
      mode: "dry-run",
      confirm: TENANT_B_PUSH_CONFIRM,
      workspaceId: "cmt_evil",
    }).ok,
    false,
  );
  assert.equal(
    parseTenantBPushCanaryBody({
      mode: "dry-run",
      confirm: TENANT_B_PUSH_CONFIRM,
      leadId: "cmt_evil",
    }).ok,
    false,
  );
  for (const key of FORBIDDEN_CLIENT_TARGET_KEYS) {
    const body: Record<string, unknown> = {
      mode: "dry-run",
      confirm: TENANT_B_PUSH_CONFIRM,
      [key]: "x",
    };
    assert.equal(parseTenantBPushCanaryBody(body).ok, false, key);
  }
}

function testServerSideResolution() {
  const lib = read("src/lib/workspace-canary/tenant-b-push-canary.ts");
  assert.ok(lib.includes(`slug: TENANT_B_WORKSPACE_SLUG`));
  assert.ok(lib.includes(TENANT_B_LEAD_MARKER));
  assert.ok(lib.includes("resolveExactLeadB"));
  assert.ok(lib.includes("expected exactly 1 Lead_B"));
  assert.ok(!lib.includes("request.json().workspaceId"));
  assert.ok(lib.includes("filterStaffRecipientsForLead"));
  assert.ok(lib.includes("resolveLeadDeskNotifiers"));
  assert.ok(lib.includes("Houzzat user"));
  assert.ok(lib.includes("foreign workspace user"));
  assert.ok(lib.includes("physical target count="));
  assert.ok(lib.includes("physical target is not AGENT_B"));
}

function testFirebaseFailClosed() {
  const lib = read("src/lib/workspace-canary/tenant-b-push-canary.ts");
  assert.ok(lib.includes("isFirebasePushConfigured"));
  assert.ok(lib.includes("firebase_missing"));
  assert.ok(lib.includes("refuse stub send"));
  assert.ok(lib.includes('mode === "dry-run"'));
  assert.ok(lib.includes("deliverPushToUsersNow"));
  // dry-run must not call deliver
  const dryIdx = lib.indexOf('if (input.mode === "dry-run")');
  const sendIdx = lib.indexOf("await deliverPushToUsersNow");
  assert.ok(dryIdx > 0 && sendIdx > dryIdx, "dry-run must precede FCM send");
}

function testMarkerSemantics() {
  assert.equal(
    readTenantBPushMarkerStatus({ status: "SENT" }, "x"),
    "SENT",
  );
  assert.equal(
    readTenantBPushMarkerStatus(
      {},
      `${TENANT_B_PUSH_MARKER} new_lead push canary scheduled`,
    ),
    "FAILED",
  );
  assert.equal(isRetryableTenantBPushMarkerStatus("FAILED"), true);
  assert.equal(isRetryableTenantBPushMarkerStatus("ATTEMPTED"), true);
  assert.equal(isRetryableTenantBPushMarkerStatus("SENT"), false);

  const lib = read("src/lib/workspace-canary/tenant-b-push-canary.ts");
  assert.ok(lib.includes('status: "already_sent"'));
  assert.ok(lib.includes("ALREADY_SENT"));
  assert.ok(lib.includes("isRetryableTenantBPushMarkerStatus"));
}

function testPayloadAndNoEmail() {
  const lib = read("src/lib/workspace-canary/tenant-b-push-canary.ts");
  assert.ok(lib.includes(TENANT_B_PUSH_TITLE));
  assert.ok(lib.includes('type: "new_lead"'));
  assert.ok(lib.includes("openLeadHandoffHref"));
  assert.ok(!lib.includes("scheduleNewLeadStaffEmail"));
  assert.ok(!lib.includes("notifyNewLeadCapturedToStaff"));
  assert.ok(!lib.includes("resend"));
  const href = openLeadHandoffHref("lead_b_example");
  assert.equal(href, "/agent/open-lead/lead_b_example");
  assert.ok(lib.includes(TENANT_B_WORKSPACE_SLUG));
  assert.ok(lib.includes(TENANT_B_PUSH_MARKER));
}

function testResponseSafety() {
  const lib = read("src/lib/workspace-canary/tenant-b-push-canary.ts");
  const route = read("src/app/api/admin/workspace-canary/push/route.ts");
  assert.ok(lib.includes("leadIdPrefix"));
  assert.ok(lib.includes("authorizedRecipients"));
  assert.ok(lib.includes("physicalTargets"));
  assert.ok(lib.includes("countPushDeliveryStatuses"));
  assert.ok(!lib.includes("private_key"));
  assert.ok(!route.includes("token"));
  assert.ok(!JSON.stringify(countPushDeliveryStatuses([{ status: "sent" }])).includes("token"));
}

function testDeliveryCounts() {
  assert.deepEqual(
    countPushDeliveryStatuses([
      { status: "sent" },
      { status: "failed" },
      { status: "unregistered" },
      { status: "skipped" },
    ]),
    { sent: 1, failed: 1, unregistered: 1, skipped: 1, other: 0 },
  );
}

function testPackageScript() {
  const pkg = read("package.json");
  assert.ok(pkg.includes("workspace2-worker-push-canary:selftest"));
}

async function main() {
  testRouteGuards();
  testAuthIsPlatformAdminOnly();
  testBodyParsing();
  testServerSideResolution();
  testFirebaseFailClosed();
  testMarkerSemantics();
  testPayloadAndNoEmail();
  testResponseSafety();
  testDeliveryCounts();
  testPackageScript();
  console.log("workspace2-worker-push-canary:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
