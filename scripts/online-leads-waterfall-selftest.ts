/**
 * Stage 3K.5.38 — Selftest for Online Leads Waterfall Collapse & Tenant Isolation.
 * Run: pnpm online-leads-waterfall:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ONLINE_MS } from "../src/lib/agent/hotness";
import { leadScopeWhere } from "../src/lib/crm-read-scope";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testOnlineMsConstant() {
  assert.equal(ONLINE_MS, 3 * 60 * 1000);
}

function testTenantScopingIntegrity() {
  const origReadScope = process.env.WORKSPACE_READ_SCOPE;
  const origDomainScope = process.env.TENANT_DOMAIN_SCOPE;

  try {
    process.env.WORKSPACE_READ_SCOPE = "workspace";
    process.env.TENANT_DOMAIN_SCOPE = "workspace";

    const dummyTenantCtx = {
      workspaceId: "ws_canary_123",
      organizationId: "org_legacy_456",
      organizationIds: ["org_legacy_456"],
      workspaceRole: "OWNER",
      workspaceName: "Canary Real Estate",
      isWorkspaceMember: true,
      isWorkspaceCrmAllowed: true,
      hasAmbiguousWorkspaceMembership: false,
      canSeeTeamLeads: true,
      user: { id: "usr_agent_789" },
    } as any;

    const scopeMine = leadScopeWhere(dummyTenantCtx, "mine");
    const scopeTeam = leadScopeWhere(dummyTenantCtx, "team");

    // Verify workspaceId is strictly preserved in where clause
    assert.equal(scopeTeam.workspaceId, "ws_canary_123");
    assert.equal(scopeMine.workspaceId, "ws_canary_123");
  } finally {
    process.env.WORKSPACE_READ_SCOPE = origReadScope;
    process.env.TENANT_DOMAIN_SCOPE = origDomainScope;
  }
}

function testSingleRoundTripWiring() {
  const launchpadDeferredSrc = read("src/lib/agent/launchpad-deferred.ts");

  // Verify findOnlineUserIds is not called inside loadLaunchpadOnlineLeads
  assert.ok(!launchpadDeferredSrc.includes("findOnlineUserIds()"));

  // Verify nested single-query relation filter is used
  assert.ok(launchpadDeferredSrc.includes("siteVisitors: {"));
  assert.ok(launchpadDeferredSrc.includes("some: {"));
  assert.ok(launchpadDeferredSrc.includes("lastSeenAt: { gte: since }"));
}

function runAll() {
  testOnlineMsConstant();
  testTenantScopingIntegrity();
  testSingleRoundTripWiring();
  console.log("online-leads-waterfall:selftest OK");
}

runAll();
