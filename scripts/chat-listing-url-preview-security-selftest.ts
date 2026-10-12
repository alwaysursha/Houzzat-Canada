/**
 * Security-focused checks for chat listing URL preview + receipt ticks.
 * Run: pnpm exec tsx scripts/chat-listing-url-preview-security-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractChatListingMls,
  mlsNumberFromChatListingUrl,
} from "../src/lib/chat/listing-url-preview";
import { presentChatReceiptVisualStatus } from "../src/lib/chat/message-receipt-visual";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testServerDoesNotFetchOrRecordViews() {
  const server = read("src/lib/chat/listing-url-preview-server.ts");
  const route = read("src/app/api/chat/listing-url-preview/route.ts");
  assert.equal(server.includes("fetch("), false);
  assert.equal(route.includes("fetch("), false);
  assert.equal(server.includes("listingView"), false);
  assert.equal(route.includes("listingView"), false);
  assert.equal(server.includes("LeadActivity"), false);
  assert.equal(route.includes("LeadActivity"), false);
  assert.ok(server.includes("await auth()"));
  assert.ok(server.includes("buildListingShareSnapshot"));
  assert.ok(server.includes("resolveListingEntitlementContextForRequest"));
  // Response builder must not pass soldPrice into the preview object.
  assert.ok(server.includes("// Never surface soldPrice"));
  assert.equal(/soldPrice:\s*L\.soldPrice/.test(server), false);
  assert.equal(/soldPrice:\s*listing\.soldPrice/.test(server), false);
  assert.ok(server.includes("panelToPresentView"));
}

function testHostParsingCannotBypass() {
  // Foreign absolute — rejected at host check and must not bare-path fallback.
  assert.equal(
    mlsNumberFromChatListingUrl("https://evil.example/listing/X1"),
    null,
  );
  assert.equal(
    mlsNumberFromChatListingUrl("https://evil.example.com/listing/foo/X1"),
    null,
  );
  assert.equal(extractChatListingMls("https://evil.example/listing/X1"), null);
  assert.equal(
    extractChatListingMls("see https://evil.example/listing/X1 now"),
    null,
  );

  // Foreign URL with query-string listing path — still no preview.
  assert.equal(
    extractChatListingMls("https://evil.example/go?next=/listing/X1"),
    null,
  );
  assert.equal(
    extractChatListingMls("https://evil.example/?path=/listing/slug/X9"),
    null,
  );

  // Protocol-relative foreign URL.
  assert.equal(extractChatListingMls("//evil.example/listing/X1"), null);
  assert.equal(
    extractChatListingMls("click //phish.test/listing/foo/X2 please"),
    null,
  );

  // Allowed Houzzat canonical + legacy.
  assert.equal(
    mlsNumberFromChatListingUrl(
      "https://houzzat.com/listing/slug/X13637722",
    ),
    "X13637722",
  );
  assert.equal(
    mlsNumberFromChatListingUrl("https://houzzat.com/listing/X13637722"),
    "X13637722",
  );
  assert.equal(
    extractChatListingMls(
      "https://houzzat.com/listing/161-eden-oak/X13637722",
    )?.mlsNumber,
    "X13637722",
  );
  assert.equal(
    extractChatListingMls("https://www.houzzat.com/listing/X99")?.mlsNumber,
    "X99",
  );
  assert.equal(
    extractChatListingMls(
      "https://tenant-canary.houzzatpro.com/listing/X55",
    )?.mlsNumber,
    "X55",
  );

  // Genuine relative listing path (token-bounded).
  assert.equal(mlsNumberFromChatListingUrl("/listing/X13637722"), "X13637722");
  assert.equal(extractChatListingMls("/listing/X13637722")?.mlsNumber, "X13637722");
  assert.equal(
    extractChatListingMls("Check /listing/slug/X7 thanks")?.mlsNumber,
    "X7",
  );

  // Invalid / malformed.
  assert.equal(mlsNumberFromChatListingUrl("javascript:alert(1)"), null);
  assert.equal(
    mlsNumberFromChatListingUrl("https://user:pass@houzzat.com/listing/X1"),
    null,
  );
  assert.equal(extractChatListingMls("not a link"), null);
  assert.equal(extractChatListingMls(""), null);
  assert.equal(extractChatListingMls("https://houzzat.com/search"), null);

  // Mixed text: legitimate Houzzat URL wins.
  assert.equal(
    extractChatListingMls(
      "Hi — https://houzzat.com/listing/X12 is the one",
    )?.mlsNumber,
    "X12",
  );

  // Mixed text: foreign listing URL must not yield a preview.
  assert.equal(
    extractChatListingMls(
      "Hi — https://evil.example/listing/X12 is fake",
    ),
    null,
  );

  // Relative path must not be pulled out of unrelated URL path segments
  // after a rejected absolute token in the same string.
  assert.equal(
    extractChatListingMls(
      "https://evil.example/listing/X1 and also words",
    ),
    null,
  );
}

function testApiAcceptsMlsOnlyNoUrlParam() {
  const route = read("src/app/api/chat/listing-url-preview/route.ts");
  assert.ok(route.includes('searchParams.get("mlsNumber")'));
  assert.equal(route.includes('searchParams.get("url")'), false);
  assert.equal(route.includes('searchParams.get("href")'), false);
}

function testReceiptTimerIsReadOnly() {
  const visual = read("src/lib/chat/message-receipt-visual.ts");
  const ticks = read("src/components/chat/ChatReceiptTicks.tsx");
  assert.equal(visual.includes("prisma"), false);
  assert.equal(visual.includes("fetch("), false);
  assert.equal(visual.includes("update("), false);
  assert.ok(visual.includes("never writes deliveredAt"));
  assert.ok(ticks.includes("Never writes deliveredAt"));
  // Visual ack must not require deliveredAt
  assert.equal(
    presentChatReceiptVisualStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-12T12:00:00.000Z",
      deliveredAt: null,
      peerLastReadAt: null,
      nowMs: Date.parse("2026-10-12T12:00:00.000Z") + 1500,
    }),
    "acked",
  );
}

function testNoDuplicateSendPaths() {
  const agent = read(
    "src/components/agent/chat/AgentChatTranscriptPane.tsx",
  );
  assert.ok(agent.includes("isListingUrlOnlyBody(draft)"));
  assert.ok(agent.includes("postAgentListingShare"));
  // After share send, must return before TEXT onSend
  const shareStart = agent.indexOf("Paste-only Houzzat listing URL");
  assert.ok(shareStart >= 0);
  const sendPayloadAt = agent.indexOf("composerSendPayload(", shareStart);
  assert.ok(sendPayloadAt > shareStart);
  const shareBlock = agent.slice(shareStart, sendPayloadAt);
  assert.ok(shareBlock.includes("return;"));
  assert.ok(shareBlock.includes("onSendListingShare"));
  assert.equal(shareBlock.includes("onSend(payload"), false);
}

function testVowGatePresent() {
  const server = read("src/lib/chat/listing-url-preview-server.ts");
  assert.ok(server.includes("buildListingPanelPayload"));
  // Panel path is only used after share snapshot denial; vowBlocked handled by panel.
  assert.ok(server.includes("RECIPIENT_RESTRICTED"));
}

function main() {
  testServerDoesNotFetchOrRecordViews();
  testHostParsingCannotBypass();
  testApiAcceptsMlsOnlyNoUrlParam();
  testReceiptTimerIsReadOnly();
  testNoDuplicateSendPaths();
  testVowGatePresent();
  console.log("chat-listing-url-preview-security-selftest: ok");
}

main();
