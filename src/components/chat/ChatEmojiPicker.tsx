"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Smile } from "lucide-react";
import {
  CHAT_EMOJI_CATEGORIES,
  searchChatEmojis,
  type ChatEmojiCategoryId,
} from "@/lib/chat/emoji-catalog";
import { cn } from "@/lib/utils";

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
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] =
    useState<ChatEmojiCategoryId>("frequent");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
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

  return (
    <div ref={rootRef} className="relative">
      <button
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
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Emoji picker"
          className={cn(
            "absolute bottom-[calc(100%+0.4rem)] z-20 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-canopy/15 bg-white shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="border-b border-line/70 p-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search emoji"
              aria-label="Search emoji"
              className="w-full rounded-lg border border-line bg-mist/40 px-2.5 py-1.5 text-sm outline-none ring-canopy/30 focus:ring-2"
            />
          </div>
          {!query.trim() ? (
            <div className="flex gap-1 overflow-x-auto border-b border-line/70 px-2 py-1.5">
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
          <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto p-2">
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
      ) : null}
    </div>
  );
}
