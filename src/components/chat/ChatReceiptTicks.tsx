"use client";

import { useEffect, useState } from "react";
import {
  chatReceiptAckRemainingMs,
  chatReceiptVisualLabel,
  presentChatReceiptVisualStatus,
  type ChatReceiptVisualStatus,
} from "@/lib/chat/message-receipt-visual";
import { cn } from "@/lib/utils";

/**
 * Visual ticks:
 * - one grey = just accepted
 * - two grey after 1s (UI settle) or when Message.deliveredAt exists
 * - two blue when peer read cursor covers the message
 * Never writes deliveredAt.
 */
export function ChatReceiptTicks({
  isOwnMessage,
  messageCreatedAt,
  deliveredAt,
  peerLastReadAt,
  className,
}: {
  isOwnMessage: boolean;
  messageCreatedAt: string;
  deliveredAt?: string | null;
  peerLastReadAt?: string | null;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const visual = presentChatReceiptVisualStatus({
    isOwnMessage,
    messageCreatedAt,
    deliveredAt,
    peerLastReadAt,
    nowMs,
  });

  useEffect(() => {
    const remaining = chatReceiptAckRemainingMs({
      visual: presentChatReceiptVisualStatus({
        isOwnMessage,
        messageCreatedAt,
        deliveredAt,
        peerLastReadAt,
        nowMs: Date.now(),
      }),
      messageCreatedAt,
      nowMs: Date.now(),
    });
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setNowMs(Date.now()), remaining + 16);
    return () => window.clearTimeout(timer);
  }, [deliveredAt, isOwnMessage, messageCreatedAt, peerLastReadAt]);

  if (!visual) return null;
  return <ChatReceiptTicksIcon status={visual} className={className} />;
}

export function ChatReceiptTicksIcon({
  status,
  className,
}: {
  status: ChatReceiptVisualStatus;
  className?: string;
}) {
  const label = chatReceiptVisualLabel(status);
  if (status === "sent") {
    return (
      <span
        className={cn(
          "inline-flex text-[#64748b] transition-opacity duration-200",
          className,
        )}
        aria-label={label}
        title={label}
      >
        <Check />
      </span>
    );
  }
  const read = status === "read";
  return (
    <span
      className={cn(
        "inline-flex transition-colors duration-200",
        read ? "text-[#2563eb]" : "text-[#64748b]",
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Checks />
    </span>
  );
}

/** @deprecated Prefer ChatReceiptTicks with message fields. */
export function ChatReceiptTicksFromStatus({
  status,
  className,
}: {
  status: "sent" | "delivered" | "read";
  className?: string;
}) {
  const visual: ChatReceiptVisualStatus =
    status === "sent" ? "acked" : status === "delivered" ? "delivered" : "read";
  return <ChatReceiptTicksIcon status={visual} className={className} />;
}

function Check() {
  return (
    <svg
      width="14"
      height="11"
      viewBox="0 0 14 11"
      fill="none"
      aria-hidden
      className="block"
    >
      <path
        d="M1.5 5.5L5 9L12.5 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Checks() {
  return (
    <svg
      width="18"
      height="11"
      viewBox="0 0 18 11"
      fill="none"
      aria-hidden
      className="block"
    >
      <path
        d="M1 6L4.2 9L10.5 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 6.5L9 9L16.5 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { Check, Checks };
