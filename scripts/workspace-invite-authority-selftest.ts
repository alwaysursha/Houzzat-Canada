/**
 * Stage 3I.2 — Team invite authority isolation (workspace vs legacy).
 * Run: pnpm workspace-invite-authority:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveTeamAuthority,
  usesWorkspaceTeamScope,
  workspaceTeamCanManage,
} from "../src/lib/workspace-team";
import type { AgentOrgContext } from "../src/lib/agent";
import {
  createWorkspaceInviteRawToken,
  hashWorkspaceInviteToken,
} from "../src/lib/workspace-invite-token";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function stubCtx(
  partial: Partial<AgentOrgContext> &
    Pick<AgentOrgContext, "organizationId" | "workspaceId">,
): AgentOrgContext {
  return {
    user: { id: "u1", email: "a@b.c", name: "A", role: "AGENT" } as AgentOrgContext["user"],
    organizationId: partial.organizationId,
    organizationName: "Org",
    organizationIds: [partial.organizationId],
    membershipRole: "OWNER",
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId: partial.workspaceId,
    workspaceRole: partial.workspaceRole ?? "OWNER",
    workspaceMemberStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
    workspaceName: "Houzzat",
    isWorkspaceMember: Boolean(partial.workspaceId),
    isWorkspaceCrmAllowed: Boolean(partial.workspaceId),
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: partial.canManageWorkspace ?? true,
    readScope: "shadow",
    ...partial,
  };
}

function testResolverFailClosed() {
  process.env.WORKSPACE_TEAM_SCOPE = "workspace";
  const missing = resolveTeamAuthority(
    stubCtx({ organizationId: "org1", workspaceId: null }),
  );
  assert.equal(missing.mode, "unavailable");
  assert.equal(
    (missing as { reason: string }).reason,
    "WORKSPACE_CONTEXT_REQUIRED",
  );
  assert.equal(
    usesWorkspaceTeamScope(stubCtx({ organizationId: "org1", workspaceId: null })),
    false,
  );
  assert.equal(
    workspaceTeamCanManage(stubCtx({ organizationId: "org1", workspaceId: null })),
    false,
  );

  const ok = resolveTeamAuthority(
    stubCtx({ organizationId: "org1", workspaceId: "ws_houzzat" }),
  );
  assert.deepEqual(ok, { mode: "workspace", workspaceId: "ws_houzzat" });
}

function testResolverLegacy() {
  process.env.WORKSPACE_TEAM_SCOPE = "legacy";
  const legacy = resolveTeamAuthority(
    stubCtx({ organizationId: "org1", workspaceId: null }),
  );
  assert.deepEqual(legacy, { mode: "legacy", organizationId: "org1" });

  // Even with a workspaceId, legacy flag stays organization authority.
  const legacyWithWs = resolveTeamAuthority(
    stubCtx({ organizationId: "org1", workspaceId: "ws_houzzat" }),
  );
  assert.deepEqual(legacyWithWs, { mode: "legacy", organizationId: "org1" });
  delete process.env.WORKSPACE_TEAM_SCOPE;
  assert.equal(resolveTeamAuthority(stubCtx({ organizationId: "org1", workspaceId: "ws" })).mode, "legacy");
}

function testRouteFailClosedNoLegacyFallback() {
  const route = read("src/app/api/agent/team/route.ts");
  assert.ok(route.includes("resolveTeamAuthority"));
  assert.ok(route.includes("WORKSPACE_CONTEXT_REQUIRED"));
  assert.ok(route.includes('scope: "workspace"'));

  const postIdx = route.indexOf("export async function POST");
  const post = route.slice(postIdx);
  // Fail-closed before any org invite create
  const unavailableIdx = post.indexOf('mode === "unavailable"');
  const orgCreateIdx = post.indexOf("organizationInvite.create");
  assert.ok(unavailableIdx >= 0);
  assert.ok(orgCreateIdx > unavailableIdx);

  // Workspace branch must not create OrganizationInvite
  const wsHandlerStart = route.indexOf("async function handleWorkspaceTeamPost");
  const wsHandler = route.slice(wsHandlerStart, postIdx);
  assert.ok(wsHandler.includes("createWorkspaceInvite"));
  assert.ok(!wsHandler.includes("organizationInvite"));
  assert.ok(!wsHandler.includes("organizationMembership"));
}

function testPageFailClosed() {
  const page = read("src/app/(agent)/agent/team/page.tsx");
  assert.ok(page.includes("resolveTeamAuthority"));
  assert.ok(page.includes('mode === "unavailable"'));
  assert.ok(page.includes('redirect("/agent/workspace")'));
  // Must not silently render org Team when workspace flag is on without context
  const unavailBlock = page.slice(
    page.indexOf('mode === "unavailable"'),
    page.indexOf('mode === "workspace"'),
  );
  assert.ok(unavailBlock.includes("redirect"));
  assert.ok(!unavailBlock.includes("organizationMembership"));
}

function testHashedTokenIsolation() {
  const raw = createWorkspaceInviteRawToken();
  const hash = hashWorkspaceInviteToken(raw);
  assert.notEqual(raw, hash);
  assert.equal(hashWorkspaceInviteToken(raw), hash);
  // Org tokens are cuid-shaped; hashing raw workspace token must not be used as org lookup key by accident
  assert.notEqual(hash.length, 25);
}

function testAcceptStillFlatAndWorkspaceFirst() {
  const accept = read("src/app/api/auth/invite/[token]/route.ts");
  const post = accept.slice(accept.indexOf("export async function POST"));
  assert.ok(post.includes("loadWorkspaceInvitePreview"));
  assert.ok(post.includes("acceptWorkspaceInvite"));
  const wsPreviewIdx = post.indexOf("loadWorkspaceInvitePreview");
  const orgAcceptIdx = post.indexOf("acceptOrganizationInvite");
  assert.ok(wsPreviewIdx >= 0 && orgAcceptIdx > wsPreviewIdx);

  const ws = read("src/lib/workspace-invite.ts");
  assert.ok(ws.includes("createAgentAccountFromInvite"));
  assert.ok(!ws.includes("agentProfile: { create"));
  assert.ok(!ws.includes("organizationMembership"));
  assert.ok(!ws.includes("organizationInvite"));
}

function testClientPostsNoWorkspaceAuthority() {
  const client = read("src/components/agent/TeamAdminClient.tsx");
  assert.ok(client.includes('JSON.stringify({ email, role })'));
  assert.ok(!client.includes("workspaceId"));
  assert.ok(!client.includes("organizationId"));
  assert.ok(client.includes('json.scope === "workspace"'));
}

async function main() {
  testResolverFailClosed();
  testResolverLegacy();
  testRouteFailClosedNoLegacyFallback();
  testPageFailClosed();
  testHashedTokenIsolation();
  testAcceptStillFlatAndWorkspaceFirst();
  testClientPostsNoWorkspaceAuthority();
  delete process.env.WORKSPACE_TEAM_SCOPE;
  console.log("workspace-invite-authority:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
