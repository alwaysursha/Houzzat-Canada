"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Plus, Reply, SmilePlus } from "lucide-react";
import {
  CHAT_EMOJI_CATEGORIES,
  CHAT_QUICK_REACTION_KEYS,
} from "@/lib/chat/emoji-catalog";
import { chatHaptic } from "@/lib/chat/chat-haptics";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD_PX = 56;
const LONG_PRESS_MS = 420;

export type ChatMessageActionsProps = {
  align?: "start" | "end";
  canReply?: boolean;
  canReact?: boolean;
  onReply?: () => void;
  onReact?: (key: string) => void;
  children?: ReactNode;
};

/**
 * WhatsApp-inspired hover / long-press actions + swipe-to-reply.
 * Pin/Delete intentionally omitted.
 */
export function ChatMessageActions({
  align = "start",
  canReply = true,
  canReact = true,
  onReply,
  onReact,
  children,
}: ChatMessageActionsProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  const swipeTriggered = useRef(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [extendedOpen, setExtendedOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dimmed, setDimmed] = useState(false);

  function clearLongPress() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function closeAll() {
    setReactOpen(false);
    setExtendedOpen(false);
    setDimmed(false);
  }

  function openReactions() {
    if (!canReact || !onReact) return;
    chatHaptic("long-press");
    setExtendedOpen(false);
    setReactOpen(true);
    setDimmed(true);
  }

  useEffect(() => {
    if (!reactOpen && !extendedOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeAll();
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target || !rootRef.current?.contains(target)) closeAll();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [reactOpen, extendedOpen]);

  function onPointerDownMsg(event: ReactPointerEvent) {
    if (event.button != null && event.button !== 0) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    swiping.current = false;
    swipeTriggered.current = false;
    clearLongPress();
    if (event.pointerType === "touch") {
      longPressTimer.current = window.setTimeout(() => {
        openReactions();
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMoveMsg(event: ReactPointerEvent) {
    if (!pointerStart.current || !canReply || !onReply) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    if (!swiping.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        clearLongPress();
        pointerStart.current = null;
        return;
      }
      swiping.current = true;
      clearLongPress();
    }
    // Consistent direction: swipe right reveals reply affordance.
    const next = Math.max(0, Math.min(dx, 72));
    setDragX(next);
    if (next >= SWIPE_THRESHOLD_PX && !swipeTriggered.current) {
      swipeTriggered.current = true;
      chatHaptic("swipe-reply");
    }
  }

  function onPointerUpMsg() {
    clearLongPress();
    if (swiping.current && swipeTriggered.current && onReply) {
      onReply();
    }
    pointerStart.current = null;
    swiping.current = false;
    swipeTriggered.current = false;
    setDragX(0);
  }

  if (!canReply && !canReact) {
    return <>{children}</>;
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "group/msg relative touch-pan-y",
        align === "end" ? "items-end" : "items-start",
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        openReactions();
      }}
      onPointerDown={onPointerDownMsg}
      onPointerMove={onPointerMoveMsg}
      onPointerUp={onPointerUpMsg}
      onPointerCancel={onPointerUpMsg}
    >
      {dimmed ? (
        <div
          className="fixed inset-0 z-20 bg-[#0a2f24]/20"
          aria-hidden
          onClick={closeAll}
        />
      ) : null}

      {canReply ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-0 flex items-center pl-1",
            "text-[#0f6b4c] transition-opacity",
            dragX > 12 ? "opacity-100" : "opacity-0",
          )}
          aria-hidden
        >
          <Reply className="size-5" />
        </div>
      ) : null}

      <div
        style={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          transition: dragX ? undefined : "transform 160ms ease-out",
        }}
        className="relative z-[1] motion-reduce:transform-none"
      >
        {children}
      </div>

      {/* Desktop hover entry */}
      <div
        className={cn(
          "pointer-events-none absolute top-0 z-10 flex items-center gap-0.5 opacity-0 transition",
          "group-hover/msg:pointer-events-auto group-hover/msg:opacity-100",
          "group-focus-within/msg:pointer-events-auto group-focus-within/msg:opacity-100",
          reactOpen || extendedOpen
            ? "pointer-events-auto opacity-100"
            : null,
          align === "end"
            ? "-left-1 -translate-x-full"
            : "-right-1 translate-x-full",
        )}
      >
        {canReact ? (
          <button
            type="button"
            aria-label="React to message"
            aria-expanded={reactOpen}
            onClick={() => openReactions()}
            className="inline-flex size-8 items-center justify-center rounded-full border border-[#d8dee6] bg-white text-[#475569] shadow-sm hover:bg-[#f8fafc] hover:text-[#1e2a38]"
          >
            <SmilePlus className="size-3.5" aria-hidden />
          </button>
        ) : null}
        {canReply && onReply ? (
          <button
            type="button"
            aria-label="Reply to message"
            onClick={() => onReply()}
            className="inline-flex size-8 items-center justify-center rounded-full border border-[#d8dee6] bg-white text-[#475569] shadow-sm hover:bg-[#f8fafc] hover:text-[#1e2a38]"
          >
            <Reply className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Open message reactions"
        className="sr-only focus:not-sr-only focus:absolute focus:right-0 focus:top-0 focus:z-20 focus:rounded-md focus:bg-white focus:px-2 focus:py-1 focus:text-xs focus:shadow"
        onClick={() => openReactions()}
      >
        React
      </button>

      {reactOpen && onReact ? (
        <div
          id={menuId}
          role="listbox"
          aria-label="Choose a reaction"
          className={cn(
            "absolute z-30 flex items-center gap-0.5 rounded-full border border-[#e2e8f0] bg-white px-1.5 py-1.5 shadow-[0_12px_40px_rgba(15,23,42,0.18)]",
            align === "end" ? "right-0" : "left-0",
            "bottom-[calc(100%+0.35rem)]",
          )}
        >
          {CHAT_QUICK_REACTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-label={`React ${key}`}
              className="inline-flex size-10 items-center justify-center rounded-full text-[1.35rem] transition hover:scale-110 hover:bg-[#f1f5f9]"
              onClick={() => {
                chatHaptic("reaction");
                onReact(key);
                closeAll();
              }}
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            aria-label="More reactions"
            aria-expanded={extendedOpen}
            className="inline-flex size-9 items-center justify-center rounded-full border border-[#e2e8f0] bg-[#f8fafc] text-[#475569] hover:bg-[#eef2f7]"
            onClick={() => setExtendedOpen((open) => !open)}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {extendedOpen && onReact ? (
        <div
          role="listbox"
          aria-label="More reactions"
          className={cn(
            "absolute z-30 max-h-48 w-[16.5rem] overflow-y-auto rounded-2xl border border-[#e2e8f0] bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.18)]",
            align === "end" ? "right-0" : "left-0",
            "bottom-[calc(100%+3.25rem)]",
          )}
        >
          {CHAT_EMOJI_CATEGORIES[0]?.emojis.map((key) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-label={`React ${key}`}
              className="inline-flex size-9 items-center justify-center rounded-lg text-lg hover:bg-[#f1f5f9]"
              onClick={() => {
                chatHaptic("reaction");
                onReact(key);
                closeAll();
              }}
            >
              {key}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
