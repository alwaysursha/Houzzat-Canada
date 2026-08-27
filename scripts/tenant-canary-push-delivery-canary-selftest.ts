/**
 * Stage 3K.5.8E / 3K.5.8H — Tenant Canary push delivery canary selftest.
 * Run: pnpm tenant-canary-push-delivery:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  authorizeTenantCanaryPushDeliveryCanary,
  FORBIDDEN_PUSH_DELIVERY_CLIENT_KEYS,
  isTenantCanaryPushDeliveryDryRunReady,
  TENANT_CANARY_AGENT_B_EMAIL,
  TENANT_CANARY_EXPECTED_FIREBASE_PROJECT,
  TENANT_CANARY_PUSH_DELIVERY_CONFIRM,
  TENANT_CANARY_PUSH_DELIVERY_MARKER,
  TENANT_CANARY_PUSH_DELIVERY_TITLE,
  TENANT_CANARY_PUSH_DELIVERY_BODY,
  TENANT_CANARY_WORKSPACE_SLUG,
  isRetryablePushDeliveryMarkerStatus,
  parseTenantCanaryPushDeliveryBody,
  readTenantCanaryPushDeliveryMarkerStatus,
} from "../src/lib/workspace-canary/tenant-canary-push-delivery-canary";
import { classifyFcmProviderError } from "../src/lib/notifications/push";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testRouteGuards() {
  const route = read("src/app/api/admin/workspace-canary/push-delivery/route.ts");
  assert.ok(route.includes("requireAgentUser"));
  assert.ok(route.includes("tryTenantStaffContext"));
  assert.ok(route.includes("authorizeTenantCanaryPushDeliveryCanary"));
  assert.ok(route.includes("isTrustedStaffMutationOrigin"));
  assert.ok(route.includes("parseTenantCanaryPushDeliveryBody"));
  assert.ok(route.includes("runTenantCanaryPushDeliveryCanary"));
  assert.ok(!route.includes("requireAdminUser"));
  assert.ok(!route.includes("FIREBASE_SERVICE_ACCOUNT"));
  assert.ok(!route.includes("private_key"));
}

function testAuthorizationMatrix() {
  assert.equal(
    authorizeTenantCanaryPushDeliveryCanary({
      workspaceSlug: TENANT_CANARY_WORKSPACE_SLUG,
      workspaceRole: "OWNER",
      membershipActive: true,
    }).ok,
    true,
  );
  assert.equal(
    authorizeTenantCanaryPushDeliveryCanary({
      workspaceSlug: TENANT_CANARY_WORKSPACE_SLUG,
      workspaceRole: "ADMIN",
      membershipActive: true,
    }).ok,
    true,
  );

  const denies: Array<{
    label: string;
    input: Parameters<typeof authorizeTenantCanaryPushDeliveryCanary>[0];
  }> = [
    {
      label: "AGENT_B on tenant-canary",
      input: {
        workspaceSlug: TENANT_CANARY_WORKSPACE_SLUG,
        workspaceRole: "AGENT",
        membershipActive: true,
      },
    },
    {
      label: "OWNER on houzzat",
      input: {
        workspaceSlug: "houzzat",
        workspaceRole: "OWNER",
        membershipActive: true,
      },
    },
    {
      label: "platform admin without membership",
      input: {
        workspaceSlug: TENANT_CANARY_WORKSPACE_SLUG,
        workspaceRole: null,
        membershipActive: false,
      },
    },
    {
      label: "houzzat-only on tenant-canary",
      input: {
        workspaceSlug: TENANT_CANARY_WORKSPACE_SLUG,
        workspaceRole: null,
        membershipActive: false,
      },
    },
    {
      label: "unknown host / no workspace",
      input: {
        workspaceSlug: null,
        workspaceRole: "OWNER",
        membershipActive: false,
      },
    },
    {
      label: "platform root / arbitrary slug",
      input: {
        workspaceSlug: "other-tenant",
        workspaceRole: "OWNER",
        membershipActive: true,
      },
    },
  ];

  for (const row of denies) {
    const result = authorizeTenantCanaryPushDeliveryCanary(row.input);
    assert.equal(result.ok, false, row.label);
  }
}

function testBodyParsing() {
  assert.deepEqual(
    parseTenantCanaryPushDeliveryBody({
      mode: "dry-run",
      confirm: TENANT_CANARY_PUSH_DELIVERY_CONFIRM,
    }),
    {
      ok: true,
      value: {
        mode: "dry-run",
        confirm: TENANT_CANARY_PUSH_DELIVERY_CONFIRM,
      },
    },
  );
  for (const key of FORBIDDEN_PUSH_DELIVERY_CLIENT_KEYS) {
    const body: Record<string, unknown> = {
      mode: "dry-run",
      confirm: TENANT_CANARY_PUSH_DELIVERY_CONFIRM,
      [key]: "evil",
    };
    assert.equal(parseTenantCanaryPushDeliveryBody(body).ok, false, key);
  }
}

function testServerSideResolution() {
  const lib = read(
    "src/lib/workspace-canary/tenant-canary-push-delivery-canary.ts",
  );
  assert.ok(lib.includes("resolveLatestHomeValuationTestLead"));
  assert.ok(lib.includes('source: "HOME_VALUATION"'));
  assert.ok(lib.includes(TENANT_CANARY_AGENT_B_EMAIL));
  assert.ok(lib.includes("resolveAgentBOnlyPhysicalTarget"));
  assert.ok(lib.includes("authorized recipient is not exactly Agent B"));
  assert.ok(lib.includes("Houzzat user(s) in authorized set"));
  assert.ok(lib.includes(TENANT_CANARY_EXPECTED_FIREBASE_PROJECT));
  assert.ok(!lib.includes("resolveLeadDeskNotifiers"));
  assert.ok(!lib.includes("scheduleNewLeadStaffEmail"));
}

function testMarkerSemantics() {
  assert.equal(
    readTenantCanaryPushDeliveryMarkerStatus({ status: "SENT" }, "x"),
    "SENT",
  );
  assert.equal(isRetryablePushDeliveryMarkerStatus("FAILED"), true);
  assert.equal(isRetryablePushDeliveryMarkerStatus("SENT"), false);

  const lib = read(
    "src/lib/workspace-canary/tenant-canary-push-delivery-canary.ts",
  );
  assert.ok(lib.includes(TENANT_CANARY_PUSH_DELIVERY_MARKER));
  assert.ok(lib.includes("canary_push_delivery"));
  assert.ok(lib.includes('status: "already_sent"'));
}

function testPayloadAndAgentBOnly() {
  const lib = read(
    "src/lib/workspace-canary/tenant-canary-push-delivery-canary.ts",
  );
  assert.ok(lib.includes(TENANT_CANARY_PUSH_DELIVERY_TITLE));
  assert.ok(lib.includes(TENANT_CANARY_PUSH_DELIVERY_BODY));
  assert.ok(lib.includes("physicalTargets: [context.agentBId]"));
}

function testFcmErrorClassification() {
  assert.equal(
    classifyFcmProviderError(403, "PERMISSION_DENIED Firebase Cloud Messaging API has not been used"),
    "fcm_api_not_enabled",
  );
  assert.equal(
    classifyFcmProviderError(403, "PERMISSION_DENIED"),
    "fcm_permission_denied",
  );
  assert.equal(
    classifyFcmProviderError(404, "Requested entity was not found"),
    "fcm_unregistered",
  );
  assert.equal(
    classifyFcmProviderError(400, "INVALID_ARGUMENT"),
    "fcm_invalid_argument",
  );
  assert.equal(
    classifyFcmProviderError(401, "Unauthorized"),
    "firebase_oauth_failed",
  );
  assert.equal(
    classifyFcmProviderError(400, "SENDER_ID_MISMATCH"),
    "fcm_sender_id_mismatch",
  );

  const pushLib = read("src/lib/notifications/push.ts");
  assert.ok(pushLib.includes("inspectFirebaseServiceAccountShape"));
  assert.ok(pushLib.includes("normalizePrivateKeyPem"));
  assert.ok(pushLib.includes("providerErrorCategory") || pushLib.includes("failureCategory"));

  const canaryLib = read(
    "src/lib/workspace-canary/tenant-canary-push-delivery-canary.ts",
  );
  assert.ok(canaryLib.includes("providerErrorCategory"));
  assert.ok(canaryLib.includes("firebaseServiceAccountInspect"));
  assert.ok(canaryLib.includes("isRetryablePushDeliveryMarkerStatus"));
}

function testDryRunBeforeSend() {
  const lib = read(
    "src/lib/workspace-canary/tenant-canary-push-delivery-canary.ts",
  );
  const dryIdx = lib.indexOf('if (input.mode === "dry-run")');
  const sendIdx = lib.indexOf("await deliverPushToUsersNow");
  assert.ok(dryIdx > 0 && sendIdx > dryIdx);

  assert.equal(
    isTenantCanaryPushDeliveryDryRunReady({
      ok: true,
      status: "dry-run",
      authorizedRecipients: 1,
      houzzatAuthorized: 0,
      physicalTargets: 1,
      firebaseConfigured: true,
    }),
    true,
  );
  assert.equal(
    isTenantCanaryPushDeliveryDryRunReady({
      ok: true,
      status: "dry-run",
      authorizedRecipients: 2,
      houzzatAuthorized: 0,
      physicalTargets: 1,
      firebaseConfigured: true,
    }),
    false,
  );
  assert.equal(
    isTenantCanaryPushDeliveryDryRunReady({
      ok: true,
      status: "dry-run",
      authorizedRecipients: 1,
      houzzatAuthorized: 1,
      physicalTargets: 1,
      firebaseConfigured: true,
    }),
    false,
  );
}

function testCliRefusesLocalSend() {
  const cli = read("scripts/tenant-canary-push-delivery-canary.ts");
  assert.ok(cli.includes("--send"));
  assert.ok(cli.includes("REFUSE"));
  assert.ok(cli.includes("push-delivery"));
}

function testPackageScript() {
  const pkg = read("package.json");
  assert.ok(pkg.includes("tenant-canary-push-delivery:dry-run"));
  assert.ok(pkg.includes("tenant-canary-push-delivery:selftest"));
}

async function main() {
  testRouteGuards();
  testAuthorizationMatrix();
  testBodyParsing();
  testServerSideResolution();
  testMarkerSemantics();
  testPayloadAndAgentBOnly();
  testFcmErrorClassification();
  testDryRunBeforeSend();
  testCliRefusesLocalSend();
  testPackageScript();
  console.log("tenant-canary-push-delivery:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
