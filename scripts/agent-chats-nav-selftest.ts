/**
 * HouzzatPRO Chats navigation integration selftest.
 * Run: pnpm agent-chats-nav:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function parseNavEntries(src: string) {
  const start = src.indexOf("const NAV = [");
  const end = src.indexOf("] as const;", start);
  assert.ok(start >= 0 && end > start, "NAV array missing");
  const block = src.slice(start, end);
  const entries = [
    ...block.matchAll(
      /\{\s*href:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"[\s\S]*?\}/g,
    ),
  ].map((match) => ({ href: match[1]!, label: match[2]! }));
  assert.ok(entries.length >= 10, "NAV too short");
  return entries;
}

function parseMobileTabIndexes(src: string) {
  const start = src.indexOf("const MOBILE_TABS = [");
  const end = src.indexOf("] as const;", start);
  assert.ok(start >= 0 && end > start, "MOBILE_TABS missing");
  return [...src.slice(start, end).matchAll(/NAV\[(\d+)\]/g)].map((m) =>
    Number(m[1]),
  );
}

function testDesktopNavOrder() {
  const shell = read("src/components/agent/AgentShell.tsx");
  const nav = parseNavEntries(shell);
  const labels = nav.map((item) => item.label);
  const hrefs = nav.map((item) => item.href);
  const chatsIndex = labels.indexOf("Chats");
  const leadsIndex = labels.indexOf("Leads");
  assert.equal(labels[0], "Launchpad");
  assert.equal(labels[1], "Leads");
  assert.equal(labels[2], "Chats");
  assert.equal(chatsIndex, leadsIndex + 1);
  assert.equal(hrefs[chatsIndex], "/agent/chats");
  assert.ok(shell.includes("icon: MessageCircle"));
  assert.equal(labels.includes("Tasks"), true);
  assert.equal(labels.includes("Calendar"), true);
  assert.equal(labels.includes("Statistics"), true);
  assert.equal(labels.includes("Comms"), true);
  assert.equal(labels.includes("CMA"), true);
  assert.equal(labels.includes("Team"), true);
  assert.equal(labels.includes("Notifications"), true);
  assert.equal(labels.includes("Properties"), true);
  const comms = nav.find((item) => item.label === "Comms");
  assert.equal(comms?.href, "/agent/inbox");
  assert.ok(shell.includes('fullLabel: "Communications"'));
}

function testActiveState() {
  assert.equal(navActive("/agent/chats", "/agent/chats"), true);
  assert.equal(navActive("/agent/chats", "/agent/inbox"), false);
  assert.equal(navActive("/agent/inbox", "/agent/chats"), false);
  assert.equal(navActive("/agent/inbox", "/agent/inbox"), true);
  assert.equal(navActive("/agent/leads", "/agent/chats"), false);
  assert.equal(navActive("/agent", "/agent/chats"), false);
  assert.equal(navActive("/agent", "/agent", true), true);
  assert.equal(navActive("/agent/chats", "/agent", true), false);
  assert.equal(
    navActive("/agent/chats", "/agent/chats") &&
      !navActive("/agent/chats", "/agent/inbox"),
    true,
  );
  const shell = read("src/components/agent/AgentShell.tsx");
  assert.ok(shell.includes("function navActive("));
  assert.ok(shell.includes("usePathname()"));
  assert.equal(shell.includes("searchParams"), false);
}

function testMobilePrimaryTabs() {
  const shell = read("src/components/agent/AgentShell.tsx");
  const nav = parseNavEntries(shell);
  const indexes = parseMobileTabIndexes(shell);
  assert.deepEqual(
    indexes.map((i) => nav[i]?.label),
    ["Launchpad", "Leads", "Chats", "Calendar"],
  );
  assert.deepEqual(
    indexes.map((i) => nav[i]?.href),
    ["/agent", "/agent/leads", "/agent/chats", "/agent/appointments"],
  );
  assert.equal(
    indexes.map((i) => nav[i]?.label).includes("Statistics"),
    false,
  );
  assert.ok(nav.some((item) => item.label === "Statistics"));
  assert.equal(
    nav.find((item) => item.label === "Statistics")?.href,
    "/agent/statistics",
  );
  assert.ok(shell.includes("More"));
}

function testNoUnreadBadgeOrDuplicateChat() {
  const shell = read("src/components/agent/AgentShell.tsx");
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  const instant = read("src/components/agent/AgentMobileInstantShell.tsx");
  assert.equal(shell.includes("unread"), false);
  assert.equal(shell.includes("badge"), false);
  assert.equal(shell.includes("AgentChatsInbox"), false);
  assert.equal(shell.includes("useAgentChatThread"), false);
  assert.ok(inbox.includes("AgentChatTranscriptPane"));
  assert.ok(pane.includes("export function AgentChatTranscriptPane"));
  assert.equal(instant.includes("AgentChatsInbox"), false);
  assert.equal(instant.includes("useAgentChatThread"), false);
  assert.equal(instant.includes("AgentChatTranscriptPane"), false);
}

function testNativeInstantShellBlocker() {
  const shell = read("src/components/agent/AgentShell.tsx");
  const instant = read("src/components/agent/AgentMobileInstantShell.tsx");
  const nativeStart = shell.indexOf("if (isProNative)");
  assert.ok(nativeStart >= 0);
  const webReturn = shell.indexOf(
    '<div className="flex min-h-dvh bg-mist text-ink">',
    nativeStart,
  );
  const nativeBlock = shell.slice(nativeStart, webReturn);
  assert.ok(nativeBlock.includes("<AgentMobileInstantShell"));
  assert.equal(nativeBlock.includes("{children}"), false);
  assert.equal(instant.includes("/agent/chats"), false);
  assert.equal(instant.includes('label: "Chats"'), false);
  assert.ok(instant.includes('href="/agent/statistics"'));
  assert.ok(instant.includes('href="/agent/inbox"'));
}

function main() {
  testDesktopNavOrder();
  testActiveState();
  testMobilePrimaryTabs();
  testNoUnreadBadgeOrDuplicateChat();
  testNativeInstantShellBlocker();
  console.log("agent-chats-nav-selftest: ok");
}

void main();
