/**
 * Customer Chat UI selftest.
 * Run: pnpm customer-chat-ui:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  accountSignInCallbackPath,
  accountSignInHref,
} from "../src/lib/account/account-sign-in-callback";
import { authSuccessReturnPath } from "../src/lib/auth/safe-callback-url";
import {
  CUSTOMER_CHAT_DELETED_TOMBSTONE,
  CUSTOMER_CHAT_GET_ROUTE,
  CUSTOMER_CHAT_PAGE_HREF,
  CUSTOMER_CHAT_READ_ROUTE,
  CUSTOMER_CHAT_SEND_ROUTE,
  CUSTOMER_CHAT_TEXT_MAX_LENGTH,
  appendCustomerChatSentMessage,
  customerChatBubbleAlign,
  customerChatComposerCanSubmit,
  customerChatComposerKeyAction,
  customerChatEmptyCopy,
  customerChatEmptyTitle,
  customerChatGetUrl,
  customerChatMessageBody,
  customerChatRateLimitedCopy,
  customerChatSendBody,
  customerChatTranscriptItems,
  customerChatUnavailableCopy,
  customerSmsAutomationBadge,
  customerUnreadDividerMessageId,
  mergeCustomerChatMessages,
  parseCustomerChatSendFailure,
  parseRetryAfterHeader,
  shouldGroupCustomerChatMessage,
  shouldMarkCustomerChatRead,
  shouldSkipCustomerChatSubmit,
  shouldSkipDuplicateCustomerChatOlder,
} from "../src/lib/customer-chat/query";
import type {
  CustomerChatGetPayload,
  CustomerChatMessage,
} from "../src/lib/customer-chat/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const UI_FILES = [
  "src/app/(account)/account/chat/page.tsx",
  "src/components/customer-chat/CustomerChatScreen.tsx",
  "src/components/customer-chat/useCustomerChatThread.ts",
  "src/components/customer-chat/CustomerChatFab.tsx",
  "src/lib/customer-chat/query.ts",
  "src/lib/customer-chat/types.ts",
] as const;

function msg(
  overrides: Partial<CustomerChatMessage> & { id: string },
): CustomerChatMessage {
  return {
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "CUSTOMER",
    senderName: "Jordan Lee",
    body: "Hello",
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-09-17T12:00:00.000Z",
    payload: null,
    ...overrides,
  };
}

function payload(
  overrides: Partial<CustomerChatGetPayload> = {},
): CustomerChatGetPayload {
  return {
    conversation: {
      id: "conv-1",
      status: "OPEN",
      lastMessageAt: "2026-09-17T12:00:00.000Z",
    },
    messages: [],
    page: { limit: 40, hasMore: false, nextCursor: null },
    canSend: true,
    blocked: false,
    read: { customerLastReadAt: null, unreadCount: 0 },
    agent: null,
    ...overrides,
  };
}

function testCanonicalRoutes() {
  assert.equal(CUSTOMER_CHAT_PAGE_HREF, "/account/chat");
  assert.equal(CUSTOMER_CHAT_GET_ROUTE, "/api/account/conversation");
  assert.equal(
    CUSTOMER_CHAT_SEND_ROUTE,
    "/api/account/conversation/messages",
  );
  assert.equal(CUSTOMER_CHAT_READ_ROUTE, "/api/account/conversation/read");
  assert.equal(customerChatGetUrl(), "/api/account/conversation");
  assert.equal(
    customerChatGetUrl("abc|1"),
    "/api/account/conversation?cursor=abc%7C1",
  );
  const page = read("src/app/(account)/account/chat/page.tsx");
  assert.ok(page.includes("CustomerChatScreen"));
  assert.equal(page.includes("leadId"), false);
  assert.equal(page.includes("workspaceId"), false);
  assert.equal(page.includes("conversationId"), false);
}

function testSendBodyIsBodyOnly() {
  const sent = customerChatSendBody("Hello there");
  assert.deepEqual(sent, { body: "Hello there" });
  assert.deepEqual(Object.keys(sent), ["body"]);
  assert.deepEqual(customerChatSendBody("Hello", "msg_1"), {
    body: "Hello",
    replyToMessageId: "msg_1",
  });
  const hook = read("src/components/customer-chat/useCustomerChatThread.ts");
  assert.ok(
    hook.includes("customerChatSendBody(body, options?.replyToMessageId)"),
  );
  const sendFnStart = hook.indexOf("const send = useCallback");
  const sendFnEnd = hook.indexOf("const reactToMessage = useCallback");
  assert.ok(sendFnStart >= 0 && sendFnEnd > sendFnStart);
  const sendFn = hook.slice(sendFnStart, sendFnEnd);
  assert.equal(sendFn.includes("leadId"), false);
  assert.equal(sendFn.includes("workspaceId"), false);
  assert.equal(sendFn.includes("conversationId"), false);
  assert.equal(sendFn.includes("assignedAgentId"), false);
  assert.equal(sendFn.includes("senderUserId"), false);
  assert.equal(sendFn.includes("senderName"), false);
}

function testComposerParity() {
  assert.equal(CUSTOMER_CHAT_TEXT_MAX_LENGTH, 4000);
  assert.equal(
    customerChatComposerKeyAction({ key: "Enter", shiftKey: false }),
    "send",
  );
  assert.equal(
    customerChatComposerKeyAction({ key: "Enter", shiftKey: true }),
    "newline",
  );
  assert.equal(
    customerChatComposerCanSubmit({
      body: "  hi  ",
      pending: false,
      canSend: true,
    }),
    true,
  );
  assert.equal(
    customerChatComposerCanSubmit({
      body: "   ",
      pending: false,
      canSend: true,
    }),
    false,
  );
  assert.equal(
    shouldSkipCustomerChatSubmit({
      body: "hi",
      inFlight: true,
      canSend: true,
    }),
    true,
  );
  const screen = read("src/components/customer-chat/CustomerChatScreen.tsx");
  // Enter-to-send is wired through customerChatComposerKeyAction (hint copy removed from chrome).
  assert.equal(
    customerChatComposerKeyAction({ key: "Enter", shiftKey: false }),
    "send",
  );
  assert.equal(
    customerChatComposerKeyAction({ key: "Enter", shiftKey: true }),
    "newline",
  );
  assert.ok(screen.includes("customerChatComposerKeyAction"));
  assert.ok(screen.includes("onComposerKeyDown"));
  assert.ok(screen.includes('aria-label="Send message"'));
  assert.ok(screen.includes("Write a message…"));
  assert.ok(screen.includes("Message to {agentName}"));
  assert.ok(screen.includes("chatComposerTrailingAction"));
}

function testTranscriptAlignmentAndTombstone() {
  assert.equal(customerChatBubbleAlign("CUSTOMER", "TEXT"), "right");
  assert.equal(customerChatBubbleAlign("AGENT", "TEXT"), "left");
  assert.equal(customerChatBubbleAlign("ADMIN", "TEXT"), "left");
  assert.equal(customerChatBubbleAlign("AGENT", "SYSTEM_CARD"), "center");
  assert.equal(customerChatEmptyTitle(), "Start a conversation");
  assert.equal(
    customerChatEmptyCopy(),
    "Send a message and your agent will get back to you here.",
  );
  const deleted = msg({
    id: "d1",
    deletedAt: "2026-09-17T12:01:00.000Z",
    body: null,
  });
  assert.equal(customerChatMessageBody(deleted), CUSTOMER_CHAT_DELETED_TOMBSTONE);
  const grouped = shouldGroupCustomerChatMessage(
    msg({ id: "a", senderKind: "AGENT", senderName: "Ali" }),
    msg({ id: "b", senderKind: "AGENT", senderName: "Ali" }),
  );
  assert.equal(grouped, true);
  assert.equal(
    shouldGroupCustomerChatMessage(
      msg({ id: "a", senderKind: "CUSTOMER", senderName: "Jordan" }),
      msg({ id: "b", senderKind: "AGENT", senderName: "Ali" }),
    ),
    false,
  );
  assert.equal(
    shouldGroupCustomerChatMessage(
      msg({ id: "c", channel: "CHAT", senderKind: "AGENT", senderName: "Ali" }),
      msg({ id: "s", channel: "SMS", senderKind: "AGENT", senderName: "Ali" }),
    ),
    false,
  );
  assert.equal(
    customerSmsAutomationBadge({ automationKey: "lead.inactive_14_days" }),
    "Automated · Inactive for 14 Days",
  );
  assert.equal(customerSmsAutomationBadge(null), null);
  const screen = read("src/components/customer-chat/CustomerChatScreen.tsx");
  const bubbleMeta = read("src/components/chat/ChatBubbleMeta.tsx");
  assert.ok(bubbleMeta.includes("whitespace-pre-wrap"));
  assert.ok(bubbleMeta.includes("[overflow-wrap:anywhere]"));
  assert.ok(screen.includes("ChatBubbleBodyWithMeta"));
  assert.ok(screen.includes("presentCustomerChatAgentName"));
  assert.ok(screen.includes("ChatMessageActions"));
  assert.ok(screen.includes("customerChatEmptyTitle"));
  assert.ok(screen.includes("customerChatEmptyCopy"));
  assert.ok(screen.includes("customerSmsAutomationBadge"));
  assert.equal(screen.includes("Send SMS"), false);
}

function testMergeAndFirstMessage() {
  const first = msg({ id: "m1", body: "Hi" });
  const empty = payload({ conversation: null, messages: [] });
  const next = appendCustomerChatSentMessage(
    empty,
    { id: "conv-new", status: "OPEN", lastMessageAt: first.createdAt },
    first,
  );
  assert.equal(next.messages.length, 1);
  assert.equal(next.messages[0]?.id, "m1");
  const dup = mergeCustomerChatMessages(next.messages, [first], "append");
  assert.equal(dup.length, 1);
}

function testReadOnce() {
  assert.equal(
    shouldMarkCustomerChatRead({
      chatVisible: true,
      openId: "c1",
      alreadyMarkedId: null,
    }),
    true,
  );
  assert.equal(
    shouldMarkCustomerChatRead({
      chatVisible: true,
      openId: "c1",
      alreadyMarkedId: "c1",
    }),
    false,
  );
  assert.equal(
    shouldMarkCustomerChatRead({
      chatVisible: true,
      openId: null,
      alreadyMarkedId: null,
    }),
    false,
  );
  assert.equal(
    shouldMarkCustomerChatRead({
      chatVisible: false,
      openId: "c1",
      alreadyMarkedId: null,
    }),
    false,
  );
  const fab = read("src/components/customer-chat/CustomerChatFab.tsx");
  assert.equal(fab.includes(CUSTOMER_CHAT_READ_ROUTE), false);
  assert.equal(fab.includes("unread"), false);
  const hook = read("src/components/customer-chat/useCustomerChatThread.ts");
  assert.ok(hook.includes("CUSTOMER_CHAT_READ_ROUTE"));
  assert.ok(hook.includes("shouldMarkCustomerChatRead"));
  assert.ok(hook.includes('method: "POST"'));
}

function testErrorCopy() {
  assert.equal(
    parseCustomerChatSendFailure(503, { code: "CHAT_AGENT_UNAVAILABLE" }, null)
      .kind,
    "unavailable",
  );
  assert.equal(
    parseCustomerChatSendFailure(503, { code: "CHAT_AGENT_UNAVAILABLE" }, null)
      .message,
    customerChatUnavailableCopy(),
  );
  const limited = parseCustomerChatSendFailure(
    429,
    { code: "RATE_LIMITED" },
    "12",
  );
  assert.equal(limited.kind, "rate_limited");
  assert.equal(limited.retryAfterSec, 12);
  assert.equal(limited.message, customerChatRateLimitedCopy(12));
  assert.equal(
    parseCustomerChatSendFailure(403, { code: "CHAT_BLOCKED" }, null).kind,
    "blocked",
  );
  assert.equal(
    parseCustomerChatSendFailure(
      403,
      { requiresEmailVerification: true },
      null,
    ).kind,
    "verification",
  );
  assert.equal(
    parseCustomerChatSendFailure(403, { error: "Forbidden" }, null).kind,
    "generic",
  );
  assert.equal(parseRetryAfterHeader("30"), 30);
  const hook = read("src/components/customer-chat/useCustomerChatThread.ts");
  assert.ok(hook.includes("openClientToolsVerification"));
  assert.ok(hook.includes("openAuth"));
  const screen = read("src/components/customer-chat/CustomerChatScreen.tsx");
  assert.ok(screen.includes("AccountVerifyEmailAction"));
  assert.ok(screen.includes("Your message was kept."));
  assert.ok(screen.includes("customerChatBlockedCopy"));
  assert.ok(screen.includes("customerChatEmptyCopy"));
}

function testUnreadDivider() {
  const messages = [
    msg({
      id: "c1",
      senderKind: "CUSTOMER",
      createdAt: "2026-09-17T12:00:00.000Z",
    }),
    msg({
      id: "a1",
      senderKind: "AGENT",
      senderName: "Ali",
      createdAt: "2026-09-17T12:05:00.000Z",
    }),
  ];
  assert.equal(
    customerUnreadDividerMessageId(messages, "2026-09-17T12:01:00.000Z", 1),
    "a1",
  );
  assert.equal(
    customerUnreadDividerMessageId(messages, "2026-09-17T12:01:00.000Z", 0),
    null,
  );
  const rows = customerChatTranscriptItems(messages, "a1");
  assert.equal(rows[1]?.showDivider, true);
  assert.equal(
    customerUnreadDividerMessageId(
      [
        ...messages,
        msg({
          id: "s1",
          channel: "SMS",
          senderKind: "AGENT",
          senderName: "Ali",
          createdAt: "2026-09-17T12:06:00.000Z",
        }),
      ],
      "2026-09-17T12:01:00.000Z",
      2,
    ),
    "a1",
  );
  assert.equal(
    customerUnreadDividerMessageId(
      [
        msg({
          id: "own-sms",
          channel: "SMS",
          senderKind: "CUSTOMER",
          createdAt: "2026-09-17T12:07:00.000Z",
        }),
      ],
      "2026-09-17T12:01:00.000Z",
      1,
    ),
    null,
  );
}

function testOlderSkip() {
  assert.equal(
    shouldSkipDuplicateCustomerChatOlder({
      inFlight: true,
      lastCursor: null,
      cursor: "x",
    }),
    true,
  );
  assert.equal(
    shouldSkipDuplicateCustomerChatOlder({
      inFlight: false,
      lastCursor: "x",
      cursor: "x",
    }),
    true,
  );
}

function testTenantOnlyFabAndNoSixthTab() {
  const marketing = read("src/app/(marketing)/layout.tsx");
  assert.ok(marketing.includes("CustomerChatFab"));
  assert.ok(marketing.includes("resolveMarketingTenancy"));
  const platformBlock = marketing.slice(
    marketing.indexOf("isHouzzatProPlatformMarketingShellRequest"),
    marketing.indexOf("resolvePlatformSuspendedHost"),
  );
  assert.equal(platformBlock.includes("CustomerChatFab"), false);
  const fab = read("src/components/customer-chat/CustomerChatFab.tsx");
  assert.ok(fab.includes("houzzatpro"));
  assert.ok(fab.includes("ADMIN"));
  assert.ok(fab.includes("AGENT"));
  assert.ok(fab.includes('status === "loading"'));
  assert.ok(fab.includes("openGuestStartChatIntent"));
  assert.ok(fab.includes("chat.open"));
  assert.ok(fab.includes("CUSTOMER_CHAT_PAGE_HREF"));
  assert.ok(fab.includes('aria-label="Open chat"'));
  assert.ok(fab.includes("data-customer-chat-fab"));
  assert.ok(fab.includes("[data-rc-concierge]:not([hidden])"));
  assert.ok(fab.includes("listingConcierge"));
  const hero = read("src/components/templates/royal-collection-one/RoyalCollectionHero.tsx");
  assert.ok(hero.includes("RoyalCollectionHeroChat"));
  assert.ok(hero.includes("view.heroPortrait ? <RoyalCollectionHeroChat /> : null"));
  const heroChat = read(
    "src/components/templates/royal-collection-one/RoyalCollectionHeroChat.tsx",
  );
  assert.ok(heroChat.includes("data-rc-hero-chat"));
  assert.ok(heroChat.includes("openGuestStartChatIntent"));
  assert.ok(heroChat.includes("chat.open"));
  const royalCss = read(
    "src/components/templates/royal-collection-one/royal-collection.module.css",
  );
  assert.equal(royalCss.includes(".heroHasPortrait .heroChat {\n    display: none;"), false);
  const marketingLayout = read("src/app/(marketing)/layout.tsx");
  assert.ok(marketingLayout.includes("heroChatWithScroll"));
  assert.ok(marketingLayout.includes("heroChatWithScroll ? null"));
  const concierge = read(
    "src/components/templates/royal-collection-one/RoyalCollectionConciergeBar.tsx",
  );
  assert.ok(concierge.includes("data-rc-concierge"));
  assert.ok(concierge.includes("hidden={concealed}"));
  const nav = read("src/components/site/MobileBottomNav.tsx");
  assert.ok(nav.includes("Chat"));
  assert.ok(nav.includes("grid-cols-4"));
  assert.equal(nav.includes("grid-cols-5"), false);
  assert.ok(nav.includes("Home"));
  assert.ok(nav.includes("Search"));
  assert.ok(nav.includes("More"));
  assert.ok(nav.includes("Account"));
  assert.ok(nav.includes("chat.open") || nav.includes("CUSTOMER_CHAT_PAGE_HREF"));
}

function testAccountNavAndCallback() {
  assert.equal(accountSignInCallbackPath("/account/chat"), "/account/chat");
  assert.equal(accountSignInCallbackPath("/account/saved"), "/account/saved");
  assert.equal(accountSignInCallbackPath("/search"), "/account");
  assert.equal(
    accountSignInHref("/account/chat"),
    "/auth/sign-in?callbackUrl=%2Faccount%2Fchat",
  );
  const layout = read("src/app/(account)/account/layout.tsx");
  assert.ok(layout.includes('href: "/account/chat"'));
  assert.ok(layout.includes("accountSignInHref"));
  assert.ok(layout.includes("CustomerChatFab"));
  const account = read("src/app/(account)/account/page.tsx");
  assert.ok(account.includes('href="/account/chat"'));
  assert.equal(authSuccessReturnPath("/account/chat"), "/account/chat");
  assert.equal(authSuccessReturnPath("/auth/sign-in"), null);
  assert.equal(authSuccessReturnPath("https://evil.example/x"), null);
  assert.equal(authSuccessReturnPath(null), null);
  const signIn = read("src/components/auth/SignInForm.tsx");
  assert.ok(signIn.includes("authSuccessReturnPath"));
  const signUp = read("src/components/auth/SignUpForm.tsx");
  assert.ok(signUp.includes("authSuccessReturnPath"));
}

function testNoAgentCouplingOrForbiddenFeatures() {
  for (const rel of UI_FILES) {
    const src = read(rel);
    assert.equal(src.includes("AgentChatTranscriptPane"), false, rel);
    assert.equal(src.includes("useAgentChatThread"), false, rel);
    assert.equal(src.includes("/api/agent/"), false, rel);
    assert.equal(src.includes("EventSource"), false, rel);
    assert.equal(src.includes("WebSocket"), false, rel);
    if (rel !== "src/components/customer-chat/useCustomerChatThread.ts") {
      assert.equal(src.includes("setInterval"), false, rel);
    }
    assert.equal(src.includes("twilio"), false, rel);
    assert.equal(src.includes("Twilio"), false, rel);
    assert.equal(src.includes("prisma."), false, rel);
    if (rel !== "src/components/customer-chat/useCustomerChatThread.ts") {
      assert.equal(src.includes("notify"), false, rel);
    }
  }
  const hook = read("src/components/customer-chat/useCustomerChatThread.ts");
  assert.equal(hook.includes("optimistic"), false);
  assert.ok(hook.includes("CONVERSATION_LIVE_POLL_MS"));
  assert.ok(hook.includes("setInterval"));
  assert.ok(hook.includes("visibilitychange"));
  assert.ok(hook.includes("pollInFlightRef"));
  const agentPane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.equal(agentPane.includes("customer-chat"), false);
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.equal(inbox.includes("CustomerChat"), false);
}

function testSharedComposerHelpersOnly() {
  const query = read("src/lib/customer-chat/query.ts");
  assert.ok(query.includes("v2ChatComposerKeyAction"));
  assert.ok(query.includes("v2ChatComposerCanSubmit"));
  assert.ok(query.includes("V2_CHAT_TEXT_MAX_LENGTH"));
  assert.ok(query.includes("V2_CHAT_DELETED_TOMBSTONE"));
  assert.equal(query.includes("v2ChatGetUrl"), false);
  assert.equal(query.includes("assignedAgentId"), false);
}

const tests: Array<[string, () => void]> = [
  ["canonical routes", testCanonicalRoutes],
  ["send body only", testSendBodyIsBodyOnly],
  ["composer parity", testComposerParity],
  ["transcript", testTranscriptAlignmentAndTombstone],
  ["first message merge", testMergeAndFirstMessage],
  ["read once", testReadOnce],
  ["error copy", testErrorCopy],
  ["unread divider", testUnreadDivider],
  ["older skip", testOlderSkip],
  ["tenant FAB + four tabs", testTenantOnlyFabAndNoSixthTab],
  ["account nav + callback", testAccountNavAndCallback],
  ["no Agent coupling", testNoAgentCouplingOrForbiddenFeatures],
  ["shared helpers", testSharedComposerHelpersOnly],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}

console.log(`\n${tests.length} passed`);
