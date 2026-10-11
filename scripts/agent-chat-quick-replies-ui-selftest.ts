/**
 * Chat V1 Milestone 4O — My Quick Replies agent chat UI selftest (no DB).
 * Run: pnpm agent-chat-quick-replies-ui:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { V2_CHAT_TEXT_MAX_LENGTH } from "../src/lib/agent/lead-profile-v2/chat-query";
import {
  AGENT_QUICK_REPLIES_ROUTE,
  filterAgentQuickReplies,
  insertQuickReplyAtCursor,
  previewQuickReplyBody,
  type AgentQuickReply,
} from "../src/lib/chat/quick-replies/client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function sample(id: string, name: string, body: string): AgentQuickReply {
  return {
    id,
    name,
    body,
    sortOrder: 0,
    createdAt: "2026-10-10T12:00:00.000Z",
    updatedAt: "2026-10-10T12:00:00.000Z",
  };
}

function testClientHelpers() {
  assert.equal(AGENT_QUICK_REPLIES_ROUTE, "/api/agent/quick-replies");
  assert.equal(previewQuickReplyBody("Hello world"), "Hello world");
  assert.ok(previewQuickReplyBody("x".repeat(100)).endsWith("…"));

  const replies = [
    sample("1", "Follow up", "Just checking in"),
    sample("2", "Thanks", "Thank you for your time"),
  ];
  assert.equal(filterAgentQuickReplies(replies, "").length, 2);
  assert.equal(filterAgentQuickReplies(replies, "thank").length, 1);
  assert.equal(filterAgentQuickReplies(replies, "checking").length, 1);
  assert.equal(filterAgentQuickReplies(replies, "zzz").length, 0);

  const inserted = insertQuickReplyAtCursor({
    value: "Hi ",
    text: "there",
    selectionStart: 3,
    selectionEnd: 3,
    maxLength: V2_CHAT_TEXT_MAX_LENGTH,
  });
  assert.equal(inserted.ok, true);
  if (inserted.ok) {
    assert.equal(inserted.value, "Hi there");
    assert.equal(inserted.selectionStart, 8);
  }

  const over = insertQuickReplyAtCursor({
    value: "a".repeat(3990),
    text: "b".repeat(20),
    selectionStart: 3990,
    selectionEnd: 3990,
    maxLength: V2_CHAT_TEXT_MAX_LENGTH,
  });
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.reason, "LIMIT");

  const replace = insertQuickReplyAtCursor({
    value: "Hello world",
    text: "team",
    selectionStart: 6,
    selectionEnd: 11,
    maxLength: V2_CHAT_TEXT_MAX_LENGTH,
  });
  assert.equal(replace.ok, true);
  if (replace.ok) assert.equal(replace.value, "Hello team");
}

function testPaneWiring() {
  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.ok(pane.includes("ChatQuickReplyPicker"));
  assert.ok(pane.includes("insertQuickReply"));
  assert.ok(pane.includes("insertQuickReplyAtCursor"));
  assert.ok(pane.includes("!smsSelected"));
  assert.ok(pane.includes("My Quick Replies") || pane.includes("ChatQuickReplyPicker"));
  // Insert path must not call send
  const insertFn =
    pane.split("function insertQuickReply")[1]?.split("async function")[0] ??
    pane.split("function insertQuickReply")[1]?.split("function navigate")[0] ??
    "";
  assert.ok(insertFn.includes("signalTyping"));
  assert.ok(!insertFn.includes("onSend("));
  assert.ok(!insertFn.includes("submit("));
  assert.ok(!insertFn.includes("setReplyTo"));

  // Picker only when CHAT (!smsSelected) and not voiceBusy wrapper
  assert.ok(pane.includes("{!smsSelected ? ("));
  assert.ok(pane.includes("<ChatQuickReplyPicker"));
  assert.ok(pane.includes("disabled={sending || !canSend}"));

  // SMS quick texts remain
  assert.ok(pane.includes("smsQuickTexts"));
  assert.ok(pane.includes("setDraft(quickText.rendered)"));
}

function testPickerSurface() {
  const picker = read("src/components/chat/ChatQuickReplyPicker.tsx");
  assert.ok(picker.includes("My Quick Replies"));
  assert.ok(picker.includes("fetchAgentQuickReplies"));
  assert.ok(picker.includes("createAgentQuickReply"));
  assert.ok(picker.includes("updateAgentQuickReply"));
  assert.ok(picker.includes("deleteAgentQuickReply"));
  assert.ok(picker.includes("filterAgentQuickReplies"));
  assert.ok(picker.includes("onInsert"));
  assert.ok(picker.includes("Delete"));
  assert.ok(picker.includes("Escape"));
  assert.ok(!picker.includes("workspaceId"));
  assert.ok(!picker.includes("userId"));
  assert.ok(!picker.includes("/messages"));
  assert.ok(!picker.includes("onSend"));

  const client = read("src/lib/chat/quick-replies/client.ts");
  assert.ok(client.includes('JSON.stringify({ name: input.name, body: input.body })'));
  assert.ok(!client.includes("workspaceId"));
  assert.ok(!client.includes("userId"));
}

function main() {
  testClientHelpers();
  testPaneWiring();
  testPickerSurface();
  console.log("agent-chat-quick-replies-ui-selftest: ok");
}

main();
