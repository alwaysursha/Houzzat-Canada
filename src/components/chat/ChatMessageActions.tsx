"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Reply, SmilePlus } from "lucide-react";
import { CHAT_REACTION_KEYS } from "@/lib/chat/emoji-catalog";
import { cn } from "@/lib/utils";

export type ChatMessageActionsProps = {
  align?: "start" | "end";
  canReply?: boolean;
  canReact?: boolean;
  onReply?: () => void;
  onReact?: (key: string) => void;
  children?: ReactNode;
};

/**
 * WhatsApp-style hover / long-press message actions.
 * Pin/Delete are intentionally omitted — no conversation-pin schema or
 * authenticated soft-delete message API is productized yet.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);

  function clearLongPress() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function closeAll() {
    setMenuOpen(false);
    setReactOpen(false);
  }

  useEffect(() => {
    if (!menuOpen && !reactOpen) return;
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
  }, [menuOpen, reactOpen]);

  if (!canReply && !canReact) {
    return <>{children}</>;
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "group/msg relative",
        align === "end" ? "items-end" : "items-start",
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        setReactOpen(false);
        setMenuOpen(true);
      }}
      onTouchStart={() => {
        clearLongPress();
        longPressTimer.current = window.setTimeout(() => {
          setReactOpen(false);
          setMenuOpen(true);
        }, 480);
      }}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
    >
      {children}
      <div
        className={cn(
          "pointer-events-none absolute top-0 z-10 flex items-center gap-0.5 opacity-0 transition",
          "group-hover/msg:pointer-events-auto group-hover/msg:opacity-100",
          "group-focus-within/msg:pointer-events-auto group-focus-within/msg:opacity-100",
          menuOpen || reactOpen
            ? "pointer-events-auto opacity-100"
            : null,
          align === "end" ? "-left-1 -translate-x-full" : "-right-1 translate-x-full",
        )}
      >
        {canReact ? (
          <button
            type="button"
            aria-label="React to message"
            aria-expanded={reactOpen}
            onClick={() => {
              setMenuOpen(false);
              setReactOpen((open) => !open);
            }}
            className="inline-flex size-8 items-center justify-center rounded-full border border-[#d8dee6] bg-white text-[#475569] shadow-sm hover:bg-[#f8fafc] hover:text-[#1e2a38]"
          >
            <SmilePlus className="size-3.5" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Message actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => {
            setReactOpen(false);
            setMenuOpen((open) => !open);
          }}
          className="inline-flex size-8 items-center justify-center rounded-full border border-[#d8dee6] bg-white text-[#475569] shadow-sm hover:bg-[#f8fafc] hover:text-[#1e2a38]"
        >
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </div>

      {/* Accessible always-available control for touch / keyboard without hover */}
      <button
        type="button"
        aria-label="Open message actions"
        className="sr-only focus:not-sr-only focus:absolute focus:right-0 focus:top-0 focus:z-20 focus:rounded-md focus:bg-white focus:px-2 focus:py-1 focus:text-xs focus:shadow"
        onClick={() => {
          setReactOpen(false);
          setMenuOpen(true);
        }}
      >
        Actions
      </button>

      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute z-30 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-[#d8dee6] bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.14)]",
            align === "end" ? "right-0" : "left-0",
            "top-full",
          )}
        >
          {canReply && onReply ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-[#1e2a38] hover:bg-[#f8fafc]"
              onClick={() => {
                closeAll();
                onReply();
              }}
            >
              <Reply className="size-4 text-[#64748b]" aria-hidden />
              Reply
            </button>
          ) : null}
          {canReact && onReact ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-[#1e2a38] hover:bg-[#f8fafc]"
              onClick={() => {
                setMenuOpen(false);
                setReactOpen(true);
              }}
            >
              <SmilePlus className="size-4 text-[#64748b]" aria-hidden />
              React
            </button>
          ) : null}
        </div>
      ) : null}

      {reactOpen && onReact ? (
        <div
          role="listbox"
          aria-label="Choose a reaction"
          className={cn(
            "absolute z-30 mt-1 flex items-center gap-0.5 rounded-full border border-[#d8dee6] bg-white px-1.5 py-1 shadow-[0_12px_32px_rgba(15,23,42,0.14)]",
            align === "end" ? "right-0" : "left-0",
            "top-full",
          )}
        >
          {CHAT_REACTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-label={`React ${key}`}
              className="inline-flex size-9 items-center justify-center rounded-full text-base hover:bg-[#f1f5f9]"
              onClick={() => {
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
