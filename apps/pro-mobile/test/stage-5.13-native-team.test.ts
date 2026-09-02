/**
 * Stage 5.13 — Native Team contract tests.
 * Run: node --import tsx apps/pro-mobile/test/stage-5.13-native-team.test.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderTeamInviteEmail } from "../../../src/lib/email/templates";
import {
  buildTeamCapabilities,
  // type-only usage via runtime checks on source
} from "../../../src/lib/mobile/v2/team";
import {
  workspaceAdminCanChangeRole,
  workspaceAdminCanInviteRole,
  workspaceAdminCanRemoveMember,
} from "../../../src/lib/workspace-team";
import { buildLegacyHouzzatBrand } from "../../../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../../../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_PRIMARY_COLOR,
} from "../../../src/lib/tenancy/test-fixtures/tenant-b-brand";

const REPO = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(REPO, rel), "utf8");
}

function run() {
  console.log("\n=== STAGE 5.13 — NATIVE TEAM ===\n");

  console.log("[1] Routes + no Prisma PDF/team schema changes...");
  {
    assert.ok(existsSync(join(REPO, "src/app/api/mobile/v2/team/route.ts")));
    assert.ok(
      existsSync(join(REPO, "src/app/api/mobile/v2/team/[membershipId]/route.ts")),
    );
    assert.ok(existsSync(join(REPO, "src/app/api/mobile/v2/team/invite/route.ts")));
    assert.ok(
      existsSync(
        join(REPO, "src/app/api/mobile/v2/team/invites/[inviteId]/resend/route.ts"),
      ),
    );
    assert.ok(
      existsSync(
        join(REPO, "src/app/api/mobile/v2/team/invites/[inviteId]/cancel/route.ts"),
      ),
    );
    assert.ok(
      existsSync(
        join(REPO, "src/app/api/mobile/v2/team/[membershipId]/remove/route.ts"),
      ),
    );
    assert.ok(
      existsSync(join(REPO, "src/app/api/mobile/v2/team/primary-agent/route.ts")),
    );
    const schema = read("prisma/schema.prisma");
    const start = schema.indexOf("model WorkspaceMember ");
    assert.ok(start > 0);
    assert.equal(schema.includes("model TeamMember"), false);
    console.log("  -> PASS");
  }

  console.log("[2] Auth matrix (canonical libs)...");
  {
    assert.equal(workspaceAdminCanInviteRole("OWNER", "ADMIN"), true);
    assert.equal(workspaceAdminCanInviteRole("OWNER", "AGENT"), true);
    assert.equal(workspaceAdminCanInviteRole("OWNER", "OWNER"), false);
    assert.equal(workspaceAdminCanInviteRole("ADMIN", "AGENT"), true);
    assert.equal(workspaceAdminCanInviteRole("ADMIN", "ADMIN"), false);
    assert.equal(workspaceAdminCanInviteRole("AGENT", "AGENT"), false);

    assert.equal(workspaceAdminCanChangeRole("OWNER", "ADMIN"), true);
    assert.equal(workspaceAdminCanChangeRole("OWNER", "OWNER"), false);
    assert.equal(workspaceAdminCanChangeRole("ADMIN", "AGENT"), true);
    assert.equal(workspaceAdminCanChangeRole("ADMIN", "ADMIN"), false);

    assert.equal(
      workspaceAdminCanRemoveMember("OWNER", "AGENT", "u2", "u1"),
      true,
    );
    assert.equal(
      workspaceAdminCanRemoveMember("OWNER", "OWNER", "u2", "u1"),
      false,
    );
    assert.equal(
      workspaceAdminCanRemoveMember("ADMIN", "ADMIN", "u2", "u1"),
      false,
    );
    assert.equal(
      workspaceAdminCanRemoveMember("AGENT", "AGENT", "u2", "u1"),
      false,
    );

    const ownerCaps = buildTeamCapabilities("OWNER");
    assert.deepEqual(ownerCaps.allowedInviteRoles, ["ADMIN", "AGENT"]);
    assert.equal(ownerCaps.canSetPrimaryAgent, true);
    const adminCaps = buildTeamCapabilities("ADMIN");
    assert.deepEqual(adminCaps.allowedInviteRoles, ["AGENT"]);
    assert.equal(adminCaps.canSetPrimaryAgent, false);
    const agentCaps = buildTeamCapabilities("AGENT");
    assert.equal(agentCaps.canInvite, false);
    console.log("  -> PASS");
  }

  console.log("[3] Endpoints reuse canonical libs + no token leak...");
  {
    const invite = read("src/app/api/mobile/v2/team/invite/route.ts");
    assert.ok(invite.includes("createWorkspaceInvite"));
    assert.ok(invite.includes("authorizeMobileWorkspaceAccess"));
    const remove = read(
      "src/app/api/mobile/v2/team/[membershipId]/remove/route.ts",
    );
    assert.ok(remove.includes("removeWorkspaceMember"));
    assert.ok(remove.includes("transferToUserId"));
    const patch = read("src/app/api/mobile/v2/team/[membershipId]/route.ts");
    assert.ok(patch.includes("suspendWorkspaceMember"));
    assert.ok(patch.includes("changeWorkspaceMemberRole"));
    const teamLib = read("src/lib/mobile/v2/team.ts");
    assert.ok(teamLib.includes("inviteId"));
    assert.equal(/\btoken\s*:/.test(teamLib), false);
    assert.equal(teamLib.includes("tokenHash"), false);
    console.log("  -> PASS");
  }

  console.log("[4] Invite email TENANT branding...");
  {
    const canaryBrand = workspaceBrandingRowToBrand(
      "tenant_b_test_workspace_id",
      TENANT_B_TEST_BRANDING_ROW,
    );
    const canary = renderTeamInviteEmail({
      orgName: "Workspace Raw",
      tenantDisplayName: canaryBrand.displayName,
      tenantLogoUrl: null,
      tenantPrimaryColor: canaryBrand.colors.primary,
      role: "AGENT",
      inviteUrl: "https://example.com/auth/invite/rawtokensecret",
      invitedByName: "Owner",
      expiresAt: new Date("2026-09-16"),
    });
    assert.match(canary.subject, new RegExp(TENANT_B_TEST_DISPLAY_NAME));
    assert.equal(canary.subject.includes("on Houzzat"), false);
    assert.ok(canary.html.includes(TENANT_B_TEST_DISPLAY_NAME));
    assert.ok(canary.html.includes(TENANT_B_TEST_PRIMARY_COLOR));
    assert.ok(canary.html.includes("Powered by HouzzatPRO"));
    assert.ok(canary.text.includes("Powered by HouzzatPRO"));
    assert.equal(canary.html.includes("rawtokensecret"), true); // URL only
    assert.equal(canary.html.includes("tokenHash"), false);

    const houzzatBrand = buildLegacyHouzzatBrand("ws_h");
    const houzzat = renderTeamInviteEmail({
      orgName: houzzatBrand.displayName,
      tenantDisplayName: houzzatBrand.displayName,
      tenantLogoUrl: "https://example.com/logo.png",
      tenantPrimaryColor: houzzatBrand.colors.primary,
      role: "ADMIN",
      inviteUrl: "https://example.com/auth/invite/abc",
      invitedByName: "Ali",
    });
    assert.match(houzzat.subject, /Houzzat/);
    assert.ok(houzzat.html.includes("https://example.com/logo.png"));
    assert.ok(houzzat.html.includes("Powered by HouzzatPRO"));

    const inviteSrc = read("src/lib/workspace-invite.ts");
    assert.ok(inviteSrc.includes("resolveWorkspaceBrand"));
    assert.ok(inviteSrc.includes("workspaceId: workspace.id"));
    console.log("  -> PASS");
  }

  console.log("[5] Remove does not rewrite CMA / ViewingTour authorship...");
  {
    const admin = read("src/lib/workspace-team-admin.ts");
    assert.ok(admin.includes("lead.updateMany"));
    assert.ok(admin.includes("agentTask.updateMany"));
    assert.ok(admin.includes("appointment.updateMany"));
    assert.equal(admin.includes("cmaReport"), false);
    assert.equal(admin.includes("viewingTour"), false);
    assert.ok(admin.includes("lead_reassigned"));
    console.log("  -> PASS");
  }

  console.log("[6] Neon HTTP transaction audit documented via prisma shim...");
  {
    const prisma = read("src/lib/prisma.ts");
    assert.ok(prisma.includes("runWorkerdNeonTransaction"));
    assert.ok(prisma.includes("PrismaNeonHttp cannot BEGIN/COMMIT"));
    const admin = read("src/lib/workspace-team-admin.ts");
    assert.ok(admin.includes("$transaction"));
    console.log("  -> PASS (Worker $transaction → one-shot WS client)");
  }

  console.log("[7] Native Team screen + cache...");
  {
    assert.ok(
      existsSync(join(REPO, "apps/pro-mobile/src/screens/TeamScreen.tsx")),
    );
    const screen = read("apps/pro-mobile/src/screens/TeamScreen.tsx");
    assert.ok(screen.includes("Invite Member"));
    assert.ok(screen.includes("transferToUserId"));
    assert.ok(screen.includes("clearTeamCache") || screen.includes("teamCache"));
    assert.equal(screen.includes("CLOUDFLARE_"), false);
    assert.equal(/invite.*token/i.test(screen) && screen.includes("tokenHash"), false);
    const agent = read("apps/pro-mobile/src/screens/AgentShell.tsx");
    assert.ok(agent.includes("TeamScreen"));
    assert.ok(agent.includes('activeUtility === "team"'));
    const cache = read("apps/pro-mobile/src/lib/lead-tab-cache.ts");
    assert.ok(cache.includes("teamCache"));
    assert.ok(cache.includes("clearTeamCache"));
    assert.ok(cache.includes('`${workspaceId}:team`') || cache.includes(":team"));
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.13 — ALL TESTS PASSED\n");
}

run();
