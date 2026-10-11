/**
 * Chat V1 Milestone 4W — LISTING_SHARE transcript card UI (no DB).
 * Run: pnpm chat-listing-share-ui:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LISTING_SHARE_CARD,
  LISTING_SHARE_MESSAGE_BODY,
  LISTING_SHARE_PAYLOAD_VERSION,
  presentListingSharePayload,
  resolveChatListingShareView,
  type ListingSharePresentView,
} from "../src/lib/conversations/listing-share";
import {
  formatListPrice,
  listingStatusLabel,
  propertyTypeLabel,
} from "../src/lib/listings/constants";
import { shouldGroupV2ChatMessage } from "../src/lib/agent/lead-profile-v2/chat-query";
import { shouldGroupCustomerChatMessage } from "../src/lib/customer-chat/query";
import type { LeadProfileV2ChatMessage } from "../src/lib/agent/lead-profile-v2/types";
import type { CustomerChatMessage } from "../src/lib/customer-chat/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function validShare(
  overrides: Partial<ListingSharePresentView> = {},
): ListingSharePresentView {
  return {
    card: LISTING_SHARE_CARD,
    version: LISTING_SHARE_PAYLOAD_VERSION,
    listingId: "listing_1",
    mlsNumber: "X1234567",
    listPrice: 899_000,
    status: "ACTIVE",
    transactionType: "SALE",
    propertyType: "DETACHED",
    beds: 3,
    baths: 2.5,
    addressLine: "123 Main Street West",
    unitNumber: null,
    city: "Toronto",
    province: "ON",
    postalCode: "M5V 1A1",
    primaryImageUrl: "https://ampre.ca/listing/primary.jpg",
    href: "/listing/123-main-street-west-toronto-on/X1234567",
    sharedAt: "2026-10-10T12:00:00.000Z",
    ...overrides,
  };
}

function testResolverAndFormatting() {
  const share = validShare();
  const resolved = resolveChatListingShareView(share);
  assert.equal(resolved.kind, "share");
  if (resolved.kind !== "share") return;
  assert.equal(resolved.view.listPrice, 899_000);
  assert.equal(
    formatListPrice(resolved.view.listPrice, resolved.view.transactionType),
    formatListPrice(899_000, "SALE"),
  );
  assert.equal(
    listingStatusLabel(resolved.view.status, resolved.view.transactionType),
    "For Sale",
  );
  assert.equal(propertyTypeLabel(resolved.view.propertyType), "Detached");
  assert.ok(resolved.view.href.startsWith("/listing/"));
  assert.equal(presentListingSharePayload(share)?.href, share.href);

  const missingImage = resolveChatListingShareView(
    validShare({ primaryImageUrl: null }),
  );
  assert.equal(missingImage.kind, "share");
  if (missingImage.kind === "share") {
    assert.equal(missingImage.view.primaryImageUrl, null);
  }

  const longAddress = resolveChatListingShareView(
    validShare({
      addressLine:
        "12345 Extremely Long Residential Boulevard Named After Someone Important",
      city: "Mississauga",
    }),
  );
  assert.equal(longAddress.kind, "share");

  assert.equal(resolveChatListingShareView(null).kind, "none");
  assert.equal(resolveChatListingShareView({ hello: "world" }).kind, "none");
  assert.equal(
    resolveChatListingShareView({
      card: LISTING_SHARE_CARD,
      version: 1,
      listingId: "x",
    }).kind,
    "fallback",
  );
  assert.equal(
    resolveChatListingShareView({
      ...validShare(),
      soldPrice: 1,
    }).kind,
    "fallback",
  );
  assert.equal(
    resolveChatListingShareView({
      ...validShare(),
      primaryImageUrl: "https://evil.example/photo.jpg",
    }).kind,
    "fallback",
  );
  assert.equal(
    resolveChatListingShareView({
      ...validShare(),
      href: "https://evil.example/listing",
    }).kind,
    "fallback",
  );
}

function testComponentSource() {
  const card = read("src/components/chat/ChatListingShareCard.tsx");
  assert.match(card, /Shared property/);
  assert.match(card, /View Property/);
  assert.match(card, /ListingLink/);
  assert.match(card, /ListingPhoto/);
  assert.match(card, /aspect-\[16\/9\]/);
  assert.match(card, /max-w-\[min\(100%,17\.5rem\)\]/);
  assert.match(card, /resolveChatListingShareView/);
  assert.match(card, /primaryImageUrl/);
  assert.match(card, /Photo unavailable/);
  assert.match(card, /LISTING_SHARE_MESSAGE_BODY/);
  assert.match(card, /formatListPrice/);
  assert.match(card, /listingStatusLabel/);
  assert.doesNotMatch(card, /prisma/i);
  assert.doesNotMatch(card, /fetch\(/);
  assert.doesNotMatch(card, /setInterval/);
  assert.doesNotMatch(card, /listing\.findUnique/);
  assert.doesNotMatch(card, /soldPrice/);

  // Safe href only from validated snapshot
  assert.match(card, /href=\{view\.href\}/);
  assert.doesNotMatch(card, /href=\{payload/);
}

function testTranscriptParity() {
  const agent = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  const customer = read("src/components/customer-chat/CustomerChatScreen.tsx");

  for (const src of [agent, customer]) {
    assert.match(src, /ChatListingShareCard/);
    assert.match(src, /resolveChatListingShareView/);
    assert.match(src, /listingShare\.kind !== "none"/);
    assert.match(src, /message\.channel === "CHAT"/);
    assert.doesNotMatch(src, /listing\.findUnique/);
    assert.doesNotMatch(src, /\/api\/listings\//);
  }

  // Plain TEXT path still present
  assert.match(agent, /v2ChatMessageBody/);
  assert.match(customer, /customerChatMessageBody/);
  assert.match(agent, /whitespace-pre-wrap/);
  assert.match(customer, /whitespace-pre-wrap/);

  // Voice / reactions / receipts unchanged
  assert.match(agent, /ChatVoicePlayer/);
  assert.match(customer, /ChatVoicePlayer/);
  assert.match(agent, /ChatReactionBar/);
  assert.match(customer, /ChatReactionBar/);
  assert.match(agent, /ChatReceiptLabel/);
  assert.match(customer, /ChatReceiptLabel/);
}

function testGroupingBreaksOnShare() {
  const baseAgent = {
    id: "m1",
    channel: "CHAT" as const,
    kind: "TEXT" as const,
    senderKind: "AGENT" as const,
    senderUserId: "agent_1",
    senderName: "Ali",
    body: "Hello",
    payload: null,
    createdAt: "2026-10-10T12:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    deliveredAt: null,
    replyToMessageId: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    smsSource: null,
    providerStatus: null,
  } satisfies LeadProfileV2ChatMessage;

  const shareAgent: LeadProfileV2ChatMessage = {
    ...baseAgent,
    id: "m2",
    body: LISTING_SHARE_MESSAGE_BODY,
    payload: validShare(),
  };
  assert.equal(shouldGroupV2ChatMessage(baseAgent, shareAgent), false);
  assert.equal(
    shouldGroupV2ChatMessage(shareAgent, { ...baseAgent, id: "m3" }),
    false,
  );
  assert.equal(
    shouldGroupV2ChatMessage(baseAgent, { ...baseAgent, id: "m3", body: "Hi" }),
    true,
  );

  const baseCustomer = {
    id: "c1",
    channel: "CHAT" as const,
    kind: "TEXT" as const,
    senderKind: "AGENT" as const,
    senderName: "Ali",
    body: "Hello",
    payload: null,
    createdAt: "2026-10-10T12:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    deliveredAt: null,
    replyToMessageId: null,
    replyTo: null,
    reactions: [],
    attachments: [],
  } satisfies CustomerChatMessage;

  const shareCustomer: CustomerChatMessage = {
    ...baseCustomer,
    id: "c2",
    body: LISTING_SHARE_MESSAGE_BODY,
    payload: validShare(),
  };
  assert.equal(
    shouldGroupCustomerChatMessage(baseCustomer, shareCustomer),
    false,
  );
  assert.equal(
    shouldGroupCustomerChatMessage(baseCustomer, {
      ...baseCustomer,
      id: "c3",
      body: "Hi",
    }),
    true,
  );
}

function testPlainTextUnaffected() {
  const plain = {
    card: "NOT_A_SHARE",
    body: "Just checking in",
  };
  assert.equal(resolveChatListingShareView(plain).kind, "none");
  assert.equal(resolveChatListingShareView(undefined).kind, "none");
  assert.equal(LISTING_SHARE_MESSAGE_BODY.includes("shared a property"), true);
}

function main() {
  testResolverAndFormatting();
  testComponentSource();
  testTranscriptParity();
  testGroupingBreaksOnShare();
  testPlainTextUnaffected();
  console.log("chat-listing-share-ui-selftest: ok");
}

main();
