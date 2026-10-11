"use client";

import {
  chatQuotePreviewBody,
  type ChatQuotedMessage,
} from "@/lib/chat/message-reply";
import {
  chatReceiptLabel,
  presentChatReceiptStatus,
  type ChatReceiptStatus,
} from "@/lib/chat/message-receipts";
import { cn } from "@/lib/utils";

export type ChatReactionView = {
  key: string;
  count: number;
  reactedByMe: boolean;
};

export function ChatQuotedPreview({
  quote,
  onCancel,
  onNavigate,
  compact = false,
}: {
  quote: ChatQuotedMessage;
  onCancel?: () => void;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const body = chatQuotePreviewBody(quote);
  return (
    <div
      className={cn(
        "rounded-xl border border-canopy/15 bg-[#f3fbf7] px-3 py-2",
        compact ? "text-[11px]" : "text-xs",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onNavigate}
          disabled={!onNavigate}
        >
          <p className="truncate font-semibold text-canopy-deep">
            {quote.senderName || "Message"}
          </p>
          <p className="mt-0.5 line-clamp-2 text-ink/65">{body}</p>
        </button>
        {onCancel ? (
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={onCancel}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-ink/45 hover:bg-white hover:text-ink"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Compact reaction badges — only when reactions exist.
 * Adding reactions is via ChatMessageActions (hover / long-press).
 */
export function ChatReactionBar({
  reactions,
  onToggle,
  disabled = false,
}: {
  reactions: ChatReactionView[];
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => (
        <button
          key={reaction.key}
          type="button"
          disabled={disabled}
          aria-pressed={reaction.reactedByMe}
          aria-label={`React ${reaction.key}`}
          onClick={() => onToggle(reaction.key)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[12px]",
            reaction.reactedByMe
              ? "border-canopy/30 bg-canopy/10 text-canopy-deep"
              : "border-line bg-white text-ink/65 hover:border-canopy/25",
          )}
        >
          <span>{reaction.key}</span>
          <span className="font-semibold">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

export function ChatReceiptLabel({
  isOwnMessage,
  messageCreatedAt,
  deliveredAt,
  peerLastReadAt,
}: {
  isOwnMessage: boolean;
  messageCreatedAt: string;
  deliveredAt: string | null | undefined;
  peerLastReadAt: string | null | undefined;
}) {
  const status: ChatReceiptStatus | null = presentChatReceiptStatus({
    isOwnMessage,
    messageCreatedAt,
    deliveredAt,
    peerLastReadAt,
  });
  if (!status) return null;
  return (
    <p className="mt-0.5 text-right text-[12px] font-medium text-ink/50">
      {chatReceiptLabel(status)}
    </p>
  );
}
