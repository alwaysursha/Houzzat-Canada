/**
 * Mobile Chats nav + API bridge guards + final nav locks.
 * Run: node --import tsx apps/pro-mobile/test/mobile-chats-nav.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_BOTTOM_NAV_LABELS,
  AGENT_BOTTOM_NAV_LABELS,
} from "../src/lib/drawer-nav-items";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRepo(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}
function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function main() {
  console.log("[1] Mobile chat API routes exist...");
  const routes = [
    "src/app/api/mobile/v2/conversations/route.ts",
    "src/app/api/mobile/v2/leads/[leadId]/conversation/route.ts",
    "src/app/api/mobile/v2/leads/[leadId]/conversation/messages/route.ts",
    "src/app/api/mobile/v2/leads/[leadId]/conversation/read/route.ts",
    "src/lib/mobile/v2/chat-context.ts",
  ];
  for (const rel of routes) {
    assert.ok(existsSync(join(ROOT, rel)), `missing ${rel}`);
  }

  console.log("[2] Routes reuse existing Conversation services...");
  const inbox = readRepo("src/app/api/mobile/v2/conversations/route.ts");
  assert.ok(inbox.includes("getAgentInboxListResponse"));
  assert.ok(inbox.includes("authorizeMobileChatContext"));
  assert.ok(inbox.includes("createPrismaAgentInboxListDb"));
  assert.equal(inbox.includes("prisma.leadEmailLog"), false);

  console.log("[3] Native ChatsScreen on Agent bottom nav...");
  const agent = readApp("src/screens/AgentShell.tsx");
  assert.ok(agent.includes("ChatsScreen"));
  assert.ok(agent.includes('selectTab("chats"'));
  assert.ok(agent.includes("chatsThreadOpen"));
  assert.ok(agent.includes("onThreadOpenChange={setChatsThreadOpen}"));
  const chatsTabStart = agent.indexOf('activeTab === "chats"');
  const chatsTabEnd = agent.indexOf('activeTab === "calendar"', chatsTabStart);
  assert.ok(chatsTabStart >= 0 && chatsTabEnd > chatsTabStart);
  const chatsTabBlock = agent.slice(chatsTabStart, chatsTabEnd);
  assert.ok(chatsTabBlock.includes("ChatsScreen"));
  assert.equal(chatsTabBlock.includes("CommunicationsScreen"), false);

  console.log("[3b] Chats thread direct hardwareBackPress registration...");
  const chats = readApp("src/screens/ChatsScreen.tsx");
  assert.ok(chats.includes("addAndroidHardwareBackListener"));
  assert.ok(chats.includes('"chats-thread"'));
  assert.ok(chats.includes("threadCloseRef"));

  console.log("[4] Agent nav labels locked (no Tasks on bottom)...");
  assert.deepEqual([...AGENT_BOTTOM_NAV_LABELS], [
    "Launchpad",
    "Leads",
    "Chats",
    "Calendar",
    "More",
  ]);
  const bottomStart = agent.indexOf("Bottom Navigation");
  const bottomEnd = agent.indexOf("NativeDrawer", bottomStart);
  const bottomBlock = agent.slice(bottomStart, bottomEnd);
  assert.equal(bottomBlock.includes('selectTab("tasks")'), false);

  console.log("[5] Admin nav labels locked...");
  assert.deepEqual([...ADMIN_BOTTOM_NAV_LABELS], [
    "Overview",
    "Lead Routing",
    "People",
    "CRM",
    "More",
  ]);
  const cc = readApp("src/screens/CommandCentreShell.tsx");
  assert.ok(cc.includes("LeadRoutingScreen"));
  assert.ok(existsSync(join(ROOT, "src/app/api/mobile/v2/lead-routing/route.ts")));
  const leadRouting = readRepo("src/app/api/mobile/v2/lead-routing/route.ts");
  assert.ok(leadRouting.includes("loadCrmRoutingSettingsForWorkspace"));

  console.log("[6] Crash guard: VIBRATE permission...");
  const manifest = readApp("android/app/src/main/AndroidManifest.xml");
  assert.ok(manifest.includes("android.permission.VIBRATE"));

  console.log("[7] Sign-in: no platform admin link...");
  const signIn = readApp("src/screens/SignInScreen.tsx");
  assert.equal(signIn.includes("Platform admin sign-in"), false);

  console.log("\n[mobile-chats-nav] ALL PASS\n");
}

main();
