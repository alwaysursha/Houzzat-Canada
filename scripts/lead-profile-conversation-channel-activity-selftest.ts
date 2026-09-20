/**
 * Agent Lead Profile Conversation channel safety + Activity Timeline.
 * Run: pnpm lead-profile-conversation-channel-activity:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  conversationActivityFromLeadActivity,
  conversationActivityHeadline,
} from "../src/lib/agent/conversation-activity";
import { friendlyActivityTypeLabel } from "../src/lib/agent/activity-filters";
import {
  composerSendButtonLabel,
  composerSendPayload,
  latestInboundCustomerComposerChannel,
  nextAgentComposerChannelState,
  selectAgentComposerChannel,
} from "../src/lib/agent/lead-profile-v2/chat-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function inboundSmsThenChat() {
  return [
    {
      id: "m-agent",
      senderKind: "AGENT",
      channel: "CHAT",
    },
    {
      id: "m-sms",
      senderKind: "CUSTOMER",
      channel: "SMS",
    },
    {
      id: "m-chat",
      senderKind: "CUSTOMER",
      channel: "CHAT",
    },
  ];
}

function testInboundSmsSelectsSmsComposer() {
  assert.equal(
    latestInboundCustomerComposerChannel([
      { id: "a", senderKind: "AGENT", channel: "CHAT" },
      { id: "c", senderKind: "CUSTOMER", channel: "SMS" },
    ])?.channel,
    "SMS",
  );
  const next = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: null,
    inboundId: "c",
    inboundChannel: "SMS",
    appliedInboundId: null,
    manualChannel: null,
    channel: "CHAT",
  });
  assert.equal(next.channel, "SMS");
  assert.equal(next.manualChannel, null);
}

function testInboundChatSelectsChatComposer() {
  assert.equal(
    latestInboundCustomerComposerChannel(inboundSmsThenChat())?.channel,
    "CHAT",
  );
  const next = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: "lead-1",
    inboundId: "m-chat",
    inboundChannel: "CHAT",
    appliedInboundId: "m-sms",
    manualChannel: "SMS",
    channel: "SMS",
  });
  assert.equal(next.channel, "CHAT");
  assert.equal(next.manualChannel, null);
  assert.equal(next.appliedInboundId, "m-chat");
}

function testNewInboundChangesComposerChannel() {
  const afterSms = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: "lead-1",
    inboundId: "sms-1",
    inboundChannel: "SMS",
    appliedInboundId: "chat-1",
    manualChannel: "CHAT",
    channel: "CHAT",
  });
  assert.equal(afterSms.channel, "SMS");
  assert.equal(afterSms.manualChannel, null);

  const sameInboundKeepsManual = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: "lead-1",
    inboundId: "sms-1",
    inboundChannel: "SMS",
    appliedInboundId: "sms-1",
    manualChannel: "CHAT",
    channel: "CHAT",
  });
  assert.equal(sameInboundKeepsManual.channel, "CHAT");
  assert.equal(sameInboundKeepsManual.manualChannel, "CHAT");
}

function testExplicitAgentChannelSelection() {
  const selected = selectAgentComposerChannel("SMS");
  assert.deepEqual(selected, { channel: "SMS", manualChannel: "SMS" });
  const held = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: "lead-1",
    inboundId: "sms-1",
    inboundChannel: "SMS",
    appliedInboundId: "sms-1",
    manualChannel: "CHAT",
    channel: "CHAT",
  });
  assert.equal(held.channel, "CHAT");
}

function testSendCannotMismatchDisplayedChannel() {
  assert.deepEqual(composerSendPayload("Hello", "SMS"), {
    body: "Hello",
    channel: "SMS",
  });
  assert.deepEqual(composerSendPayload("Hello", "CHAT"), {
    body: "Hello",
    channel: "CHAT",
  });
  assert.notEqual(composerSendPayload("Hello", "SMS").channel, "CHAT");
  assert.equal(composerSendButtonLabel({ channel: "SMS", sending: false }), "Send SMS");
  assert.equal(composerSendButtonLabel({ channel: "CHAT", sending: false }), "Send Chat");

  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  const hook = read("src/components/agent/chat/useAgentChatThread.ts");
  assert.ok(pane.includes("displayedChannel"));
  assert.ok(pane.includes("composerSendPayload(draft, displayedChannel)"));
  assert.ok(pane.includes("onSend(payload.body, payload.channel)"));
  assert.ok(pane.includes("composerSendButtonLabel"));
  assert.ok(pane.includes("role=\"tablist\""));
  assert.ok(pane.includes(">Chat</button>") || pane.includes("Chat"));
  assert.ok(pane.includes(">SMS</button>") || pane.includes("SMS"));
  assert.ok(hook.includes("composerSendPayload(body, channel)"));
  assert.equal(hook.includes('channel === "SMS" ? { body, channel: "SMS" } : { body }'), false);
}

function testSmsActivityRendering() {
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      meta: { channel: "SMS", direction: "outbound" },
    }),
    "Conversation · SMS · Sent",
  );
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      meta: { channel: "SMS", direction: "inbound" },
    }),
    "Conversation · SMS · Received",
  );
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      meta: {
        channel: "SMS",
        direction: "outbound",
        recipient: "LEAD",
        automationKey: "lead.inactive_14_days",
      },
    }),
    "Conversation · SMS · Automated",
  );
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      meta: {
        channel: "SMS",
        direction: "outbound",
        recipient: "AGENT",
        automationKey: "agent.new_lead_signup",
      },
    }),
    "SMS · Agent Notification",
  );
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      conversationChannel: "SMS",
      conversationDirection: "outbound",
    }),
    "Conversation · SMS · Sent",
  );
  assert.equal(
    conversationActivityFromLeadActivity({ type: "SMS" }).conversationChannel,
    "SMS",
  );
  assert.equal(friendlyActivityTypeLabel("SMS"), "Conversation");
  assert.notEqual(friendlyActivityTypeLabel("SMS"), "Text");
}

function testChatActivityRendering() {
  assert.equal(
    conversationActivityHeadline({
      type: "CHAT",
      meta: { channel: "CHAT", direction: "outbound" },
    }),
    "Conversation · Chat · Sent",
  );
  assert.equal(
    conversationActivityHeadline({
      type: "CHAT",
      meta: { channel: "CHAT", direction: "inbound" },
    }),
    "Conversation · Chat · Received",
  );
  assert.equal(friendlyActivityTypeLabel("CHAT"), "Conversation");
}

function testExistingMetadataAndUiWiring() {
  const timeline = read("src/lib/agent/lead-profile-timeline.ts");
  const customer = read("src/lib/agent/customer-timeline.ts");
  const crm = read("src/components/agent/CrmTimeline.tsx");
  const filters = read("src/lib/agent/activity-filters.ts");
  const send = read("src/lib/conversations/agent-conversation-send.ts");
  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");

  assert.ok(timeline.includes("meta: true"));
  assert.ok(timeline.includes("conversationActivityFromLeadActivity"));
  assert.ok(customer.includes("conversationChannel"));
  assert.ok(customer.includes("conversationDirection"));
  assert.ok(crm.includes("conversationActivityHeadline"));
  assert.ok(crm.includes("conversationAutomationKey") || crm.includes("automationKey"));
  assert.ok(crm.includes("automationName"));
  assert.ok(crm.includes("ArrowDownLeft"));
  assert.ok(crm.includes("ArrowUpRight"));
  assert.ok(filters.includes('"CHAT"'));
  assert.ok(filters.includes('label: "Conversations"'));
  assert.equal(filters.includes('return "Text"'), false);
  assert.ok(pane.includes("nextAgentComposerChannelState"));
  assert.ok(pane.includes("selectAgentComposerChannel"));
  assert.ok(send.includes("recordConversationLeadActivity"));
  assert.equal(send.includes("recordSmsLeadActivity"), false);
}

function main() {
  testInboundSmsSelectsSmsComposer();
  testInboundChatSelectsChatComposer();
  testNewInboundChangesComposerChannel();
  testExplicitAgentChannelSelection();
  testSendCannotMismatchDisplayedChannel();
  testSmsActivityRendering();
  testChatActivityRendering();
  testExistingMetadataAndUiWiring();
  console.log("lead-profile-conversation-channel-activity-selftest: ok");
}

void main();
