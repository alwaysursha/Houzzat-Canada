/**
 * Floating Customer Chat + Quick Question + unread auto-open.
 * Run: pnpm customer-chat-floating:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CUSTOMER_CHAT_FALLBACK_AGENT_NAME,
  CUSTOMER_CHAT_OPEN_EVENT,
  clampCustomerChatWindowPosition,
  clearCustomerChatSessionState,
  customerChatAgentPhotoAllowed,
  customerChatFloatingStorageKeys,
  customerChatUnreadAutoOpenBatchKey,
  defaultCustomerChatWindowPosition,
  findLatestUnreadAgentMessageId,
  formatCustomerChatListingBanner,
  isCustomerChatMobileViewport,
  normalizeCustomerChatDraft,
  normalizeCustomerChatListingContext,
  customerChatAgentAvailabilityLabel,
  presentCustomerChatAgentAvailability,
  presentCustomerChatAgentInitials,
  presentCustomerChatAgentName,
  readCustomerChatBatchKey,
  readCustomerChatSessionDraft,
  readCustomerChatSessionListing,
  shouldAutoOpenCustomerChatForUnread,
  customerChatUnreadPreviewBody,
  shouldDeferCustomerChatAutoOpen,
  shouldPeekCustomerChatUnread,
  writeCustomerChatBatchKey,
  writeCustomerChatSessionDraft,
  writeCustomerChatSessionListing,
} from "../src/lib/customer-chat/floating-chat";
import {
  CUSTOMER_CHAT_HISTORY_STATE_KEY,
  shouldCloseCustomerChatOnPopState,
} from "../src/lib/customer-chat/chat-overlay";
import {
  draftFromStartChatIntent,
  listingContextFromStartChatIntent,
  openGuestStartChatIntent,
  resumeStartChatIntent,
} from "../src/lib/auth/start-chat-intent";
import {
  createCaptureIntent,
  type CaptureIntentStore,
} from "../src/lib/auth/capture-intent";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "acme.houzzatpro.com";
const NOW = 1_700_000_000_000;

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function memoryStore(): CaptureIntentStore & { raw: string | null } {
  return {
    raw: null,
    get() {
      return this.raw;
    },
    set(value) {
      this.raw = value;
    },
    remove() {
      this.raw = null;
    },
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

function testWindowClampAndMobile() {
  const clamped = clampCustomerChatWindowPosition(
    { x: -40, y: 9_000 },
    { width: 1200, height: 800 },
  );
  assert.equal(clamped.x, 12);
  assert.ok(clamped.y < 800);
  const def = defaultCustomerChatWindowPosition({ width: 1280, height: 900 });
  assert.ok(def.x > 800);
  assert.equal(isCustomerChatMobileViewport(767), true);
  assert.equal(isCustomerChatMobileViewport(768), false);
}

function testOpenMinimizeCloseWiring() {
  const provider = read("src/components/customer-chat/CustomerChatProvider.tsx");
  const floating = read(
    "src/components/customer-chat/CustomerChatFloatingWindow.tsx",
  );
  const screen = read("src/components/customer-chat/CustomerChatScreen.tsx");
  assert.ok(provider.includes("CustomerChatFloatingWindow"));
  assert.ok(provider.includes("CustomerChatUnreadPreview"));
  assert.ok(provider.includes('mode === "open"'));
  assert.ok(provider.includes('setMode("preview")'));
  assert.ok(provider.includes('setMode("minimized")') || provider.includes("minimize"));
  assert.ok(provider.includes("closeWithDismiss"));
  assert.ok(floating.includes('chrome="floating"'));
  assert.ok(floating.includes('chrome="mobile-sheet"'));
  assert.ok(floating.includes("aria-label=\"Minimize chat\"") || screen.includes("Minimize chat"));
  assert.ok(screen.includes("onMinimize"));
  assert.ok(screen.includes("onClose"));
  assert.ok(screen.includes("onPointerDown"));
  assert.equal(floating.includes("draggable"), false);
  assert.ok(provider.includes("CUSTOMER_CHAT_OPEN_EVENT"));
}

function testListingContextPreservation() {
  const listing = normalizeCustomerChatListingContext({
    mlsNumber: "w1234567",
    addressLine: " 12 Main St ",
    city: " Toronto ",
  });
  assert.deepEqual(listing, {
    mlsNumber: "w1234567",
    addressLine: "12 Main St",
    city: "Toronto",
  });
  assert.equal(
    formatCustomerChatListingBanner(listing),
    "12 Main St, Toronto · MLS® w1234567",
  );
  const storage = memoryStorage();
  writeCustomerChatSessionListing(storage, "u1", listing);
  writeCustomerChatSessionDraft(storage, "u1", "Is parking included?");
  assert.deepEqual(readCustomerChatSessionListing(storage, "u1"), listing);
  assert.equal(
    readCustomerChatSessionDraft(storage, "u1"),
    "Is parking included?",
  );
  assert.equal(normalizeCustomerChatDraft("  hi  "), "  hi  ");

  const qa = read("src/components/listings/ListingQaPanel.tsx");
  assert.ok(qa.includes("Chat with your agent"));
  assert.ok(qa.includes("openGuestStartChatIntent"));
  assert.ok(qa.includes("listingContext"));
  assert.ok(qa.includes("draftMessage"));
  assert.equal(qa.includes("buildListingExpertWhatsAppUrl"), false);
  assert.equal(qa.includes("Message on WhatsApp"), false);
  const detail = read("src/components/listings/ListingDetailView.tsx");
  assert.ok(detail.includes("<ListingQaPanel"));
}

function testGuestAuthResumeKeepsDraft() {
  const store = memoryStore();
  const opened: unknown[] = [];
  const result = openGuestStartChatIntent({
    host: HOST,
    now: NOW,
    store,
    openAuth(options) {
      opened.push(options);
    },
    listingContext: {
      mlsNumber: "W1234567",
      addressLine: "12 Main St",
      city: "Toronto",
    },
    draftMessage: "Any offers?",
  });
  assert.equal(result.ok, true);
  assert.equal(opened.length, 1);
  if (!result.ok) return;
  assert.equal(result.intent.type, "START_CHAT");
  if (result.intent.type !== "START_CHAT") return;
  assert.equal(result.intent.mlsNumber, "W1234567");
  assert.equal(result.intent.draftMessage, "Any offers?");
  assert.deepEqual(listingContextFromStartChatIntent(result.intent), {
    mlsNumber: "W1234567",
    addressLine: "12 Main St",
    city: "Toronto",
  });
  assert.equal(draftFromStartChatIntent(result.intent), "Any offers?");

  const floatingOpens: unknown[] = [];
  const resumed = resumeStartChatIntent(result.intent, {
    pathname: "/listing/12-main/W1234567",
    openFloating(detail) {
      floatingOpens.push(detail);
      return true;
    },
    navigate() {
      throw new Error("must not navigate when floating opens");
    },
  });
  assert.equal(resumed, "opened");
  assert.equal(floatingOpens.length, 1);
  assert.equal(
    (floatingOpens[0] as { draft?: string }).draft,
    "Any offers?",
  );

  const created = createCaptureIntent(
    {
      type: "START_CHAT",
      callbackPath: "/account/chat",
      mlsNumber: "W1234567",
      addressLine: "12 Main St",
      city: "Toronto",
      draftMessage: "Keep me",
    },
    { host: HOST, now: NOW },
  );
  assert.equal(created.ok, true);
}

function testAgentIdentityFallback() {
  assert.equal(CUSTOMER_CHAT_FALLBACK_AGENT_NAME, "Houzzat");
  assert.equal(presentCustomerChatAgentName(null), CUSTOMER_CHAT_FALLBACK_AGENT_NAME);
  assert.equal(
    presentCustomerChatAgentName({ name: "  Ali Syed  ", photoUrl: null }),
    "Ali Syed",
  );
  assert.equal(presentCustomerChatAgentInitials(null), "HZ");
  assert.equal(
    presentCustomerChatAgentInitials({ name: "Ali Syed", photoUrl: null }),
    "AS",
  );
  assert.equal(
    customerChatUnreadPreviewBody({ body: "Voice note", hasVoiceAttachment: true }),
    "Sent you a voice message",
  );
  assert.equal(
    customerChatUnreadPreviewBody({ body: "Hi", isListingShare: true }),
    "Shared a property with you",
  );
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "preview",
      batchKey: "c:1:m",
      alreadyOpenedBatchKey: null,
      dismissedBatchKey: null,
      deferAutoOpen: false,
    }),
    false,
  );
  assert.equal(
    customerChatAgentPhotoAllowed({
      assignedAgentId: "agent-1",
      primaryAgentId: "agent-1",
    }),
    true,
  );
  assert.equal(
    customerChatAgentPhotoAllowed({
      assignedAgentId: "agent-2",
      primaryAgentId: "agent-1",
    }),
    false,
  );
  assert.equal(
    customerChatAgentPhotoAllowed({
      assignedAgentId: null,
      primaryAgentId: "agent-1",
    }),
    false,
  );
  const api = read("src/lib/conversations/customer-conversation.ts");
  assert.ok(api.includes("resolveAssignedCustomerChatAgentIdentity"));
  assert.ok(api.includes("customerChatAgentPhotoAllowed"));
  assert.ok(api.includes("agentProfilePhotoUrl"));
  assert.equal(api.includes("brokerageLogoUrl: true"), false);
  assert.equal(api.includes("select: { name: true, image"), false);
  assert.equal(api.includes("Usually replies"), false);
  assert.equal(api.includes("response time"), false);
  const screen = read("src/components/customer-chat/CustomerChatScreen.tsx");
  assert.ok(screen.includes("presentCustomerChatAgentName"));
  assert.ok(screen.includes("AgentAvatar"));
  assert.ok(screen.includes("AgentAvailabilityLine"));
  assert.ok(screen.includes("presentCustomerChatAgentAvailability"));
  assert.ok(screen.includes("customerChatAgentAvailabilityLabel"));
  assert.equal(screen.includes("Usually replies"), false);
  assert.equal(screen.includes("response time"), false);
  assert.equal(screen.includes("presenceUntil"), false);
  assert.equal(screen.includes("availabilityPreference"), false);

  assert.equal(presentCustomerChatAgentAvailability("online"), "online");
  assert.equal(presentCustomerChatAgentAvailability("away"), "away");
  assert.equal(presentCustomerChatAgentAvailability("offline"), "offline");
  assert.equal(presentCustomerChatAgentAvailability(undefined), "offline");
  assert.equal(presentCustomerChatAgentAvailability(null), "offline");
  assert.equal(presentCustomerChatAgentAvailability("ONLINE"), "offline");
  assert.equal(presentCustomerChatAgentAvailability(""), "offline");
  assert.equal(customerChatAgentAvailabilityLabel("online"), "Online");
  assert.equal(customerChatAgentAvailabilityLabel("away"), "Away");
  assert.equal(customerChatAgentAvailabilityLabel("offline"), "Offline");

  const hook = read("src/components/customer-chat/useCustomerChatThread.ts");
  assert.ok(hook.includes("agentAvailability"));
  assert.ok(hook.includes('agentAvailability: "offline"'));
  assert.ok(hook.includes("live && prev"));
  assert.ok(hook.includes("presentCustomerChatAgentAvailability"));
  assert.ok(
    hook.includes("agentAvailability: presentCustomerChatAgentAvailability"),
  );
}

function testAutoOpenBatchDedupAndDismissal() {
  const latest = findLatestUnreadAgentMessageId({
    messages: [
      {
        id: "c1",
        senderKind: "CUSTOMER",
        createdAt: "2026-09-17T12:00:00.000Z",
      },
      {
        id: "a1",
        senderKind: "AGENT",
        createdAt: "2026-09-17T12:05:00.000Z",
      },
      {
        id: "a2",
        senderKind: "AGENT",
        createdAt: "2026-09-17T12:06:00.000Z",
      },
    ],
    customerLastReadAt: "2026-09-17T12:01:00.000Z",
    unreadCount: 2,
  });
  assert.equal(latest, "a2");
  const batch = customerChatUnreadAutoOpenBatchKey({
    conversationId: "conv-1",
    unreadCount: 2,
    latestUnreadAgentMessageId: latest,
  });
  assert.equal(batch, "conv-1:2:a2");
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "closed",
      batchKey: batch,
      alreadyOpenedBatchKey: null,
      dismissedBatchKey: null,
      deferAutoOpen: false,
    }),
    true,
  );
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "closed",
      batchKey: batch,
      alreadyOpenedBatchKey: batch,
      dismissedBatchKey: null,
      deferAutoOpen: false,
    }),
    false,
  );
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "closed",
      batchKey: batch,
      alreadyOpenedBatchKey: null,
      dismissedBatchKey: batch,
      deferAutoOpen: false,
    }),
    false,
  );
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "open",
      batchKey: batch,
      alreadyOpenedBatchKey: null,
      dismissedBatchKey: null,
      deferAutoOpen: false,
    }),
    false,
  );
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "preview",
      batchKey: batch,
      alreadyOpenedBatchKey: null,
      dismissedBatchKey: null,
      deferAutoOpen: false,
    }),
    false,
  );
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "closed",
      batchKey: batch,
      alreadyOpenedBatchKey: null,
      dismissedBatchKey: null,
      deferAutoOpen: true,
    }),
    false,
  );
  const nextBatch = customerChatUnreadAutoOpenBatchKey({
    conversationId: "conv-1",
    unreadCount: 3,
    latestUnreadAgentMessageId: "a3",
  });
  assert.notEqual(nextBatch, batch);
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "closed",
      batchKey: nextBatch,
      alreadyOpenedBatchKey: batch,
      dismissedBatchKey: batch,
      deferAutoOpen: false,
    }),
    true,
  );
}

function testDeferTypingAndForms() {
  assert.equal(
    shouldDeferCustomerChatAutoOpen({
      activeElement: null,
      pathname: "/sign-in",
    }),
    true,
  );
  assert.equal(
    shouldDeferCustomerChatAutoOpen({
      activeElement: null,
      pathname: "/auth/verify",
    }),
    true,
  );
  assert.equal(
    shouldDeferCustomerChatAutoOpen({
      activeElement: null,
      pathname: "/listing/x/W1",
    }),
    false,
  );
  const helper = read("src/lib/customer-chat/floating-chat.ts");
  assert.ok(helper.includes('tag === "TEXTAREA"'));
  assert.ok(helper.includes("data-customer-chat-defer-auto-open"));
}

function testLogoutAccountSwitchIsolation() {
  const storage = memoryStorage();
  writeCustomerChatSessionDraft(storage, "user-a", "private draft");
  writeCustomerChatSessionListing(storage, "user-a", {
    mlsNumber: "W1",
    addressLine: "1 A",
    city: "Toronto",
  });
  writeCustomerChatBatchKey(storage, "user-a", "dismissedBatch", "conv:1:a1");
  const keysA = customerChatFloatingStorageKeys("user-a");
  assert.ok(storage.getItem(keysA.draft));
  clearCustomerChatSessionState(storage, "user-a");
  assert.equal(storage.getItem(keysA.draft), null);
  assert.equal(storage.getItem(keysA.listing), null);
  assert.equal(storage.getItem(keysA.dismissedBatch), null);
  assert.equal(readCustomerChatSessionDraft(storage, "user-b"), "");
  assert.equal(readCustomerChatBatchKey(storage, "user-b", "dismissedBatch"), null);
  const provider = read("src/components/customer-chat/CustomerChatProvider.tsx");
  assert.ok(provider.includes("clearCustomerChatSessionState"));
  assert.ok(provider.includes("prevUserIdRef"));
}

function testDismissPersistenceAndPeekGuards() {
  const storage = memoryStorage();
  const batch = "conv-1:2:a2";
  writeCustomerChatBatchKey(storage, "user-1", "dismissedBatch", batch);
  writeCustomerChatBatchKey(storage, "user-1", "autoOpenBatch", batch);
  assert.equal(readCustomerChatBatchKey(storage, "user-1", "dismissedBatch"), batch);
  assert.equal(readCustomerChatBatchKey(storage, "user-1", "autoOpenBatch"), batch);
  assert.equal(
    shouldAutoOpenCustomerChatForUnread({
      authenticated: true,
      mode: "closed",
      batchKey: batch,
      alreadyOpenedBatchKey: readCustomerChatBatchKey(
        storage,
        "user-1",
        "autoOpenBatch",
      ),
      dismissedBatchKey: readCustomerChatBatchKey(
        storage,
        "user-1",
        "dismissedBatch",
      ),
      deferAutoOpen: false,
    }),
    false,
  );
  assert.equal(
    shouldPeekCustomerChatUnread({ floatingEnabled: true, mode: "closed" }),
    true,
  );
  assert.equal(
    shouldPeekCustomerChatUnread({ floatingEnabled: true, mode: "minimized" }),
    true,
  );
  assert.equal(
    shouldPeekCustomerChatUnread({ floatingEnabled: true, mode: "open" }),
    false,
  );
  assert.equal(
    shouldPeekCustomerChatUnread({ floatingEnabled: false, mode: "closed" }),
    false,
  );

  const provider = read("src/components/customer-chat/CustomerChatProvider.tsx");
  assert.ok(provider.includes("shouldPeekCustomerChatUnread"));
  assert.ok(provider.includes("rememberDismissedBatch"));
  assert.ok(provider.includes("writeCustomerChatBatchKey"));
  assert.ok(provider.includes("lastUnreadBatchKeyRef"));
  assert.equal(provider.includes("CUSTOMER_CHAT_READ_ROUTE"), false);
  assert.equal(provider.includes('method: "POST"'), false);
  assert.ok(provider.includes("never POST /read") || provider.includes("must not mark read"));
}

function testExistingFlowsPreserved() {
  assert.equal(CUSTOMER_CHAT_OPEN_EVENT, "houzzat:customer-chat-open");
  const page = read("src/app/(account)/account/chat/page.tsx");
  assert.ok(page.includes("CustomerChatScreen"));
  const providers = read("src/components/Providers.tsx");
  assert.ok(providers.includes("CustomerChatProvider"));
  const hook = read("src/components/customer-chat/useCustomerChatThread.ts");
  assert.ok(hook.includes("chatVisible"));
  assert.ok(hook.includes("shouldMarkCustomerChatRead"));
  assert.ok(hook.includes("CUSTOMER_CHAT_READ_ROUTE"));
  const get = read("src/lib/conversations/customer-conversation.ts");
  assert.ok(get.includes("resolveCustomerChatLead"));
  assert.ok(get.includes("ensureCustomerChatLead"));
  assert.ok(get.includes("GET never creates a Lead") || get.includes("never creates a Lead"));
  const startChat = read("src/lib/auth/start-chat-intent.ts");
  assert.equal(startChat.includes("fetch("), false);
  assert.equal(startChat.includes("ensureCustomerChatLead"), false);
  assert.ok(startChat.includes("Does not send a message"));
}

function testListingSheetPopStateKeepsChatOpen() {
  const chatMarker = { [CUSTOMER_CHAT_HISTORY_STATE_KEY]: true as const };
  // Desktop/mobile: closing listing sheet lands on chat history entry.
  assert.equal(
    shouldCloseCustomerChatOnPopState({
      eventState: chatMarker,
      historyState: chatMarker,
      listingSheetOpen: false,
    }),
    false,
  );
  // While listing sheet is open, ignore joint-history pops.
  assert.equal(
    shouldCloseCustomerChatOnPopState({
      eventState: null,
      historyState: chatMarker,
      listingSheetOpen: true,
    }),
    false,
  );
  // Genuine Back away from chat overlay still closes.
  assert.equal(
    shouldCloseCustomerChatOnPopState({
      eventState: null,
      historyState: null,
      listingSheetOpen: false,
    }),
    true,
  );

  const provider = read("src/components/customer-chat/CustomerChatProvider.tsx");
  assert.ok(provider.includes("shouldCloseCustomerChatOnPopState"));
  assert.ok(provider.includes("isListingSheetOpen"));
  assert.ok(provider.includes("PopStateEvent"));
}

const tests: Array<[string, () => void]> = [
  ["window clamp + mobile", testWindowClampAndMobile],
  ["open/minimize/close wiring", testOpenMinimizeCloseWiring],
  ["listing context", testListingContextPreservation],
  ["guest auth resume", testGuestAuthResumeKeepsDraft],
  ["agent identity fallback", testAgentIdentityFallback],
  ["auto-open batch dedupe", testAutoOpenBatchDedupAndDismissal],
  ["defer typing/forms", testDeferTypingAndForms],
  ["logout isolation", testLogoutAccountSwitchIsolation],
  ["dismiss persistence + peek guards", testDismissPersistenceAndPeekGuards],
  ["listing sheet popstate keeps chat", testListingSheetPopStateKeepsChatOpen],
  ["existing flows", testExistingFlowsPreserved],
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
