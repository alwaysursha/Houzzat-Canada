"use client";

import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { formatChatDayLabel } from "@/lib/chat/chat-date";
import { cn } from "@/lib/utils";

export function ChatDateSeparator({
  createdAt,
  dayKey,
}: {
  createdAt: string;
  dayKey: string;
}) {
  const label = formatChatDayLabel(createdAt);
  if (!label) return null;
  return (
    <div
      data-chat-day={dayKey}
      data-chat-day-iso={createdAt}
      className="my-3 flex items-center justify-center"
    >
      <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-[#5b7a6c] shadow-sm ring-1 ring-[#d7e8df]/80">
        {label}
      </span>
    </div>
  );
}

/**
 * Floating sticky date for the day currently near the top of the scroller.
 */
export function ChatStickyDateLabel({
  scrollerRef,
  className,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    function update() {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const markers = scroller.querySelectorAll<HTMLElement>("[data-chat-day-iso]");
      if (markers.length === 0) {
        setLabel(null);
        return;
      }
      const top = scroller.getBoundingClientRect().top + 8;
      let active: HTMLElement | null = null;
      for (const marker of markers) {
        const rect = marker.getBoundingClientRect();
        if (rect.top <= top + 40) {
          active = marker;
        } else {
          break;
        }
      }
      const iso = active?.dataset.chatDayIso ?? markers[0]?.dataset.chatDayIso;
      if (!iso) return;
      setLabel(formatChatDayLabel(iso));
    }

    function onScroll() {
      update();
      setVisible(true);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), 1200);
    }

    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, [scrollerRef]);

  if (!label) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute left-0 right-0 top-2 z-20 flex justify-center transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
      aria-hidden
    >
      <span className="rounded-full bg-[#1a2e24]/80 px-3 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur-sm">
        {label}
      </span>
    </div>
  );
}
