/**
 * Conversation-level read receipt labels for chat bubbles.
 * Never invents Delivered without Message.deliveredAt.
 */

export type ChatReceiptStatus = "sent" | "delivered" | "read";

export function presentChatReceiptStatus(input: {
  /** True when this bubble was sent by the current viewer. */
  isOwnMessage: boolean;
  messageCreatedAt: string;
  deliveredAt: string | null | undefined;
  /**
   * Peer read cursor. For customer viewing own messages → agentLastReadAt.
   * For agent viewing own messages → customerLastReadAt.
   */
  peerLastReadAt: string | null | undefined;
}): ChatReceiptStatus | null {
  if (!input.isOwnMessage) return null;

  const createdAt = Date.parse(input.messageCreatedAt);
  if (!Number.isFinite(createdAt)) return "sent";

  const peerReadAt = input.peerLastReadAt
    ? Date.parse(input.peerLastReadAt)
    : Number.NaN;
  if (Number.isFinite(peerReadAt) && peerReadAt >= createdAt) {
    return "read";
  }

  if (input.deliveredAt) {
    const deliveredAt = Date.parse(input.deliveredAt);
    if (Number.isFinite(deliveredAt)) {
      return "delivered";
    }
  }

  return "sent";
}

export function chatReceiptLabel(status: ChatReceiptStatus): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "read":
      return "Read";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
