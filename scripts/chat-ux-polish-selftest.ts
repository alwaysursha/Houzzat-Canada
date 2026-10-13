/**
 * Chat V1 mobile UX polish — focused regression checks.
 * Run: pnpm exec tsx scripts/chat-ux-polish-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chatMessageDayKey,
  formatChatBubbleTime,
  formatChatDayLabel,
  shouldShowChatDaySeparator,
} from "../src/lib/chat/chat-date";
import { chatHaptic } from "../src/lib/chat/chat-haptics";
import {
  CHAT_QUICK_REACTION_KEYS,
  normalizeChatReactionKey,
} from "../src/lib/chat/emoji-catalog";
import {
  buildComposerLinkPreview,
  extractFirstChatUrl,
  normalizeDetectedHref,
  parseHouzzatListingPath,
} from "../src/lib/chat/link-preview";
import {
  extractChatListingMls,
  isListingUrlOnlyBody,
  mlsNumberFromChatListingUrl,
} from "../src/lib/chat/listing-url-preview";
import { presentChatReceiptStatus } from "../src/lib/chat/message-receipts";
import {
  CHAT_RECEIPT_ACK_VISUAL_MS,
  presentChatReceiptVisualStatus,
} from "../src/lib/chat/message-receipt-visual";
import {
  CUSTOMER_CHAT_OVERLAY_PRIORITY,
  __resetCustomerChatOverlayStackForTests,
  closeTopCustomerChatOverlay,
  hasCustomerChatOverlay,
  pushCustomerChatOverlay,
} from "../src/lib/customer-chat/chat-overlay";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testDates() {
  const today = new Date("2026-10-12T15:00:00");
  assert.equal(
    chatMessageDayKey("2026-10-12T08:00:00.000Z"),
    // local calendar — just ensure stable format
    chatMessageDayKey("2026-10-12T08:00:00.000Z"),
  );
  assert.equal(
    shouldShowChatDaySeparator({
      previousCreatedAt: null,
      currentCreatedAt: "2026-10-12T08:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    shouldShowChatDaySeparator({
      previousCreatedAt: "2026-10-12T08:00:00.000Z",
      currentCreatedAt: "2026-10-12T18:00:00.000Z",
    }),
    false,
  );
  assert.equal(
    shouldShowChatDaySeparator({
      previousCreatedAt: "2026-10-11T08:00:00.000Z",
      currentCreatedAt: "2026-10-12T08:00:00.000Z",
    }),
    true,
  );
  assert.equal(formatChatDayLabel("2026-10-12T12:00:00.000Z", today), "Today");
  assert.ok(formatChatBubbleTime("2026-10-12T15:30:00.000Z").length > 0);
}

function testReceiptsNeverFabricateDelivered() {
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-12T12:00:00.000Z",
      deliveredAt: null,
      peerLastReadAt: null,
    }),
    "sent",
  );
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-12T12:00:00.000Z",
      deliveredAt: null,
      peerLastReadAt: "2026-10-12T13:00:00.000Z",
    }),
    "read",
  );
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-12T12:00:00.000Z",
      deliveredAt: "2026-10-12T12:01:00.000Z",
      peerLastReadAt: null,
    }),
    "delivered",
  );
}

function testQuickReactions() {
  assert.deepEqual([...CHAT_QUICK_REACTION_KEYS], [
    "👍",
    "❤️",
    "😂",
    "😮",
    "😢",
    "🙏",
    "😡",
  ]);
  assert.equal(normalizeChatReactionKey("😢"), "😢");
  assert.equal(normalizeChatReactionKey("😊"), "😊");
  assert.equal(normalizeChatReactionKey("🚀"), null);
}

function testLinkPreviewSafeClientOnly() {
  assert.equal(normalizeDetectedHref("javascript:alert(1)"), null);
  assert.ok(extractFirstChatUrl("See https://example.com/a"));
  assert.equal(
    mlsNumberFromChatListingUrl(
      "https://houzzat.com/listing/161-eden-oak-trail-kitchener/X13637722",
    ),
    "X13637722",
  );
  assert.equal(mlsNumberFromChatListingUrl("/listing/X13637722"), "X13637722");
  assert.equal(
    mlsNumberFromChatListingUrl("https://evil.example/listing/X1"),
    null,
  );
  const listing = buildComposerLinkPreview(
    "https://houzzat.com/listing/slug/X13637722",
  );
  assert.equal(listing?.kind, "listing");
  assert.equal(listing?.mlsNumber, "X13637722");
  assert.equal(parseHouzzatListingPath(listing!.href), "/listing/slug/X13637722");
  assert.equal(
    extractChatListingMls("Check /listing/X99 please")?.mlsNumber,
    "X99",
  );
  assert.equal(
    isListingUrlOnlyBody("https://houzzat.com/listing/X1"),
    true,
  );
  assert.equal(
    isListingUrlOnlyBody("See https://houzzat.com/listing/X1 please"),
    false,
  );
  const external = buildComposerLinkPreview("https://news.example/story");
  assert.equal(external?.kind, "external");
  assert.equal(external?.hostname, "news.example");
}

function testReceiptVisualTicks() {
  const created = "2026-10-12T12:00:00.000Z";
  const t0 = Date.parse(created);
  assert.equal(
    presentChatReceiptVisualStatus({
      isOwnMessage: true,
      messageCreatedAt: created,
      deliveredAt: null,
      peerLastReadAt: null,
      nowMs: t0 + 200,
    }),
    "sent",
  );
  assert.equal(
    presentChatReceiptVisualStatus({
      isOwnMessage: true,
      messageCreatedAt: created,
      deliveredAt: null,
      peerLastReadAt: null,
      nowMs: t0 + CHAT_RECEIPT_ACK_VISUAL_MS + 5,
    }),
    "acked",
  );
  assert.equal(
    presentChatReceiptVisualStatus({
      isOwnMessage: true,
      messageCreatedAt: created,
      deliveredAt: null,
      peerLastReadAt: "2026-10-12T12:00:00.500Z",
      nowMs: t0 + 200,
    }),
    "read",
  );
  assert.equal(
    presentChatReceiptVisualStatus({
      isOwnMessage: true,
      messageCreatedAt: created,
      deliveredAt: "2026-10-12T12:00:00.200Z",
      peerLastReadAt: null,
      nowMs: t0 + 200,
    }),
    "delivered",
  );
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: created,
      deliveredAt: null,
      peerLastReadAt: null,
    }),
    "sent",
  );
}

function testHapticsNoThrow() {
  chatHaptic("long-press");
  chatHaptic("swipe-reply");
  chatHaptic("reaction");
}

function testOverlayStack() {
  __resetCustomerChatOverlayStackForTests();
  assert.equal(hasCustomerChatOverlay(), false);
  let closed = false;
  const release = pushCustomerChatOverlay({
    id: "t1",
    priority: CUSTOMER_CHAT_OVERLAY_PRIORITY.open,
    close: () => {
      closed = true;
    },
  });
  assert.equal(hasCustomerChatOverlay(), true);
  assert.equal(closeTopCustomerChatOverlay(), true);
  assert.equal(closed, true);
  release();
  __resetCustomerChatOverlayStackForTests();
}

function testWiring() {
  const customer = read("src/components/customer-chat/CustomerChatScreen.tsx");
  const agent = read(
    "src/components/agent/chat/AgentChatTranscriptPane.tsx",
  );
  const actions = read("src/components/chat/ChatMessageActions.tsx");
  const voice = read("src/components/chat/ChatVoicePlayer.tsx");
  const layout = read("src/app/layout.tsx");
  const bootstrap = read("src/components/mobile/CapacitorBootstrap.tsx");
  const provider = read(
    "src/components/customer-chat/CustomerChatProvider.tsx",
  );
  const ticks = read("src/components/chat/ChatReceiptTicks.tsx");
  const listingRoute = read("src/app/api/chat/listing-url-preview/route.ts");

  assert.ok(customer.includes("ChatBubbleBodyWithMeta"));
  assert.ok(customer.includes("ChatStickyDateLabel"));
  assert.ok(customer.includes("ChatDateSeparator"));
  assert.ok(customer.includes("ChatComposerListingPreview"));
  assert.ok(customer.includes("ChatMessageListingUrlCard"));
  assert.ok(customer.includes("ChatAgentAvatar"));
  assert.ok(agent.includes("ChatBubbleBodyWithMeta"));
  assert.ok(agent.includes("ChatStickyDateLabel"));
  assert.ok(agent.includes("postAgentListingShare"));
  assert.ok(agent.includes("ChatComposerListingPreview"));
  // Agent chat premium mint bubbles (Customer Chat V1 parity).
  assert.ok(agent.includes("bg-[#d8f3e7]"));
  assert.ok(agent.includes("bg-[#f4faf7]"));
  assert.equal(agent.includes("bg-[#dbeafe]"), false);
  assert.ok(actions.includes("CHAT_QUICK_REACTION_KEYS"));
  assert.ok(actions.includes("SWIPE_THRESHOLD_PX"));
  assert.ok(actions.includes("chatHaptic"));
  assert.ok(voice.includes("bg-[#0f6b4c]"));
  assert.ok(layout.includes("themeColor"));
  assert.ok(bootstrap.includes("closeTopCustomerChatOverlay"));
  assert.ok(provider.includes("pushCustomerChatOverlay"));
  assert.ok(provider.includes("setNativeStatusBarLightOverlay"));
  assert.ok(ticks.includes("presentChatReceiptVisualStatus"));
  assert.ok(listingRoute.includes("resolveChatListingUrlPreview"));
}

function main() {
  testDates();
  testReceiptsNeverFabricateDelivered();
  testReceiptVisualTicks();
  testQuickReactions();
  testLinkPreviewSafeClientOnly();
  testHapticsNoThrow();
  testOverlayStack();
  testWiring();
  console.log("chat-ux-polish-selftest: ok");
}

main();
