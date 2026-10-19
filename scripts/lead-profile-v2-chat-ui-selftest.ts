/**
 * Lead Profile V2 Agent Chat UI selftest.
 * Run: node --import tsx scripts/lead-profile-v2-chat-ui-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  V2_CHAT_RESOURCE_KEY,
  V2_CHAT_TEXT_MAX_LENGTH,
  appendV2ChatSentMessage,
  canShowV2ChatComposer,
  clearV2ChatUnread,
  mergeV2ChatMessages,
  shouldGroupV2ChatMessage,
  shouldMarkV2ChatRead,
  shouldSkipV2ChatSubmit,
  v2ChatComposerCanSubmit,
  v2ChatComposerKeyAction,
  v2ChatComposerMode,
  v2ChatEmptyCopy,
  v2ChatIsOpen,
  v2ChatMessageBody,
  v2ChatPrependScrollTop,
  v2ChatReadOnlyReason,
  v2ChatSystemCardLabel,
  v2ChatTranscriptItems,
  v2SmsBlockedCopy,
  v2SmsDeliveryLabel,
  v2SmsAutomationBadge,
} from "../src/lib/agent/lead-profile-v2/chat-query";
import type {
  LeadProfileV2ChatMessage,
  LeadProfileV2ChatPanel,
} from "../src/lib/agent/lead-profile-v2/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const CHAT_UI_FILES = [
  "src/lib/agent/lead-profile-v2/chat-query.ts",
  "src/components/agent/chat/useAgentChatThread.ts",
  "src/components/agent/chat/AgentChatTranscriptPane.tsx",
  "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Chat.ts",
  "src/components/agent/lead-profile-v2/LeadProfileV2ChatPane.tsx",
  "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
];

function readChatPane() {
  return [
    read("src/components/agent/lead-profile-v2/LeadProfileV2ChatPane.tsx"),
    read("src/components/agent/chat/AgentChatTranscriptPane.tsx"),
  ].join("\n");
}

function readChatHook() {
  return [
    read("src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Chat.ts"),
    read("src/components/agent/chat/useAgentChatThread.ts"),
  ].join("\n");
}

function msg(
  overrides: Partial<LeadProfileV2ChatMessage> & { id: string },
): LeadProfileV2ChatMessage {
  return {
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "AGENT",
    senderUserId: "agent-1",
    senderName: "Ali Syed",
    body: "Hello",
    editedAt: null,
    deletedAt: null,
    replyToMessageId: null,
    createdAt: "2026-09-17T12:00:00.000Z",
    deliveredAt: null,
    smsSource: null,
    providerStatus: null,
    payload: null,
    ...overrides,
  };
}

function panel(
  overrides: Partial<LeadProfileV2ChatPanel> = {},
): LeadProfileV2ChatPanel {
  return {
    conversation: {
      id: "conv-1",
      leadId: "lead-1",
      status: "OPEN",
      createdAt: "2026-09-17T11:00:00.000Z",
      lastMessageAt: "2026-09-17T12:00:00.000Z",
      created: false,
    },
    assignedAgentId: "agent-1",
    viewer: {
      userId: "agent-1",
      isAssignedAgent: true,
      canMarkRead: true,
    },
    unread: {
      count: 1,
      dividerMessageId: "m2",
      cutoffMode: "agent_cursor",
      agentCursorValid: true,
    },
    messages: [
      msg({ id: "m1", createdAt: "2026-09-17T12:00:00.000Z" }),
      msg({
        id: "m2",
        senderKind: "CUSTOMER",
        senderUserId: "cust-1",
        senderName: "Jordan",
        body: "Hi",
        createdAt: "2026-09-17T12:01:00.000Z",
      }),
    ],
    page: {
      limit: 40,
      hasMore: false,
      nextCursor: null,
    },
    ...overrides,
  };
}

function testEmailStillExposed() {
  const conversations = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  );
  const tabs = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Tabs.tsx",
  );
  assert.ok(conversations.includes('label="Email"'));
  assert.ok(conversations.includes("Compose an email"));
  assert.ok(conversations.includes("No emails logged yet."));
  assert.ok(conversations.includes("onComposeEmail"));
  assert.equal(conversations.includes("LeadEmailForm"), false);
  assert.ok(conversations.includes("EmailPreviewModal"));
  assert.ok(conversations.includes("Opened"));
  assert.ok(conversations.includes("Clicked"));
  assert.ok(conversations.includes("Not opened yet"));
  assert.ok(tabs.includes('{ id: "conversations", label: "Conversations" }'));
  assert.equal(tabs.includes('id: "chat"'), false);
  const popup = read("src/components/agent/LeadQueryPopup.tsx");
  assert.equal(popup.includes("LeadProfileV2ChatPane"), false);
}

function testTranscriptRendersChronologically() {
  const pane = readChatPane();
  assert.ok(pane.includes("v2ChatTranscriptItems"));
  assert.ok(pane.includes("row.message"));
  assert.ok(pane.includes("senderName"));
  assert.ok(pane.includes("New messages"));
  const items = v2ChatTranscriptItems(
    [
      msg({ id: "m1", createdAt: "2026-09-17T12:00:00.000Z" }),
      msg({
        id: "m2",
        senderKind: "CUSTOMER",
        senderUserId: "cust-1",
        senderName: "Jordan",
        createdAt: "2026-09-17T12:01:00.000Z",
      }),
      msg({ id: "m3", createdAt: "2026-09-17T12:02:00.000Z" }),
    ],
    "m2",
  );
  assert.deepEqual(
    items.map((row) => row.message.id),
    ["m1", "m2", "m3"],
  );
  assert.equal(items[0]?.showDivider, false);
  assert.equal(items[1]?.showDivider, true);
  assert.equal(items[2]?.showDivider, false);
  assert.equal(
    v2ChatTranscriptItems(
      [
        msg({ id: "a1", senderUserId: "agent-1", senderName: "Ali Syed" }),
        msg({ id: "a2", senderUserId: "agent-1", senderName: "Ali Syed" }),
      ],
      null,
    )[1]?.grouped,
    true,
  );
  assert.equal(
    shouldGroupV2ChatMessage(
      msg({
        id: "s1",
        kind: "SYSTEM_CARD",
        senderKind: "SYSTEM",
        senderUserId: null,
        senderName: "System",
      }),
      msg({ id: "s2" }),
    ),
    false,
  );
}

function testOlderPagePrependsWithoutDuplicates() {
  const latest = [
    msg({ id: "m3", createdAt: "2026-09-17T12:02:00.000Z" }),
    msg({ id: "m4", createdAt: "2026-09-17T12:03:00.000Z" }),
  ];
  const older = [
    msg({ id: "m1", createdAt: "2026-09-17T12:00:00.000Z" }),
    msg({ id: "m2", createdAt: "2026-09-17T12:01:00.000Z" }),
    msg({ id: "m3", createdAt: "2026-09-17T12:02:00.000Z" }),
  ];
  assert.deepEqual(
    mergeV2ChatMessages(latest, older, "prepend").map((row) => row.id),
    ["m1", "m2", "m3", "m4"],
  );
  assert.equal(
    v2ChatPrependScrollTop({
      previousScrollHeight: 400,
      nextScrollHeight: 700,
      previousScrollTop: 40,
    }),
    340,
  );
  const hook = readChatHook();
  assert.ok(hook.includes('"prepend"'));
  assert.ok(hook.includes("mergeV2ChatMessages"));
}

function testDeletedTombstoneAndSystemCard() {
  assert.equal(
    v2ChatMessageBody(
      msg({ id: "d1", body: "secret", deletedAt: "2026-09-17T12:04:00.000Z" }),
    ),
    "This message was deleted",
  );
  assert.equal(v2ChatSystemCardLabel({ card: "ASSIGNED" }), "Assigned");
  assert.equal(v2ChatSystemCardLabel({ card: "REASSIGNED" }), "Reassigned");
  assert.equal(
    v2ChatSystemCardLabel({ card: "VIEWING_CONFIRMED" }),
    "Viewing confirmed",
  );
  assert.equal(v2ChatSystemCardLabel({ raw: { twilio: true } }), "Update");
  const pane = readChatPane();
  assert.ok(pane.includes("v2ChatMessageBody"));
  assert.ok(pane.includes("v2ChatSystemCardLabel"));
  assert.equal(pane.includes("JSON.stringify"), false);
  assert.equal(pane.includes("providerStatus"), false);
  assert.equal(pane.includes("smsSource"), false);
}

function testUnreadDividerUsesServerId() {
  const items = v2ChatTranscriptItems(panel().messages, "m2");
  assert.equal(
    items.find((row) => row.showDivider)?.message.id,
    "m2",
  );
  const pane = readChatPane();
  assert.ok(pane.includes("unread.dividerMessageId"));
  assert.equal(pane.includes("assignedAgentId ==="), false);
  assert.equal(pane.includes("agentLastReadAt"), false);
}

function testComposerPermissions() {
  assert.equal(canShowV2ChatComposer(true), true);
  assert.equal(canShowV2ChatComposer(false), false);
  assert.equal(
    v2ChatComposerMode({ loading: false, error: false, canMarkRead: true }),
    "composer",
  );
  assert.equal(
    v2ChatComposerMode({ loading: false, error: false, canMarkRead: false }),
    "readonly",
  );
  assert.equal(
    v2ChatReadOnlyReason({ canMarkRead: false, assignedAgentId: "agent-1" }),
    "Only the assigned agent can send chat messages.",
  );
  assert.equal(
    v2ChatReadOnlyReason({ canMarkRead: false, assignedAgentId: null }),
    "Only the assigned agent can send chat messages. This lead is unassigned.",
  );
  const pane = readChatPane();
  assert.ok(pane.includes("v2ChatComposerMode"));
  assert.ok(pane.includes("viewer.canMarkRead"));
  assert.equal(pane.includes("ctx.user.role"), false);
  assert.equal(pane.includes("isAdmin"), false);
}

function testSendAppendsServerMessageAndKeepsDraft() {
  const current = panel({ messages: [msg({ id: "m1" })] });
  const sent = msg({ id: "server-99", body: "Saved" });
  assert.deepEqual(
    appendV2ChatSentMessage(current, sent).messages.map((row) => row.id),
    ["m1", "server-99"],
  );
  const hook = readChatHook();
  const pane = readChatPane();
  assert.ok(hook.includes("appendV2ChatSentMessage"));
  assert.ok(hook.includes("json.message"));
  assert.equal(hook.includes("crypto.randomUUID"), false);
  assert.equal(hook.includes("optimistic"), false);
  assert.ok(hook.includes("sendInFlightRef"));
  assert.ok(hook.includes("shouldSkipV2ChatSubmit"));
  assert.ok(pane.includes("if (sent)"));
  assert.ok(pane.includes('setDraft("")'));
  assert.ok(pane.includes("Your message was kept."));
  assert.equal(
    shouldSkipV2ChatSubmit({
      body: "Hi",
      inFlight: true,
      canSend: true,
    }),
    true,
  );
  assert.equal(
    shouldSkipV2ChatSubmit({
      body: "Hi",
      inFlight: false,
      canSend: true,
    }),
    false,
  );
}

function testComposerKeyboardAndLimit() {
  assert.equal(V2_CHAT_TEXT_MAX_LENGTH, 4000);
  assert.equal(
    v2ChatComposerKeyAction({ key: "Enter", shiftKey: false }),
    "send",
  );
  assert.equal(
    v2ChatComposerKeyAction({ key: "Enter", shiftKey: true }),
    "newline",
  );
  assert.equal(
    v2ChatComposerKeyAction({ key: "a", shiftKey: false }),
    null,
  );
  assert.equal(
    v2ChatComposerCanSubmit({
      body: "x".repeat(4000),
      pending: false,
      canSend: true,
    }),
    true,
  );
  assert.equal(
    v2ChatComposerCanSubmit({
      body: "x".repeat(4001),
      pending: false,
      canSend: true,
    }),
    false,
  );
  const pane = readChatPane();
  assert.ok(pane.includes("maxLength={V2_CHAT_TEXT_MAX_LENGTH}"));
  assert.ok(pane.includes("v2ChatComposerKeyAction"));
  const send = read("src/lib/conversations/agent-conversation-send.ts");
  assert.ok(send.includes("AGENT_CHAT_TEXT_MAX_LENGTH = 4000"));
}

function testMarkReadUsesActualChatOpen() {
  assert.equal(
    v2ChatIsOpen({ tab: "activity", conversationSurface: "chat" }),
    false,
  );
  assert.equal(
    v2ChatIsOpen({ tab: "conversations", conversationSurface: "email" }),
    false,
  );
  assert.equal(
    v2ChatIsOpen({ tab: "conversations", conversationSurface: "chat" }),
    true,
  );
  assert.equal(
    shouldMarkV2ChatRead({ chatVisible: true, canMarkRead: true }),
    true,
  );
  assert.equal(
    shouldMarkV2ChatRead({ chatVisible: true, canMarkRead: false }),
    false,
  );
  assert.equal(
    shouldMarkV2ChatRead({ chatVisible: false, canMarkRead: true }),
    false,
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const hook = readChatHook();
  assert.ok(host.includes("v2ChatIsOpen"));
  assert.ok(host.includes("useLeadProfileV2Chat"));
  assert.equal(host.includes("/conversation/read"), false);
  assert.ok(hook.includes("shouldMarkV2ChatRead"));
  assert.ok(hook.includes("chatVisible: enabled"));
  assert.ok(hook.includes("viewer.canMarkRead"));
  assert.ok(hook.includes(V2_CHAT_RESOURCE_KEY) || hook.includes("V2_CHAT_READ_ROUTE"));
  assert.ok(hook.includes("clearV2ChatUnread"));
  const cleared = clearV2ChatUnread(panel());
  assert.equal(cleared.unread.count, 0);
  assert.equal(cleared.unread.dividerMessageId, null);
}

function testEmptyAndErrorStates() {
  assert.equal(
    v2ChatEmptyCopy(true),
    "No chat messages yet. Send a message to start the conversation.",
  );
  assert.equal(v2ChatEmptyCopy(false), "No chat messages yet.");
  const pane = readChatPane();
  const hook = readChatHook();
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(pane.includes("v2ChatEmptyCopy"));
  assert.ok(pane.includes("Couldn’t load chat."));
  assert.ok(pane.includes("Retry"));
  assert.ok(pane.includes("ChatSkeleton"));
  assert.ok(pane.includes("Loading earlier messages"));
  assert.ok(hook.includes("setError(true)"));
  assert.equal(hook.includes("setData("), false);
  assert.ok(host.includes("chat.error"));
  assert.ok(host.includes("emails.error"));
}

function testNoFakeRealtimeOrMigration() {
  for (const rel of CHAT_UI_FILES) {
    const src = read(rel);
    const isThreadHook = rel === "src/components/agent/chat/useAgentChatThread.ts";
    if (!isThreadHook) {
      assert.equal(src.includes("setInterval"), false, `${rel} must not poll`);
      assert.equal(
        src.includes("@/lib/conversations/"),
        false,
        `${rel} must stay client-safe`,
      );
    }
    assert.equal(src.includes("websocket"), false, `${rel} must not open sockets`);
    assert.equal(src.includes("EventSource"), false, `${rel} must not use SSE`);
    assert.equal(src.includes("LeadEmailLog"), false, `${rel} must not merge email`);
  }
  const query = read("src/lib/agent/lead-profile-v2/chat-query.ts");
  assert.equal(query.includes("from \"@prisma/client\""), false);
  assert.ok(query.includes("/api/agent/leads/${leadId}/conversation"));
  const hook = read("src/components/agent/chat/useAgentChatThread.ts");
  assert.ok(hook.includes("conversation-live-poll"));
  assert.ok(hook.includes("CONVERSATION_LIVE_POLL_MS"));
  assert.ok(hook.includes("setInterval"));
  assert.ok(hook.includes("visibilitychange"));
  assert.ok(hook.includes("pollInFlightRef"));
  assert.ok(hook.includes("mergeLiveConversationMessages"));
  assert.equal(hook.includes("WebSocket"), false);
  assert.equal(hook.includes("EventSource"), false);
}

function testLeadProfileUsesSharedChat() {
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
  assert.ok(
    pane.includes(
      "export { AgentChatTranscriptPane as LeadProfileV2ChatPane }",
    ),
  );
  assert.ok(
    hook.includes("export { useAgentChatThread as useLeadProfileV2Chat }"),
  );
  assert.ok(host.includes("useLeadProfileV2Chat(session, leadId, chatOpen)"));
  assert.ok(conversations.includes("<LeadProfileV2ChatPane"));
  assert.equal(conversations.includes("useAgentChatThread"), false);
}

function testEmailFunctionalityUntouched() {
  const conversations = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel.tsx",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(conversations.includes("onComposeEmail"));
  assert.ok(conversations.includes("Compose an email"));
  assert.equal(conversations.includes("LeadEmailForm"), false);
  assert.ok(conversations.includes("setPreviewEmailId(e.id)"));
  assert.ok(host.includes('tab === "conversations"'));
  assert.ok(host.includes("useLeadProfileV2Emails("));
  assert.ok(host.includes("applyV2ConversationsEmailSentRefresh"));
  assert.ok(host.includes("EmailComposerProvider"));
  assert.ok(host.includes("onComposeEmail={onComposeEmail}"));
  assert.equal(conversations.includes("e.body"), false);
}

function testSmsComposerAndDelivery() {
  const pane = readChatPane();
  assert.ok(pane.includes('useState<"CHAT" | "SMS">("CHAT")'));
  assert.ok(pane.includes("Chat"));
  assert.ok(pane.includes("SMS"));
  assert.equal(
    v2ChatComposerCanSubmit({
      body: "Hello",
      pending: false,
      canSend: true,
    }),
    true,
  );
  assert.equal(
    v2ChatComposerCanSubmit({
      body: "Hello",
      pending: false,
      canSend: true,
      channel: "SMS",
    }),
    false,
  );
  assert.equal(
    v2ChatComposerCanSubmit({
      body: "Hello",
      pending: false,
      canSend: true,
      channel: "SMS",
      smsEnabled: true,
    }),
    true,
  );
  assert.equal(
    shouldGroupV2ChatMessage(
      msg({ id: "c1", channel: "CHAT" }),
      msg({ id: "s1", channel: "SMS" }),
    ),
    false,
  );
  assert.equal(
    v2SmsAutomationBadge({ automationKey: "lead.inactive_14_days" }),
    "Automated · Inactive for 14 Days",
  );
  assert.equal(v2SmsAutomationBadge(null), null);
  assert.equal(
    shouldGroupV2ChatMessage(
      msg({
        id: "auto-1",
        channel: "SMS",
        payload: { automationKey: "lead.inactive_14_days" },
      }),
      msg({
        id: "auto-2",
        channel: "SMS",
        payload: { automationKey: "lead.inactive_14_days" },
      }),
    ),
    false,
  );
  const paneSrc = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.ok(paneSrc.includes("v2SmsAutomationBadge"));
  assert.ok(paneSrc.includes("HouzzatPRO"));
  assert.equal(
    v2SmsDeliveryLabel({
      channel: "CHAT",
      deliveredAt: null,
      providerStatus: "sent",
    }),
    null,
  );
  assert.equal(
    v2SmsDeliveryLabel({
      channel: "SMS",
      deliveredAt: null,
      providerStatus: "failed",
    }),
    "Failed",
  );
  assert.ok(pane.includes("smsQuickTexts"));
  assert.ok(pane.includes("composerSendButtonLabel"));
  assert.ok(pane.includes("Send Chat") || pane.includes('channel === "SMS" ? "Send SMS" : "Send Chat"') || pane.includes("composerSendButtonLabel"));
  assert.ok(pane.includes("setDraft(quickText.rendered)"));
  assert.equal(pane.includes("onSend(quickText"), false);
  assert.equal(pane.includes("onSend(qt"), false);
  assert.equal(
    v2SmsBlockedCopy("NO_CUSTOMER_E164"),
    "SMS is unavailable — this lead has no valid mobile number.",
  );
  assert.equal(
    v2SmsBlockedCopy("ALLOWANCE_NOT_CONFIGURED"),
    "SMS is unavailable — this workspace has no SMS allowance configured.",
  );
}

function main() {
  testEmailStillExposed();
  testTranscriptRendersChronologically();
  testOlderPagePrependsWithoutDuplicates();
  testDeletedTombstoneAndSystemCard();
  testUnreadDividerUsesServerId();
  testComposerPermissions();
  testSendAppendsServerMessageAndKeepsDraft();
  testComposerKeyboardAndLimit();
  testMarkReadUsesActualChatOpen();
  testEmptyAndErrorStates();
  testNoFakeRealtimeOrMigration();
  testLeadProfileUsesSharedChat();
  testEmailFunctionalityUntouched();
  testSmsComposerAndDelivery();
  console.log("lead-profile-v2-chat-ui-selftest: ok");
}

void main();
