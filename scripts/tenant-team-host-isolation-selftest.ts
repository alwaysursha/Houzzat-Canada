/**
 * Stage 3K.5.8G.1 — Team roster hostname isolation selftest.
 * Run: pnpm tenant-team-host-isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANARY_LEAD_CUTOVER_FLAG_EXPECTATIONS,
  assertCanaryLeadCutoverBundle,
  isUnsafePartialCanaryLeadCutover,
  parseJsoncVar,
} from "./lib/canary-lead-cutover-config";
import { resolveTeamAuthority } from "../src/lib/workspace-team";
import type { AgentOrgContext } from "../src/lib/agent";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function ctxFixture(
  overrides: Partial<AgentOrgContext> = {},
): AgentOrgContext {
  return {
    user: {
      id: "owner_b",
      email: "hadia_owner@yahoo.com",
      name: "Owner B",
      image: null,
      phone: null,
      role: "ADMIN",
    },
    organizationId: "demo-agent-org",
    organizationName: "Demo",
    organizationIds: ["demo-agent-org"],
    membershipRole: "OWNER",
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId: "ws_tenant_canary",
    workspaceRole: "OWNER",
    workspaceMemberStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
    workspaceName: "Tenant Canary",
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: true,
    readScope: "workspace",
    ...overrides,
  };
}

function withWorkspaceFlags(fn: () => void) {
  const prev = {
    read: process.env.WORKSPACE_READ_SCOPE,
    team: process.env.WORKSPACE_TEAM_SCOPE,
  };
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  process.env.WORKSPACE_TEAM_SCOPE = "workspace";
  try {
    fn();
  } finally {
    if (prev.read === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev.read;
    if (prev.team === undefined) delete process.env.WORKSPACE_TEAM_SCOPE;
    else process.env.WORKSPACE_TEAM_SCOPE = prev.team;
  }
}

function testTeamAuthorityUsesWorkspaceOnCanaryFlags() {
  withWorkspaceFlags(() => {
    const authority = resolveTeamAuthority(ctxFixture());
    assert.equal(authority.mode, "workspace");
    if (authority.mode === "workspace") {
      assert.equal(authority.workspaceId, "ws_tenant_canary");
    }
  });
}

function testTeamAuthorityFailsClosedWithoutWorkspace() {
  withWorkspaceFlags(() => {
    const authority = resolveTeamAuthority(ctxFixture({ workspaceId: null }));
    assert.equal(authority.mode, "unavailable");
  });
}

function testLegacyTeamWhenFlagsUnset() {
  const prev = {
    read: process.env.WORKSPACE_READ_SCOPE,
    team: process.env.WORKSPACE_TEAM_SCOPE,
  };
  delete process.env.WORKSPACE_READ_SCOPE;
  delete process.env.WORKSPACE_TEAM_SCOPE;
  try {
    const authority = resolveTeamAuthority(ctxFixture());
    assert.equal(authority.mode, "legacy");
    if (authority.mode === "legacy") {
      assert.equal(authority.organizationId, "demo-agent-org");
    }
  } finally {
    if (prev.read === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev.read;
    if (prev.team === undefined) delete process.env.WORKSPACE_TEAM_SCOPE;
    else process.env.WORKSPACE_TEAM_SCOPE = prev.team;
  }
}

function testReadScopeWithoutTeamScopeStillWorkspaceTeam() {
  const prev = {
    read: process.env.WORKSPACE_READ_SCOPE,
    team: process.env.WORKSPACE_TEAM_SCOPE,
  };
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  delete process.env.WORKSPACE_TEAM_SCOPE;
  try {
    const authority = resolveTeamAuthority(ctxFixture());
    assert.equal(authority.mode, "workspace");
  } finally {
    if (prev.read === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev.read;
    if (prev.team === undefined) delete process.env.WORKSPACE_TEAM_SCOPE;
    else process.env.WORKSPACE_TEAM_SCOPE = prev.team;
  }
}

function testCanaryWranglerBundle() {
  const canary = read("wrangler.tenant-canary.jsonc");
  assertCanaryLeadCutoverBundle(canary);
  assert.equal(
    parseJsoncVar(canary, "WORKSPACE_TEAM_SCOPE"),
    CANARY_LEAD_CUTOVER_FLAG_EXPECTATIONS.WORKSPACE_TEAM_SCOPE,
  );
  assert.equal(isUnsafePartialCanaryLeadCutover(canary), false);
}

function testStructuralWiring() {
  const teamPage = read("src/app/(agent)/agent/team/page.tsx");
  const teamApi = read("src/app/api/agent/team/route.ts");
  const teamLib = read("src/lib/workspace-team.ts");

  assert.ok(teamPage.includes("requireAgentPageContext"));
  assert.ok(teamPage.includes('authority.mode === "workspace"'));
  assert.ok(teamPage.includes("getWorkspaceTeamPayload"));
  assert.ok(teamApi.includes("getWorkspaceTeamPayload"));
  assert.ok(teamApi.includes("workspaceMember.findFirst"));
  assert.ok(teamLib.includes("isWorkspaceReadMode"));
  assert.ok(teamLib.includes('status: "ACTIVE"'));
  assert.ok(teamLib.includes("workspaceId: ctx.workspaceId"));
}

function main() {
  testTeamAuthorityUsesWorkspaceOnCanaryFlags();
  testTeamAuthorityFailsClosedWithoutWorkspace();
  testLegacyTeamWhenFlagsUnset();
  testReadScopeWithoutTeamScopeStillWorkspaceTeam();
  testCanaryWranglerBundle();
  testStructuralWiring();
  console.log("tenant-team-host-isolation:selftest: ok");
}

main();
