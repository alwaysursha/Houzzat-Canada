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
  applyV2TextQuickActionChannel,
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
  const sendCall = pane.split("composerSendPayload(")[1]?.split(");")[0] ?? "";
  assert.ok(sendCall.includes("draft"));
  assert.ok(sendCall.includes("displayedChannel"));
  assert.ok(pane.includes("onSend(payload.body, payload.channel"));
  assert.ok(pane.includes("composerSendButtonLabel"));
  assert.ok(pane.includes("role=\"tablist\""));
  assert.ok(pane.includes(">Chat</button>") || pane.includes("Chat"));
  assert.ok(pane.includes(">SMS</button>") || pane.includes("SMS"));
  const hookSend = hook.split("composerSendPayload(")[1]?.split(")")[0] ?? "";
  assert.ok(hookSend.includes("body"));
  assert.ok(hookSend.includes("channel"));
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

function chatState(overrides?: {
  leadId?: string | null;
  channel?: "CHAT" | "SMS";
  manualChannel?: "CHAT" | "SMS" | null;
}) {
  return {
    leadId: overrides?.leadId ?? "lead-a",
    channel: overrides?.channel ?? "CHAT",
    manualChannel: overrides?.manualChannel ?? null,
    appliedInboundId: null,
    resetDraft: false,
  };
}

function testTextQuickActionOpensSmsForThatLead() {
  const applied = applyV2TextQuickActionChannel({
    request: { leadId: "lead-a", nonce: 1 },
    appliedNonce: null,
    panelLeadId: "lead-a",
    state: chatState(),
  });
  assert.equal(applied.state.channel, "SMS");
  assert.equal(applied.state.manualChannel, "SMS");
  assert.equal(applied.focusComposer, true);
  assert.equal(applied.appliedNonce, 1);

  const again = applyV2TextQuickActionChannel({
    request: { leadId: "lead-a", nonce: 1 },
    appliedNonce: 1,
    panelLeadId: "lead-a",
    state: applied.state,
  });
  assert.equal(again.focusComposer, false);
  assert.equal(again.state.channel, "SMS");

  const chat = selectAgentComposerChannel("CHAT");
  assert.equal(chat.channel, "CHAT");
  assert.equal(chat.manualChannel, "CHAT");
}

function testTextQuickActionDoesNotLeakAcrossLeads() {
  const switched = nextAgentComposerChannelState({
    leadId: "lead-b",
    prevLeadId: "lead-a",
    inboundId: null,
    inboundChannel: null,
    appliedInboundId: null,
    manualChannel: "SMS",
    channel: "SMS",
  });
  assert.equal(switched.channel, "CHAT");
  assert.equal(switched.manualChannel, null);
  assert.equal(switched.resetDraft, true);

  const stale = applyV2TextQuickActionChannel({
    request: { leadId: "lead-a", nonce: 4 },
    appliedNonce: null,
    panelLeadId: "lead-b",
    state: switched,
  });
  assert.equal(stale.state.channel, "CHAT");
  assert.equal(stale.focusComposer, false);

  const matching = applyV2TextQuickActionChannel({
    request: { leadId: "lead-b", nonce: 5 },
    appliedNonce: null,
    panelLeadId: "lead-b",
    state: switched,
  });
  assert.equal(matching.state.channel, "SMS");
  assert.equal(matching.focusComposer, true);
}

function testActiveDraftKeepsComposerChannel() {
  const smsDraft = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: "lead-1",
    inboundId: "chat-2",
    inboundChannel: "CHAT",
    appliedInboundId: "sms-1",
    manualChannel: "SMS",
    channel: "SMS",
    hasDraft: true,
  });
  assert.equal(smsDraft.channel, "SMS");
  assert.equal(smsDraft.manualChannel, "SMS");
  assert.equal(smsDraft.resetDraft, false);
  assert.equal(smsDraft.appliedInboundId, "chat-2");

  const chatDraft = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: "lead-1",
    inboundId: "sms-2",
    inboundChannel: "SMS",
    appliedInboundId: "chat-1",
    manualChannel: "CHAT",
    channel: "CHAT",
    hasDraft: true,
  });
  assert.equal(chatDraft.channel, "CHAT");
  assert.equal(chatDraft.manualChannel, "CHAT");
  assert.equal(chatDraft.resetDraft, false);
  assert.equal(chatDraft.appliedInboundId, "sms-2");

  const composedWithoutManualPin = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: "lead-1",
    inboundId: "chat-9",
    inboundChannel: "CHAT",
    appliedInboundId: "sms-8",
    manualChannel: null,
    channel: "SMS",
    hasDraft: true,
  });
  assert.equal(composedWithoutManualPin.channel, "SMS");
  assert.equal(composedWithoutManualPin.manualChannel, null);
  assert.equal(composedWithoutManualPin.resetDraft, false);

  const cleared = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: "lead-1",
    inboundId: "chat-2",
    inboundChannel: "CHAT",
    appliedInboundId: smsDraft.appliedInboundId,
    manualChannel: "SMS",
    channel: "SMS",
    hasDraft: false,
  });
  assert.equal(cleared.channel, "SMS");
  assert.equal(cleared.manualChannel, "SMS");
  assert.equal(cleared.resetDraft, false);

  const laterInbound = nextAgentComposerChannelState({
    leadId: "lead-1",
    prevLeadId: "lead-1",
    inboundId: "chat-3",
    inboundChannel: "CHAT",
    appliedInboundId: "chat-2",
    manualChannel: "SMS",
    channel: "SMS",
    hasDraft: false,
  });
  assert.equal(laterInbound.channel, "CHAT");
  assert.equal(laterInbound.manualChannel, null);
  assert.equal(laterInbound.resetDraft, false);

  const leadSwitch = nextAgentComposerChannelState({
    leadId: "lead-2",
    prevLeadId: "lead-1",
    inboundId: "chat-1",
    inboundChannel: "CHAT",
    appliedInboundId: "sms-1",
    manualChannel: "SMS",
    channel: "SMS",
    hasDraft: true,
  });
  assert.equal(leadSwitch.channel, "CHAT");
  assert.equal(leadSwitch.manualChannel, null);
  assert.equal(leadSwitch.resetDraft, true);

  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.ok(pane.includes("hasDraft: draft.trim().length > 0"));
}

function testTextQuickActionDoesNotSend() {
  const host = read("src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx");
  const rail = read("src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx");
  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  const openFn = host.split("const onOpenCrmSms")[1]?.split("const onMatchboardUpdated")[0] ?? "";
  assert.ok(openFn.includes('setConversationSurface("chat")'));
  assert.ok(openFn.includes('setTab("conversations")'));
  assert.ok(openFn.includes("setSmsOpenRequest"));
  assert.equal(openFn.includes("onSend"), false);
  assert.equal(openFn.includes("sms:"), false);
  assert.equal(rail.includes("contactSmsHref"), false);
  assert.equal(rail.includes("sms:"), false);
  assert.equal(rail.split('label: "Text"').length - 1, 2);
  assert.ok(rail.includes("onOpenCrmSms"));
  assert.ok(host.includes("setSmsOpenRequest(null)"));
  assert.ok(pane.includes("applyV2TextQuickActionChannel"));
  assert.ok(pane.includes("selectDisplayedChannel(\"CHAT\")") || pane.includes('selectDisplayedChannel("CHAT")'));
  assert.ok(pane.includes("v2SmsBlockedCopy"));
  assert.equal(pane.includes("window.location"), false);
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
  testActiveDraftKeepsComposerChannel();
  testTextQuickActionOpensSmsForThatLead();
  testTextQuickActionDoesNotLeakAcrossLeads();
  testTextQuickActionDoesNotSend();
  testSendCannotMismatchDisplayedChannel();
  testSmsActivityRendering();
  testChatActivityRendering();
  testExistingMetadataAndUiWiring();
  console.log("lead-profile-conversation-channel-activity-selftest: ok");
}

void main();
