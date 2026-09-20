/** Client/server-safe Conversations Chat helpers. No Prisma. */
import type {
  LeadProfileV2ChatMessage,
  LeadProfileV2ChatPanel,
} from "@/lib/agent/lead-profile-v2/types";

export const V2_CHAT_RESOURCE_KEY = "conversation-chat";
export const V2_CHAT_TEXT_MAX_LENGTH = 4000;
export const V2_CHAT_DELETED_TOMBSTONE = "This message was deleted";
export const V2_CHAT_GET_ROUTE = "/api/agent/leads/[id]/conversation";
export const V2_CHAT_SEND_ROUTE = "/api/agent/leads/[id]/conversation/messages";
export const V2_CHAT_READ_ROUTE = "/api/agent/leads/[id]/conversation/read";

export type V2ChatSurface = "chat" | "email";

export type V2ChatStamp = {
  leadId: string;
  epoch: number;
};

export function v2ChatGetUrl(leadId: string, cursor?: string | null) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return `/api/agent/leads/${leadId}/conversation${qs ? `?${qs}` : ""}`;
}

export function v2ChatSendUrl(leadId: string) {
  return `/api/agent/leads/${leadId}/conversation/messages`;
}

export function v2ChatReadUrl(leadId: string) {
  return `/api/agent/leads/${leadId}/conversation/read`;
}

export function canApplyV2ChatResponse(input: {
  stamp: V2ChatStamp;
  current: V2ChatStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}

export function v2ChatOlderCursorKey(input: {
  leadId: string;
  cursor: string | null;
}): string {
  return `${input.leadId}|${input.cursor ?? ""}`;
}

export function shouldSkipDuplicateV2ChatOlder(input: {
  inFlight: boolean;
  lastCursorKey: string | null;
  cursorKey: string;
}): boolean {
  if (input.inFlight) return true;
  return input.lastCursorKey === input.cursorKey;
}

export function mergeV2ChatMessages(
  prev: LeadProfileV2ChatMessage[],
  next: LeadProfileV2ChatMessage[],
  mode: "replace" | "prepend" | "append",
): LeadProfileV2ChatMessage[] {
  if (mode === "replace") return next;
  const seen = new Set(prev.map((row) => row.id));
  const unique = next.filter((row) => !seen.has(row.id));
  if (mode === "prepend") return [...unique, ...prev];
  return [...prev, ...unique];
}

export function appendV2ChatSentMessage(
  panel: LeadProfileV2ChatPanel,
  message: LeadProfileV2ChatMessage,
): LeadProfileV2ChatPanel {
  return {
    ...panel,
    conversation: {
      ...panel.conversation,
      lastMessageAt: message.createdAt,
      created: false,
    },
    messages: mergeV2ChatMessages(panel.messages, [message], "append"),
  };
}

export function clearV2ChatUnread(
  panel: LeadProfileV2ChatPanel,
): LeadProfileV2ChatPanel {
  return {
    ...panel,
    unread: {
      ...panel.unread,
      count: 0,
      dividerMessageId: null,
    },
  };
}

export function v2ChatPrependScrollTop(input: {
  previousScrollHeight: number;
  nextScrollHeight: number;
  previousScrollTop: number;
}): number {
  return (
    input.nextScrollHeight -
    input.previousScrollHeight +
    input.previousScrollTop
  );
}

export function v2ChatComposerKeyAction(input: {
  key: string;
  shiftKey: boolean;
}): "send" | "newline" | null {
  if (input.key !== "Enter") return null;
  return input.shiftKey ? "newline" : "send";
}

export type AgentComposerChannel = "CHAT" | "SMS";

export type AgentComposerInbound = {
  id: string;
  channel: AgentComposerChannel;
};

export function latestInboundCustomerComposerChannel(
  messages: Array<{
    id: string;
    senderKind: string;
    channel: string;
    kind?: string | null;
  }>,
): AgentComposerInbound | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const row = messages[i];
    if (!row || row.senderKind !== "CUSTOMER") continue;
    if (row.kind === "SYSTEM_CARD") continue;
    if (row.channel === "SMS" || row.channel === "CHAT") {
      return { id: row.id, channel: row.channel };
    }
  }
  return null;
}

export function nextAgentComposerChannelState(input: {
  leadId: string | null;
  prevLeadId: string | null;
  inboundId: string | null;
  inboundChannel: AgentComposerChannel | null;
  appliedInboundId: string | null;
  manualChannel: AgentComposerChannel | null;
  channel: AgentComposerChannel;
}): {
  leadId: string | null;
  channel: AgentComposerChannel;
  manualChannel: AgentComposerChannel | null;
  appliedInboundId: string | null;
  resetDraft: boolean;
} {
  const inboundId = input.inboundChannel ? input.inboundId : null;
  const inboundChannel = inboundId ? input.inboundChannel : null;
  const leadChanged = input.leadId !== input.prevLeadId;

  if (leadChanged) {
    return {
      leadId: input.leadId,
      channel: inboundChannel ?? "CHAT",
      manualChannel: null,
      appliedInboundId: inboundId,
      resetDraft: true,
    };
  }

  if (inboundId && inboundChannel && inboundId !== input.appliedInboundId) {
    return {
      leadId: input.leadId,
      channel: inboundChannel,
      manualChannel: null,
      appliedInboundId: inboundId,
      resetDraft: false,
    };
  }

  return {
    leadId: input.leadId,
    channel: input.manualChannel ?? input.channel,
    manualChannel: input.manualChannel,
    appliedInboundId: input.appliedInboundId,
    resetDraft: false,
  };
}

export function selectAgentComposerChannel(
  next: AgentComposerChannel,
): {
  channel: AgentComposerChannel;
  manualChannel: AgentComposerChannel;
} {
  return { channel: next, manualChannel: next };
}

export function composerSendPayload(
  body: string,
  displayedChannel: AgentComposerChannel,
): { body: string; channel: AgentComposerChannel } {
  return { body, channel: displayedChannel };
}

export function composerSendButtonLabel(input: {
  channel: AgentComposerChannel;
  sending: boolean;
}): string {
  if (input.sending) return "Sending…";
  return input.channel === "SMS" ? "Send SMS" : "Send Chat";
}

export function v2ChatComposerCanSubmit(input: {
  body: string;
  pending: boolean;
  canSend: boolean;
  channel?: "CHAT" | "SMS";
  smsEnabled?: boolean;
}): boolean {
  const trimmed = input.body.trim();
  const smsOk = input.channel !== "SMS" || input.smsEnabled === true;
  return (
    input.canSend &&
    smsOk &&
    !input.pending &&
    trimmed.length > 0 &&
    trimmed.length <= V2_CHAT_TEXT_MAX_LENGTH
  );
}

export function shouldSkipV2ChatSubmit(input: {
  body: string;
  inFlight: boolean;
  canSend: boolean;
  channel?: "CHAT" | "SMS";
  smsEnabled?: boolean;
}): boolean {
  return !v2ChatComposerCanSubmit({
    body: input.body,
    pending: input.inFlight,
    canSend: input.canSend,
    channel: input.channel,
    smsEnabled: input.smsEnabled,
  });
}

export function canShowV2ChatComposer(canMarkRead: boolean): boolean {
  return canMarkRead;
}

export function v2ChatIsOpen(input: {
  tab: string;
  conversationSurface: V2ChatSurface;
}): boolean {
  return input.tab === "conversations" && input.conversationSurface === "chat";
}

export function shouldMarkV2ChatRead(input: {
  chatVisible: boolean;
  canMarkRead: boolean;
}): boolean {
  return input.chatVisible && input.canMarkRead;
}

export function v2ChatComposerMode(input: {
  loading: boolean;
  error: boolean;
  canMarkRead: boolean;
}): "hidden" | "composer" | "readonly" {
  if (input.loading || input.error) return "hidden";
  return canShowV2ChatComposer(input.canMarkRead) ? "composer" : "readonly";
}

export function v2ChatTranscriptItems(
  messages: LeadProfileV2ChatMessage[],
  dividerMessageId: string | null,
) {
  return messages.map((message, index) => ({
    message,
    grouped: shouldGroupV2ChatMessage(messages[index - 1] ?? null, message),
    showDivider: dividerMessageId === message.id,
  }));
}

export function v2ChatReadOnlyReason(input: {
  canMarkRead: boolean;
  assignedAgentId: string | null;
}): string | null {
  if (input.canMarkRead) return null;
  if (!input.assignedAgentId) {
    return "Only the assigned agent can send chat messages. This lead is unassigned.";
  }
  return "Only the assigned agent can send chat messages.";
}

export function v2ChatEmptyCopy(canSend: boolean): string {
  return canSend
    ? "No chat messages yet. Send a message to start the conversation."
    : "No chat messages yet.";
}

export function v2ChatSystemCardLabel(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Update";
  }
  const card = (payload as { card?: unknown }).card;
  if (card === "ASSIGNED") return "Assigned";
  if (card === "REASSIGNED") return "Reassigned";
  if (card === "VIEWING_CONFIRMED") return "Viewing confirmed";
  return "Update";
}

export function shouldGroupV2ChatMessage(
  previous: LeadProfileV2ChatMessage | null,
  current: LeadProfileV2ChatMessage,
): boolean {
  if (!previous) return false;
  if (previous.kind === "SYSTEM_CARD" || current.kind === "SYSTEM_CARD") {
    return false;
  }
  if (previous.senderKind !== current.senderKind) return false;
  if (previous.senderUserId !== current.senderUserId) return false;
  if (previous.channel !== current.channel) return false;
  return previous.senderName === current.senderName;
}

export function v2ChatMessageBody(message: LeadProfileV2ChatMessage): string {
  if (message.deletedAt) return V2_CHAT_DELETED_TOMBSTONE;
  return message.body ?? "";
}

export function v2SmsDeliveryLabel(
  message: Pick<
    LeadProfileV2ChatMessage,
    "channel" | "deliveredAt" | "providerStatus"
  >,
): string | null {
  if (message.channel !== "SMS") return null;
  if (message.deliveredAt) return "Delivered";
  const status = (message.providerStatus ?? "").trim().toLowerCase();
  switch (status) {
    case "queued":
      return "Queued";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "undelivered":
      return "Undelivered";
    case "failed":
      return "Failed";
    case "":
      return "SMS";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function v2SmsBlockedCopy(reason: string | null | undefined): string | null {
  switch (reason) {
    case "NOT_ASSIGNED":
      return "Only the assigned agent can send SMS.";
    case "NO_CUSTOMER_E164":
      return "SMS is unavailable — this lead has no valid mobile number.";
    case "NO_WORKSPACE_NUMBER":
      return "SMS is unavailable — this workspace has no Twilio number.";
    case "SUPPRESSED":
      return "SMS is unavailable — this number has opted out of SMS.";
    case "ALLOWANCE_NOT_CONFIGURED":
      return "SMS is unavailable — this workspace has no SMS allowance configured.";
    case "ALLOWANCE_EXCEEDED":
      return "SMS is unavailable — this workspace has used its included SMS allowance.";
    default:
      return reason ? "SMS is unavailable." : null;
  }
}
