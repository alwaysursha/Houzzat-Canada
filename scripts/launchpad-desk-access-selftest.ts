/**
 * Launchpad banner removal + admin Access Launchpad desk switching.
 * Run: pnpm exec tsx scripts/launchpad-desk-access-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testBannerRemovedFromAgentLayout() {
  const layout = read("src/app/(agent)/agent/layout.tsx");
  assert.equal(layout.includes("AgentDeferredLeaderBanner"), false);
  assert.equal(layout.includes("TeamLeaderDeskBanner"), false);

  const page = read("src/app/(agent)/agent/page.tsx");
  assert.ok(page.includes("LaunchpadDeferredQuickModules"));
  assert.ok(page.includes("resolveDeskView"));
  assert.ok(page.includes("DESK_AGENT_COOKIE"));
  assert.equal(page.includes("TeamLeaderDeskBanner"), false);
}

function testAccessLaunchpadUiGating() {
  const team = read("src/components/agent/TeamAdminClient.tsx");
  assert.ok(team.includes("Access Launchpad"));
  assert.ok(team.includes("accessMemberLaunchpad"));
  assert.ok(team.includes('staffHardNavigate("/agent")'));
  assert.ok(team.includes('"/api/agent/desk"'));
  assert.ok(team.includes('deskAgentId: member.user.id'));
  // Admin-only UI gate
  assert.ok(team.includes("canManage &&"));
  assert.ok(team.includes('m.role === "AGENT"'));
  assert.ok(team.includes("m.user.agentActive"));
  // Ordinary agents keep View profile path without Access Launchpad when !canManage
  assert.ok(team.includes('{canManage ? "Edit profile" : "View profile"}'));
}

function testDeskApiServerAuth() {
  const desk = read("src/app/api/agent/desk/route.ts");
  assert.ok(desk.includes("requireAgentContextFromRequest"));
  assert.ok(desk.includes("!ctx.canSeeTeamLeads"));
  assert.ok(desk.includes('status: 403'));
  assert.ok(desk.includes("listTeamAgents"));
  assert.ok(desk.includes('a.role === "AGENT"'));
  assert.ok(desk.includes("DESK_AGENT_COOKIE"));
  // No session/user swap
  assert.equal(desk.includes("signIn("), false);
  assert.equal(desk.includes("impersonat"), false);
}

function testDeskResolutionPreserved() {
  const brokerage = read("src/lib/agent/brokerage.ts");
  assert.ok(brokerage.includes("resolveDeskView"));
  assert.ok(brokerage.includes("canSeeTeamLeads"));
  assert.ok(brokerage.includes("deskCookie"));

  const adminPicker = read("src/components/admin/AdminDeskPicker.tsx");
  assert.ok(adminPicker.includes('"/api/agent/desk"'));
  assert.ok(adminPicker.includes('staffHardNavigate("/agent")'));

  const agentShell = read("src/components/agent/AgentShell.tsx");
  assert.ok(agentShell.includes("Command Centre"));
  assert.ok(agentShell.includes('href="/admin"'));
}

function main() {
  testBannerRemovedFromAgentLayout();
  testAccessLaunchpadUiGating();
  testDeskApiServerAuth();
  testDeskResolutionPreserved();
  console.log("launchpad-desk-access-selftest: ok");
}

main();
