/**
 * HouzzatPRO Chats Inbox UI selftest.
 * Run: pnpm agent-chats-inbox-ui:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openLeadProfileHref } from "../src/lib/agent/lead-profile-query";
import {
  applyInboxMarkRead,
  applyInboxSentMessage,
  CHATS_INBOX_API_ROUTE,
  CHATS_INBOX_PAGE_HREF,
  CHATS_INBOX_SEARCH_DEBOUNCE_MS,
  chatsInboxListUrl,
  chatsPageHref,
  chatsViewLeadHref,
  inboxEmptyCopy,
  mergeInboxRows,
  moveInboxRowToTop,
  readChatsLeadParam,
  shouldAutoSelectInboxLead,
  type ChatsInboxRow,
} from "../src/lib/agent/chats-inbox-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function row(
  overrides: Partial<ChatsInboxRow> & { conversationId: string; leadId: string },
): ChatsInboxRow {
  return {
    status: "OPEN",
    lastMessageAt: "2026-09-17T12:00:00.000Z",
    lead: {
      displayName: "Jordan Lee",
      email: "jordan@example.com",
      phone: "4165550100",
      avatarUrl: null,
      pipelineStatus: "NEW_LEAD",
    },
    assignment: {
      assignedAgentId: "agent-1",
      isAssignedToViewer: true,
    },
    latestMessage: {
      id: "m1",
      channel: "CHAT",
      kind: "TEXT",
      senderKind: "CUSTOMER",
      senderName: "Jordan Lee",
      preview: "Hello there",
      createdAt: "2026-09-17T12:00:00.000Z",
    },
    unread: {
      count: 2,
      cutoffMode: "agent_cursor",
      agentCursorValid: true,
    },
    viewer: {
      canSend: true,
      canMarkRead: true,
    },
    ...overrides,
  };
}

function testCanonicalListApi() {
  assert.equal(CHATS_INBOX_API_ROUTE, "/api/agent/conversations");
  assert.equal(chatsInboxListUrl({}), "/api/agent/conversations");
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(inbox.includes("chatsInboxListUrl"));
  assert.ok(inbox.includes("CHATS_INBOX_API_ROUTE"));
  assert.ok(inbox.includes("fetchV2Json"));
  assert.equal(inbox.includes("leadScopeWhere"), false);
}

function testSearchAndFilterParams() {
  assert.equal(
    chatsInboxListUrl({ q: " jordan " }),
    "/api/agent/conversations?q=jordan",
  );
  assert.equal(
    chatsInboxListUrl({ filter: "all" }),
    "/api/agent/conversations",
  );
  assert.equal(
    chatsInboxListUrl({ filter: "unread" }),
    "/api/agent/conversations?filter=unread",
  );
  assert.equal(
    chatsInboxListUrl({ q: "ali", filter: "unread" }),
    "/api/agent/conversations?q=ali&filter=unread",
  );
  assert.equal(CHATS_INBOX_SEARCH_DEBOUNCE_MS, 300);
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(inbox.includes("CHATS_INBOX_SEARCH_DEBOUNCE_MS"));
  assert.ok(inbox.includes("Search name, email, or phone"));
  assert.ok(inbox.includes('label="All"'));
  assert.ok(inbox.includes('label="Unread"'));
  assert.equal(inbox.includes("Starred"), false);
  assert.equal(inbox.includes("conversations.filter("), false);
}

function testCursorPaginationAndDedup() {
  assert.equal(
    chatsInboxListUrl({ cursor: "abc" }),
    "/api/agent/conversations?cursor=abc",
  );
  const first = row({ conversationId: "c1", leadId: "l1" });
  const dup = row({ conversationId: "c1", leadId: "l1", lastMessageAt: "later" });
  const extra = row({ conversationId: "c2", leadId: "l2" });
  const merged = mergeInboxRows([first], [dup, extra]);
  assert.deepEqual(
    merged.map((item) => item.conversationId),
    ["c1", "c2"],
  );
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(inbox.includes("mergeInboxRows"));
  assert.ok(inbox.includes("Load more"));
  assert.ok(inbox.includes("nextCursor"));
}

function testSelectedLeadQueryAndNoAutoSelect() {
  assert.equal(CHATS_INBOX_PAGE_HREF, "/agent/chats");
  assert.equal(chatsPageHref(null), "/agent/chats");
  assert.equal(chatsPageHref("lead-9"), "/agent/chats?lead=lead-9");
  assert.equal(readChatsLeadParam("?lead=lead-9"), "lead-9");
  assert.equal(readChatsLeadParam(new URLSearchParams("q=x")), null);
  assert.equal(shouldAutoSelectInboxLead(), false);
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  const page = read("src/app/(agent)/agent/chats/page.tsx");
  assert.ok(page.includes("AgentChatsInbox"));
  assert.ok(inbox.includes("readChatsLeadParam"));
  assert.ok(inbox.includes("chatsPageHref"));
  assert.ok(inbox.includes("Select a conversation"));
  assert.equal(inbox.includes("conversations[0]"), false);
  assert.equal(inbox.includes("rows[0]"), false);
  assert.equal(inbox.includes("autoSelect"), false);
}

function testListLoadDoesNotMarkRead() {
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.equal(inbox.includes("/conversation/read"), false);
  assert.equal(inbox.includes("V2_CHAT_READ_ROUTE"), false);
  assert.equal(inbox.includes("v2ChatReadUrl"), false);
  assert.ok(inbox.includes("useAgentChatThread"));
  const hook = read("src/components/agent/chat/useAgentChatThread.ts");
  assert.ok(hook.includes("shouldMarkV2ChatRead"));
  assert.ok(hook.includes("chatVisible: enabled"));
  assert.ok(hook.includes("V2_CHAT_READ_ROUTE"));
}

function testSharedThreadReadSend() {
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(inbox.includes("AgentChatTranscriptPane"));
  assert.ok(inbox.includes('composerId="agent-chats-composer"'));
  assert.ok(inbox.includes("chat.send"));
  assert.equal(inbox.includes("v2ChatSendUrl"), false);
  assert.equal(inbox.includes("crypto.randomUUID"), false);
  const hook = read("src/components/agent/chat/useAgentChatThread.ts");
  assert.ok(hook.includes("V2_CHAT_SEND_ROUTE"));
  assert.ok(hook.includes("appendV2ChatSentMessage"));
  assert.ok(hook.includes("listenersRef.current?.onSent"));
  assert.ok(hook.includes("listenersRef.current?.onRead"));
}

function testLocalUnreadClearAndSendPreview() {
  const unread = row({ conversationId: "c1", leadId: "l1" });
  const readRow = applyInboxMarkRead(unread);
  assert.equal(readRow.unread.count, 0);
  assert.equal(readRow.latestMessage?.preview, "Hello there");
  const sent = applyInboxSentMessage(readRow, {
    id: "server-1",
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "AGENT",
    senderName: "Ali",
    body: "On my way",
    createdAt: "2026-09-17T12:05:00.000Z",
  });
  assert.equal(sent.latestMessage?.id, "server-1");
  assert.equal(sent.latestMessage?.preview, "On my way");
  assert.equal(sent.lastMessageAt, "2026-09-17T12:05:00.000Z");
  const other = row({ conversationId: "c2", leadId: "l2" });
  const moved = moveInboxRowToTop([other, unread], "l1", (item) =>
    applyInboxSentMessage(item, {
      id: "server-1",
      channel: "CHAT",
      kind: "TEXT",
      senderKind: "AGENT",
      senderName: "Ali",
      body: "On my way",
      createdAt: "2026-09-17T12:05:00.000Z",
    }),
  );
  assert.deepEqual(
    moved.map((item) => item.leadId),
    ["l1", "l2"],
  );
  assert.equal(moved[0]?.latestMessage?.preview, "On my way");
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(inbox.includes("applyInboxMarkRead"));
  assert.ok(inbox.includes("applyInboxSentMessage"));
  assert.ok(inbox.includes("moveInboxRowToTop"));
}

function testMobileListThreadSwitch() {
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(inbox.includes('selectedLeadId ? "hidden" : "flex"'));
  assert.ok(inbox.includes('selectedLeadId ? "flex" : "hidden lg:flex"'));
  assert.ok(inbox.includes("Back to chats"));
  assert.ok(inbox.includes("lg:hidden"));
  assert.ok(inbox.includes("selectLead(null)"));
  assert.ok(inbox.includes("lg:grid-cols-[340px_minmax(0,1fr)]"));
  assert.ok(inbox.includes("xl:grid-cols-[380px_minmax(0,1fr)]"));
}

function testViewLeadCanonicalDeepLink() {
  assert.equal(chatsViewLeadHref("lead-9"), openLeadProfileHref("lead-9"));
  assert.equal(chatsViewLeadHref("lead-9"), "/agent/leads?lead=lead-9");
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(inbox.includes("chatsViewLeadHref"));
  assert.ok(inbox.includes("View Lead"));
  assert.equal(inbox.includes("/agent/leads/"), false);
}

function testNoDuplicatedChatImplementation() {
  const pane = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ChatPane.tsx",
  );
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Chat.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const conversations = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  );
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(
    pane.includes(
      "export { AgentChatTranscriptPane as LeadProfileV2ChatPane }",
    ),
  );
  assert.ok(
    hook.includes("export { useAgentChatThread as useLeadProfileV2Chat }"),
  );
  assert.ok(host.includes("useLeadProfileV2Chat"));
  assert.ok(conversations.includes("LeadProfileV2ChatPane"));
  assert.ok(inbox.includes("useAgentChatThread"));
  assert.ok(inbox.includes("AgentChatTranscriptPane"));
  assert.equal(inbox.includes("LeadProfileV2ChatPane"), false);
}

function testEmailRemainsUntouched() {
  const conversations = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  );
  const tabs = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Tabs.tsx",
  );
  assert.ok(conversations.includes('label="Email"'));
  assert.ok(conversations.includes("Compose an email"));
  assert.ok(conversations.includes("onComposeEmail"));
  assert.equal(conversations.includes("LeadEmailForm"), false);
  assert.ok(conversations.includes("EmailPreviewModal"));
  assert.ok(tabs.includes('{ id: "conversations", label: "Conversations" }'));
  assert.equal(tabs.includes('id: "chat"'), false);
}

function testEmptyCopy() {
  assert.equal(
    inboxEmptyCopy({ filter: "all", q: null }),
    "No conversations yet.",
  );
  assert.equal(
    inboxEmptyCopy({ filter: "unread", q: null }),
    "No unread chats.",
  );
  assert.equal(
    inboxEmptyCopy({ filter: "all", q: "jordan" }),
    "No matching chats.",
  );
}

function testNoRealtime() {
  const shell = read("src/components/agent/AgentShell.tsx");
  const instant = read("src/components/agent/AgentMobileInstantShell.tsx");
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  const query = read("src/lib/agent/chats-inbox-query.ts");
  assert.ok(shell.includes('href: "/agent/chats"'));
  assert.ok(shell.includes('label: "Chats"'));
  assert.ok(shell.includes("MessageCircle"));
  assert.ok(shell.includes('pathname === "/agent/chats"'));
  assert.equal(instant.includes("AgentChatsInbox"), false);
  assert.ok(instant.includes('href="/agent/chats"'));
  assert.equal(inbox.includes("setInterval"), false);
  assert.equal(inbox.includes("websocket"), false);
  assert.equal(inbox.includes("EventSource"), false);
  assert.equal(query.includes("@prisma/client"), false);
  assert.equal(query.includes("@/lib/conversations/"), false);
}

function main() {
  testCanonicalListApi();
  testSearchAndFilterParams();
  testCursorPaginationAndDedup();
  testSelectedLeadQueryAndNoAutoSelect();
  testListLoadDoesNotMarkRead();
  testSharedThreadReadSend();
  testLocalUnreadClearAndSendPreview();
  testMobileListThreadSwitch();
  testViewLeadCanonicalDeepLink();
  testNoDuplicatedChatImplementation();
  testEmailRemainsUntouched();
  testEmptyCopy();
  testNoRealtime();
  console.log("agent-chats-inbox-ui-selftest: ok");
}

void main();
