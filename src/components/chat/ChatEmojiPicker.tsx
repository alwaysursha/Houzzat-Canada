"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Smile } from "lucide-react";
import {
  CHAT_EMOJI_CATEGORIES,
  searchChatEmojis,
  type ChatEmojiCategoryId,
} from "@/lib/chat/emoji-catalog";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 288;
const PANEL_EST_HEIGHT = 280;
const VIEWPORT_PAD = 12;
const GAP = 8;

function computeEmojiPanelStyle(
  anchor: DOMRect,
  align: "left" | "right",
  viewport: { width: number; height: number },
): CSSProperties {
  const width = Math.min(PANEL_WIDTH, viewport.width - VIEWPORT_PAD * 2);
  let left = align === "right" ? anchor.right - width : anchor.left;
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, viewport.width - VIEWPORT_PAD - width),
  );

  const spaceAbove = anchor.top - VIEWPORT_PAD - GAP;
  const spaceBelow = viewport.height - anchor.bottom - VIEWPORT_PAD - GAP;
  const placeAbove = spaceAbove >= 160 || spaceAbove >= spaceBelow;
  const maxHeight = Math.max(
    160,
    Math.min(PANEL_EST_HEIGHT, placeAbove ? spaceAbove : spaceBelow),
  );
  const top = placeAbove
    ? Math.max(VIEWPORT_PAD, anchor.top - GAP - maxHeight)
    : anchor.bottom + GAP;

  return {
    position: "fixed",
    top,
    left,
    width,
    maxHeight,
    zIndex: 220,
  };
}

export function ChatEmojiPicker({
  onPick,
  disabled = false,
  align = "left",
}: {
  onPick: (emoji: string) => void;
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] =
    useState<ChatEmojiCategoryId>("frequent");
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(undefined);
      return;
    }
    function update() {
      const el = buttonRef.current;
      if (!el) return;
      setPanelStyle(
        computeEmojiPanelStyle(el.getBoundingClientRect(), align, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const emojis = useMemo(() => {
    if (query.trim()) return searchChatEmojis(query);
    const category =
      CHAT_EMOJI_CATEGORIES.find((row) => row.id === categoryId) ??
      CHAT_EMOJI_CATEGORIES[0]!;
    return [...category.emojis];
  }, [categoryId, query]);

  // Closed = unmounted portal (never leave an invisible in-flow body child).
  const panel =
    open && panelStyle ? (
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-label="Emoji picker"
        style={panelStyle}
        className="flex flex-col overflow-hidden rounded-xl border border-canopy/15 bg-white shadow-[0_16px_40px_rgba(15,61,46,0.18)]"
      >
        <div className="shrink-0 border-b border-line/70 p-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search emoji"
            aria-label="Search emoji"
            className="w-full rounded-lg border border-line bg-mist/40 px-2.5 py-1.5 text-sm outline-none ring-canopy/30 focus:ring-2"
          />
        </div>
        {!query.trim() ? (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line/70 px-2 py-1.5">
            {CHAT_EMOJI_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  categoryId === category.id
                    ? "bg-canopy/10 text-canopy-deep"
                    : "text-ink/50 hover:bg-mist",
                )}
              >
                {category.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 grid grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain p-2">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Insert ${emoji}`}
              className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-mist"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
                setQuery("");
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label="Insert emoji"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-8 items-center justify-center rounded-lg text-ink/55 hover:bg-mist hover:text-ink disabled:opacity-50"
      >
        <Smile className="size-4" aria-hidden />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
