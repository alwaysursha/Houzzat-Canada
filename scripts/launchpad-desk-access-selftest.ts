/**
 * Default desk + Launchpad identity + Access Launchpad / Switch Back.
 * Run: pnpm exec tsx scripts/launchpad-desk-access-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DESK_AGENT_ALL, DESK_AGENT_COOKIE } from "../src/lib/agent/desk-constants";
import {
  launchpadIdentityPresentation,
  resolveDeskViewFromFieldAgents,
} from "../src/lib/agent/resolve-desk-view";
import { collectAuthCookieNamesToClear } from "../src/lib/auth/logout-cookies";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const adminId = "admin-agent-1";
const demoId = "demo-agent-2";
const fieldAgents = [
  { id: adminId, name: "Ali Syed", email: "ali@example.com" },
  { id: demoId, name: "Demo Agent", email: "demo@example.com" },
];

function testDefaultDeskForAdminAgent() {
  const missing = resolveDeskViewFromFieldAgents({
    userId: adminId,
    canSeeTeamLeads: true,
    deskCookie: null,
    fieldAgents,
  });
  assert.equal(missing.deskAgentId, adminId);
  assert.equal(missing.deskLabel, "Ali Syed");

  const empty = resolveDeskViewFromFieldAgents({
    userId: adminId,
    canSeeTeamLeads: true,
    deskCookie: "  ",
    fieldAgents,
  });
  assert.equal(empty.deskAgentId, adminId);

  const explicitTeam = resolveDeskViewFromFieldAgents({
    userId: adminId,
    canSeeTeamLeads: true,
    deskCookie: DESK_AGENT_ALL,
    fieldAgents,
  });
  assert.equal(explicitTeam.deskAgentId, null);
  assert.equal(explicitTeam.deskLabel, "Team overview");

  const other = resolveDeskViewFromFieldAgents({
    userId: adminId,
    canSeeTeamLeads: true,
    deskCookie: demoId,
    fieldAgents,
  });
  assert.equal(other.deskAgentId, demoId);
  assert.equal(other.deskLabel, "Demo Agent");

  const stale = resolveDeskViewFromFieldAgents({
    userId: adminId,
    canSeeTeamLeads: true,
    deskCookie: "other-tenant-agent",
    fieldAgents,
  });
  assert.equal(stale.deskAgentId, adminId);
}

function testOrdinaryAgentIgnoresCookie() {
  const desk = resolveDeskViewFromFieldAgents({
    userId: demoId,
    canSeeTeamLeads: false,
    deskCookie: adminId,
    fieldAgents,
  });
  assert.equal(desk.deskAgentId, demoId);
  assert.equal(desk.deskLabel, "My desk");
}

function testIdentityPresentation() {
  assert.deepEqual(
    launchpadIdentityPresentation({
      viewerUserId: adminId,
      deskAgentId: adminId,
      deskLabel: "Ali Syed",
    }),
    { mode: "own", text: "My Launchpad — Ali Syed" },
  );
  assert.deepEqual(
    launchpadIdentityPresentation({
      viewerUserId: adminId,
      deskAgentId: demoId,
      deskLabel: "Demo Agent",
    }),
    { mode: "other", text: "Viewing Demo Agent's Launchpad" },
  );
  assert.deepEqual(
    launchpadIdentityPresentation({
      viewerUserId: adminId,
      deskAgentId: null,
      deskLabel: "Team overview",
    }),
    { mode: "team", text: "Team Overview" },
  );
}

function testBannerRemovedFromAgentLayout() {
  const layout = read("src/app/(agent)/agent/layout.tsx");
  assert.equal(layout.includes("AgentDeferredLeaderBanner"), false);
  assert.equal(layout.includes("TeamLeaderDeskBanner"), false);

  const page = read("src/app/(agent)/agent/page.tsx");
  assert.ok(page.includes("LaunchpadDeferredQuickModules"));
  assert.ok(page.includes("resolveDeskView"));
  assert.ok(page.includes("DESK_AGENT_COOKIE"));
  assert.ok(page.includes("LaunchpadDeskIdentity"));
  assert.ok(page.includes("launchpadIdentityPresentation"));
  assert.equal(page.includes("TeamLeaderDeskBanner"), false);
}

function testSwitchBackUi() {
  const identity = read("src/components/agent/LaunchpadDeskIdentity.tsx");
  assert.ok(identity.includes("Switch Back to Admin"));
  assert.ok(identity.includes('"/api/agent/desk"'));
  assert.ok(identity.includes("deskAgentId: ownUserId"));
  assert.ok(identity.includes('staffHardNavigate("/agent")'));
  assert.ok(identity.includes('mode === "other"'));
}

function testAccessLaunchpadUiGating() {
  const team = read("src/components/agent/TeamAdminClient.tsx");
  assert.ok(team.includes("Access Launchpad"));
  assert.ok(team.includes("accessMemberLaunchpad"));
  assert.ok(team.includes('staffHardNavigate("/agent")'));
  assert.ok(team.includes('"/api/agent/desk"'));
  assert.ok(team.includes("deskAgentId: member.user.id"));
  assert.ok(team.includes("canManage &&"));
  assert.ok(team.includes('m.role === "AGENT"'));
  assert.ok(team.includes("m.user.agentActive"));
  assert.ok(team.includes('{canManage ? "Edit profile" : "View profile"}'));
}

function testDeskApiServerAuth() {
  const desk = read("src/app/api/agent/desk/route.ts");
  assert.ok(desk.includes("requireAgentContextFromRequest"));
  assert.ok(desk.includes("!ctx.canSeeTeamLeads"));
  assert.ok(desk.includes("status: 403"));
  assert.ok(desk.includes("listTeamAgents"));
  assert.ok(desk.includes('a.role === "AGENT"'));
  assert.ok(desk.includes("setDeskAgentCookie"));
  assert.equal(desk.includes("signIn("), false);
  assert.equal(desk.includes("impersonat"), false);
}

function testLogoutClearsDeskCookie() {
  const names = collectAuthCookieNamesToClear("");
  assert.ok(names.includes(DESK_AGENT_COOKIE));

  const logoutCookies = read("src/lib/auth/logout-cookies.ts");
  assert.ok(logoutCookies.includes("DESK_AGENT_COOKIE"));
}

function testHandoffResetsOwnDesk() {
  const route = read("src/app/api/mobile/workspace-handoff/route.ts");
  assert.ok(route.includes("setDeskAgentCookie"));
  assert.ok(route.includes("peeked.userId"));

  const peek = read("src/lib/mobile/mobile-workspace-handoff.ts");
  assert.ok(peek.includes("userId: looked.parsed.userId"));
}

function testFreshLoginWebReset() {
  const signIn = read("src/components/auth/SignInForm.tsx");
  assert.ok(signIn.includes('"/api/agent/desk"'));
  assert.ok(signIn.includes("deskAgentId: staffUserId"));
}

function testDeskResolutionWiring() {
  const brokerage = read("src/lib/agent/brokerage.ts");
  assert.ok(brokerage.includes("resolveDeskView"));
  assert.ok(brokerage.includes("resolveDeskViewFromFieldAgents"));
  assert.ok(brokerage.includes("canSeeTeamLeads"));
  assert.ok(brokerage.includes("deskCookie"));

  const adminPicker = read("src/components/admin/AdminDeskPicker.tsx");
  assert.ok(adminPicker.includes('"/api/agent/desk"'));
  assert.ok(adminPicker.includes('staffHardNavigate("/agent")'));
  assert.ok(adminPicker.includes("Team overview"));

  const agentShell = read("src/components/agent/AgentShell.tsx");
  assert.ok(agentShell.includes("Command Centre"));
  assert.ok(agentShell.includes('href="/admin"'));
}

function main() {
  testDefaultDeskForAdminAgent();
  testOrdinaryAgentIgnoresCookie();
  testIdentityPresentation();
  testBannerRemovedFromAgentLayout();
  testSwitchBackUi();
  testAccessLaunchpadUiGating();
  testDeskApiServerAuth();
  testLogoutClearsDeskCookie();
  testHandoffResetsOwnDesk();
  testFreshLoginWebReset();
  testDeskResolutionWiring();
  console.log("launchpad-desk-access-selftest: ok");
}

main();
