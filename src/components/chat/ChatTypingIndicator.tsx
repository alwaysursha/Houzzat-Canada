"use client";

import { cn } from "@/lib/utils";

/** Fixed slot height so peer typing never shifts the composer. */
export const CHAT_TYPING_INDICATOR_SLOT_CLASS = "h-5";

export function ChatTypingIndicator({
  visible,
  label,
  tone = "customer",
}: {
  visible: boolean;
  label: string;
  tone?: "customer" | "agent";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-0.5",
        CHAT_TYPING_INDICATOR_SLOT_CLASS,
        tone === "agent" ? "text-[#64748b]" : "text-ink/55",
      )}
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          "motion-safe:transition-opacity motion-safe:duration-150 motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="inline-flex items-center gap-1" aria-hidden>
          <span
            className={cn(
              "size-1 rounded-full bg-current opacity-80",
              visible && "motion-safe:animate-pulse",
            )}
          />
          <span
            className={cn(
              "size-1 rounded-full bg-current opacity-60",
              visible &&
                "motion-safe:animate-pulse motion-safe:[animation-delay:150ms]",
            )}
          />
          <span
            className={cn(
              "size-1 rounded-full bg-current opacity-40",
              visible &&
                "motion-safe:animate-pulse motion-safe:[animation-delay:300ms]",
            )}
          />
        </span>
        <span className="text-[11px] font-medium leading-4">{label}</span>
      </div>
    </div>
  );
}
