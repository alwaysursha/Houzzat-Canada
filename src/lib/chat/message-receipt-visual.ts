/**
 * Visual receipt ticks for outgoing chat bubbles.
 *
 * Real read receipts still come from peerLastReadAt via presentChatReceiptStatus.
 * The 1s single→double grey transition is UI-only and never writes deliveredAt.
 */

import {
  presentChatReceiptStatus,
  type ChatReceiptStatus,
} from "@/lib/chat/message-receipts";

export const CHAT_RECEIPT_ACK_VISUAL_MS = 1000;

/** Visual tick state shown in the bubble. */
export type ChatReceiptVisualStatus =
  | "sent" // one grey tick
  | "acked" // two grey ticks (UI settle — not device delivery)
  | "delivered" // two grey ticks (real Message.deliveredAt)
  | "read"; // two blue ticks

export function presentChatReceiptVisualStatus(input: {
  isOwnMessage: boolean;
  messageCreatedAt: string;
  deliveredAt: string | null | undefined;
  peerLastReadAt: string | null | undefined;
  /** Date.now() injection for tests. */
  nowMs?: number;
}): ChatReceiptVisualStatus | null {
  const status: ChatReceiptStatus | null = presentChatReceiptStatus({
    isOwnMessage: input.isOwnMessage,
    messageCreatedAt: input.messageCreatedAt,
    deliveredAt: input.deliveredAt,
    peerLastReadAt: input.peerLastReadAt,
  });
  if (!status) return null;
  if (status === "read") return "read";
  if (status === "delivered") return "delivered";

  const createdAt = Date.parse(input.messageCreatedAt);
  const now = input.nowMs ?? Date.now();
  if (!Number.isFinite(createdAt)) return "acked";
  if (now - createdAt >= CHAT_RECEIPT_ACK_VISUAL_MS) return "acked";
  return "sent";
}

export function chatReceiptVisualLabel(
  status: ChatReceiptVisualStatus,
): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "acked":
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

/** Remaining ms until visual double-tick; 0 if already settled/read/delivered. */
export function chatReceiptAckRemainingMs(input: {
  visual: ChatReceiptVisualStatus | null;
  messageCreatedAt: string;
  nowMs?: number;
}): number {
  if (input.visual !== "sent") return 0;
  const createdAt = Date.parse(input.messageCreatedAt);
  const now = input.nowMs ?? Date.now();
  if (!Number.isFinite(createdAt)) return 0;
  return Math.max(0, CHAT_RECEIPT_ACK_VISUAL_MS - (now - createdAt));
}
