"use client";

import type { ReactNode } from "react";
import { ChatReceiptTicks } from "@/components/chat/ChatReceiptTicks";
import {
  chatReceiptVisualLabel,
  presentChatReceiptVisualStatus,
} from "@/lib/chat/message-receipt-visual";
import { formatChatBubbleTime } from "@/lib/chat/chat-date";
import { cn } from "@/lib/utils";

/**
 * Compact in-bubble timestamp + WhatsApp-style ticks for outgoing messages.
 * Timed double-grey is visual-only; read uses peer cursor; never writes deliveredAt.
 */
export function ChatBubbleMeta({
  createdAt,
  isOwnMessage,
  deliveredAt,
  peerLastReadAt,
  tone = "incoming",
  className,
}: {
  createdAt: string;
  isOwnMessage: boolean;
  deliveredAt?: string | null;
  peerLastReadAt?: string | null;
  tone?: "incoming" | "outgoing";
  className?: string;
}) {
  const time = formatChatBubbleTime(createdAt);
  const visual = presentChatReceiptVisualStatus({
    isOwnMessage,
    messageCreatedAt: createdAt,
    deliveredAt,
    peerLastReadAt,
  });

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11px] font-medium leading-none",
        tone === "outgoing" ? "text-[#3d6a57]/75" : "text-[#5b7a6c]/80",
        className,
      )}
      aria-label={visual ? `${time}, ${chatReceiptVisualLabel(visual)}` : time}
    >
      <span>{time}</span>
      {isOwnMessage ? (
        <ChatReceiptTicks
          isOwnMessage={isOwnMessage}
          messageCreatedAt={createdAt}
          deliveredAt={deliveredAt}
          peerLastReadAt={peerLastReadAt}
        />
      ) : null}
    </span>
  );
}

/**
 * Message body with time/ticks anchored to the bottom-right of the bubble
 * (flex end alignment — not float, which top-aligns in the line box).
 */
export function ChatBubbleBodyWithMeta({
  body,
  createdAt,
  isOwnMessage,
  deliveredAt,
  peerLastReadAt,
  tone = "incoming",
  children,
}: {
  body?: string;
  createdAt: string;
  isOwnMessage: boolean;
  deliveredAt?: string | null;
  peerLastReadAt?: string | null;
  tone?: "incoming" | "outgoing";
  children?: ReactNode;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[16px] leading-5 [overflow-wrap:anywhere]">
        {children ?? body}
      </div>
      <ChatBubbleMeta
        createdAt={createdAt}
        isOwnMessage={isOwnMessage}
        deliveredAt={deliveredAt}
        peerLastReadAt={peerLastReadAt}
        tone={tone}
        className="mb-px shrink-0 self-end"
      />
    </div>
  );
}
