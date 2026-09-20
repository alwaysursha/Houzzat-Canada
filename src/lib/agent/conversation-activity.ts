/**
 * Presentation for Conversation Chat/SMS LeadActivity rows.
 * Uses existing LeadActivity.type + meta.channel/direction/automationKey/recipient.
 * Does not create activity records.
 */
import { smsAutomationDisplayName } from "@/lib/platform/sms-automations/catalog";

export type ConversationActivityChannel = "SMS" | "CHAT";
export type ConversationActivityDirection = "inbound" | "outbound";
export type ConversationActivityRecipient = "LEAD" | "AGENT";

export type ConversationActivityView = {
  isConversation: boolean;
  conversationChannel: ConversationActivityChannel | null;
  conversationDirection: ConversationActivityDirection | null;
  automationKey: string | null;
  automationName: string | null;
  recipient: ConversationActivityRecipient | null;
  isAgentNotification: boolean;
  isAutomatedLeadSms: boolean;
};

function metaRecord(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return meta as Record<string, unknown>;
}

function channelFromValue(
  value: unknown,
): ConversationActivityChannel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "SMS") return "SMS";
  if (normalized === "CHAT") return "CHAT";
  return null;
}

function channelFromType(type: string): ConversationActivityChannel | null {
  const normalized = type.trim().toUpperCase();
  if (normalized === "SMS" || normalized === "TEXT") return "SMS";
  if (normalized === "CHAT") return "CHAT";
  return null;
}

function directionFromValue(
  value: unknown,
): ConversationActivityDirection | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "inbound" || normalized === "received") return "inbound";
  if (normalized === "outbound" || normalized === "sent") return "outbound";
  return null;
}

function recipientFromValue(
  value: unknown,
): ConversationActivityRecipient | null {
  if (value === "LEAD" || value === "AGENT") return value;
  return null;
}

function automationKeyFromValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key || null;
}

export function conversationActivityFromLeadActivity(input: {
  type: string;
  meta?: unknown;
  conversationChannel?: ConversationActivityChannel | null;
  conversationDirection?: ConversationActivityDirection | null;
  automationKey?: string | null;
  recipient?: ConversationActivityRecipient | null;
}): ConversationActivityView {
  const record = metaRecord(input.meta);
  const channel =
    channelFromValue(record?.channel) ??
    channelFromType(input.type) ??
    input.conversationChannel ??
    null;
  const direction =
    directionFromValue(record?.direction) ??
    input.conversationDirection ??
    null;
  const automationKey =
    automationKeyFromValue(input.automationKey) ??
    automationKeyFromValue(record?.automationKey);
  const recipient =
    input.recipient ?? recipientFromValue(record?.recipient);
  const isAgentNotification =
    channel === "SMS" && Boolean(automationKey) && recipient === "AGENT";
  const isAutomatedLeadSms =
    channel === "SMS" && Boolean(automationKey) && recipient !== "AGENT";
  return {
    isConversation: channel != null,
    conversationChannel: channel,
    conversationDirection: direction,
    automationKey,
    automationName: smsAutomationDisplayName(automationKey),
    recipient,
    isAgentNotification,
    isAutomatedLeadSms,
  };
}

export function conversationTimelineFields(view: ConversationActivityView): {
  conversationChannel: ConversationActivityChannel | null;
  conversationDirection: ConversationActivityDirection | null;
  conversationAutomationKey: string | null;
  conversationRecipient: ConversationActivityRecipient | null;
} {
  return {
    conversationChannel: view.conversationChannel,
    conversationDirection: view.conversationDirection,
    conversationAutomationKey: view.automationKey,
    conversationRecipient: view.recipient,
  };
}

export function conversationChannelLabel(
  channel: ConversationActivityChannel | null | undefined,
): "SMS" | "Chat" | null {
  if (channel === "SMS") return "SMS";
  if (channel === "CHAT") return "Chat";
  return null;
}

export function conversationDirectionLabel(
  direction: ConversationActivityDirection | null | undefined,
): "Sent" | "Received" | null {
  if (direction === "outbound") return "Sent";
  if (direction === "inbound") return "Received";
  return null;
}

export function conversationActivityHeadline(input: {
  type?: string;
  meta?: unknown;
  conversationChannel?: ConversationActivityChannel | null;
  conversationDirection?: ConversationActivityDirection | null;
  automationKey?: string | null;
  recipient?: ConversationActivityRecipient | null;
}): string | null {
  const parsed = conversationActivityFromLeadActivity({
    type: input.type ?? "",
    meta: input.meta,
    conversationChannel: input.conversationChannel,
    conversationDirection: input.conversationDirection,
    automationKey: input.automationKey,
    recipient: input.recipient,
  });
  if (parsed.isAgentNotification) return "SMS · Agent Notification";
  const channelLabel = conversationChannelLabel(parsed.conversationChannel);
  if (!parsed.isConversation || !channelLabel) return null;
  if (parsed.isAutomatedLeadSms) {
    return `Conversation · ${channelLabel} · Automated`;
  }
  const directionLabel = conversationDirectionLabel(
    parsed.conversationDirection,
  );
  return directionLabel
    ? `Conversation · ${channelLabel} · ${directionLabel}`
    : `Conversation · ${channelLabel}`;
}
