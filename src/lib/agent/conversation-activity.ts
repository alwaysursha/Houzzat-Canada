/**
 * Presentation for Conversation Chat/SMS LeadActivity rows.
 * Uses existing LeadActivity.type + meta.channel/meta.direction.
 * Does not create activity records.
 */

export type ConversationActivityChannel = "SMS" | "CHAT";
export type ConversationActivityDirection = "inbound" | "outbound";

export type ConversationActivityView = {
  isConversation: boolean;
  conversationChannel: ConversationActivityChannel | null;
  conversationDirection: ConversationActivityDirection | null;
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

export function conversationActivityFromLeadActivity(input: {
  type: string;
  meta?: unknown;
}): ConversationActivityView {
  const record = metaRecord(input.meta);
  const channel =
    channelFromValue(record?.channel) ?? channelFromType(input.type);
  const direction = directionFromValue(record?.direction);
  return {
    isConversation: channel != null,
    conversationChannel: channel,
    conversationDirection: direction,
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
}): string | null {
  const parsed =
    input.conversationChannel || input.conversationDirection
      ? {
          isConversation: Boolean(input.conversationChannel),
          conversationChannel: input.conversationChannel ?? null,
          conversationDirection: input.conversationDirection ?? null,
        }
      : conversationActivityFromLeadActivity({
          type: input.type ?? "",
          meta: input.meta,
        });
  const channelLabel = conversationChannelLabel(parsed.conversationChannel);
  if (!parsed.isConversation || !channelLabel) return null;
  const directionLabel = conversationDirectionLabel(
    parsed.conversationDirection,
  );
  return directionLabel
    ? `Conversation · ${channelLabel} · ${directionLabel}`
    : `Conversation · ${channelLabel}`;
}
