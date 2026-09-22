/**
 * Phase 0 — strict tenant identity containment.
 * Login must not create/reuse a Lead in another workspace.
 *
 * Run: pnpm customer-tenant-join:selftest
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  customerWorkspaceActivityWhere,
  customerWorkspaceLeadWhere,
} from "../src/lib/account/customer-workspace-scope";
import { customerOnlineLeadWhere } from "../src/lib/notifications/staff-events";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testJoinRemovedFromAuth() {
  const auth = read("src/lib/auth.ts");
  assert.equal(
    existsSync(join(root, "src/lib/auth/join-tenant-workspace-lead.ts")),
    false,
    "join-tenant-workspace-lead.ts must be removed",
  );
  assert.equal(
    auth.includes("joinConsumerToTenantWorkspaceLead"),
    false,
    "auth jwt must not join a consumer to a tenant Lead",
  );
  assert.equal(
    auth.includes("join-tenant-workspace-lead"),
    false,
    "auth must not import join-tenant-workspace-lead",
  );
  assert.equal(
    auth.includes("captureWebsiteLead"),
    false,
    "auth sign-in must not call captureWebsiteLead",
  );
  assert.ok(
    auth.includes("scheduleNotifyCustomerCameOnlineFromSignIn"),
    "online notify on sign-in remains",
  );
  assert.ok(
    auth.includes("onlineWorkspaceId") ||
      auth.includes("resolveRequestTenancy"),
    "online notify must still resolve hostname workspace without Lead join",
  );
  console.log("[phase0] auth join removed... PASS");
}

function testDefenseInDepthKept() {
  const scope = read("src/lib/account/customer-workspace-scope.ts");
  const notify = read("src/lib/notifications/staff-events.ts");
  const resolver = read("src/lib/agent/resolve-workspace-lead.ts");
  const activity = read("src/app/(account)/account/activity/page.tsx");
  const boundary = read("src/lib/tenancy/tenant-auth-boundary.ts");

  assert.ok(scope.includes("customerWorkspaceLeadWhere"));
  assert.ok(activity.includes("customerWorkspaceLeadWhere"));
  assert.ok(notify.includes("customerOnlineLeadWhere"));
  assert.ok(notify.includes("opts?.workspaceId === null"));
  assert.ok(resolver.includes("activityOnReuse"));
  assert.ok(boundary.includes("isConsumerRole"));
  assert.ok(boundary.includes("WorkspaceMember"));
  assert.ok(
    boundary.includes("user.workspaceId === resolvedWorkspaceId"),
    "Phase 3: consumers must match hostname workspaceId",
  );

  assert.deepEqual(customerWorkspaceLeadWhere("c1", "ws_a"), {
    customerId: "c1",
    workspaceId: "ws_a",
  });
  assert.equal(
    customerWorkspaceActivityWhere("c1", "ws_b").lead.workspaceId,
    "ws_b",
  );
  assert.deepEqual(customerOnlineLeadWhere("c1", "ws_maria"), {
    customerId: "c1",
    assignedAgentId: { not: null },
    workspaceId: "ws_maria",
  });

  console.log("[phase0] defense-in-depth kept... PASS");
}

function testWorkspaceScopedSignup() {
  const route = read("src/app/api/auth/sign-up/route.ts");
  assert.ok(route.includes("findTenantUserIdByEmail"));
  assert.ok(route.includes("resolveRequestTenancy"));
  assert.ok(route.includes("workspaceId"));
  assert.ok(route.includes("status: 409") || route.includes("duplicateEmailResponse"));
  assert.ok(route.includes("EXISTING_ACCOUNT_SIGN_IN_MESSAGE"));
  assert.equal(
    route.includes("prisma.user.findUnique"),
    false,
    "signup must not use global email findUnique",
  );
  console.log("[phase3] workspace-scoped signup... PASS");
}

testJoinRemovedFromAuth();
testDefenseInDepthKept();
testWorkspaceScopedSignup();
console.log("customer-tenant-join-selftest (phase0+phase3 containment): ok");
