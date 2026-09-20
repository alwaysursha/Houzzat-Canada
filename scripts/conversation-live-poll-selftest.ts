/**
 * Conversation live poll merge + visibility helpers.
 * Run: pnpm conversation-live-poll:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONVERSATION_LIVE_POLL_MS,
  conversationLivePollShouldTick,
  conversationLiveVisible,
  mergeLiveConversationMessages,
} from "../src/lib/conversations/conversation-live-poll";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testIntervalAndVisibility() {
  assert.equal(CONVERSATION_LIVE_POLL_MS, 3000);
  assert.equal(conversationLiveVisible({ visibilityState: "visible" }), true);
  assert.equal(conversationLiveVisible({ visibilityState: "hidden" }), false);
  assert.equal(conversationLiveVisible({ visibilityState: "prerender" }), false);
  assert.equal(conversationLiveVisible(null), true);
  assert.equal(conversationLiveVisible(undefined), true);
}

function testShouldTick() {
  const ready = {
    enabled: true,
    visible: true,
    inFlight: false,
    hasLoaded: true,
  };
  assert.equal(conversationLivePollShouldTick(ready), true);
  assert.equal(conversationLivePollShouldTick({ ...ready, enabled: false }), false);
  assert.equal(conversationLivePollShouldTick({ ...ready, visible: false }), false);
  assert.equal(conversationLivePollShouldTick({ ...ready, inFlight: true }), false);
  assert.equal(conversationLivePollShouldTick({ ...ready, hasLoaded: false }), false);
}

function testMergeDedupesAndPreservesOlder() {
  const older = { id: "m1", body: "older" };
  const mid = { id: "m2", body: "mid" };
  const latest = { id: "m3", body: "latest" };
  const prev = [older, mid, latest];
  const sameRef = mergeLiveConversationMessages(prev, [mid, latest]);
  assert.equal(sameRef, prev);
  assert.equal(sameRef.length, 3);

  const incomingDup = [
    mid,
    latest,
    { id: "m4", body: "new" },
    { id: "m4", body: "dup" },
  ];
  const merged = mergeLiveConversationMessages(prev, incomingDup);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["m1", "m2", "m3", "m4"],
  );
  assert.equal(merged[3]?.body, "new");
  assert.equal(merged[0], older);
}

function testHooksPollExistingGetWithoutSockets() {
  const agent = read("src/components/agent/chat/useAgentChatThread.ts");
  const customer = read("src/components/customer-chat/useCustomerChatThread.ts");
  for (const [rel, src] of [
    ["agent", agent],
    ["customer", customer],
  ] as const) {
    assert.ok(src.includes("CONVERSATION_LIVE_POLL_MS"), rel);
    assert.ok(src.includes("conversationLivePollShouldTick"), rel);
    assert.ok(src.includes("visibilitychange"), rel);
    assert.ok(src.includes('live: true'), rel);
    assert.ok(src.includes("pollInFlightRef"), rel);
    assert.ok(src.includes("mergeLiveConversationMessages"), rel);
    assert.equal(src.includes("WebSocket"), false, rel);
    assert.equal(src.includes("EventSource"), false, rel);
    assert.equal(src.includes("Pusher"), false, rel);
    assert.equal(src.includes("onSnapshot"), false, rel);
  }
  assert.ok(agent.includes("v2ChatGetUrl"));
  assert.ok(customer.includes("customerChatGetUrl"));
  assert.ok(agent.includes("setInterval"));
  assert.ok(customer.includes("setInterval"));
  assert.ok(agent.includes("addEventListener(\"focus\""));
  assert.ok(customer.includes("addEventListener(\"focus\""));
  assert.ok(agent.includes("clearInterval"));
  assert.ok(customer.includes("clearInterval"));
  assert.ok(agent.includes("removeEventListener"));
  assert.ok(customer.includes("removeEventListener"));
}

function main() {
  testIntervalAndVisibility();
  testShouldTick();
  testMergeDedupesAndPreservesOlder();
  testHooksPollExistingGetWithoutSockets();
  console.log("conversation-live-poll-selftest: ok");
}

main();
