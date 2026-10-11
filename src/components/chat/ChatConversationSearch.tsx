"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatSearchHit = {
  id: string;
  body: string;
  senderName: string;
  createdAt: string;
};

export function ChatConversationSearch({
  onSearch,
  onSelect,
}: {
  onSearch: (
    query: string,
    cursor?: string | null,
  ) => Promise<{
    hits: ChatSearchHit[];
    page: { hasMore: boolean; nextCursor: string | null };
  }>;
  onSelect: (messageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ChatSearchHit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(nextQuery: string, cursor?: string | null) {
    const q = nextQuery.trim();
    if (!q) {
      setHits([]);
      setNextCursor(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onSearch(q, cursor);
      setHits((prev) => (cursor ? [...prev, ...result.hits] : result.hits));
      setNextCursor(result.page.nextCursor);
    } catch {
      setError("Couldn’t search messages.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Search conversation"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-8 items-center justify-center rounded-lg text-ink/55 hover:bg-mist hover:text-ink"
      >
        <Search className="size-4" aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-30 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-canopy/15 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-line/70 p-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runSearch(query);
                }
              }}
              placeholder="Search messages"
              aria-label="Search messages"
              className="min-w-0 flex-1 rounded-lg border border-line bg-mist/40 px-2.5 py-1.5 text-sm outline-none ring-canopy/30 focus:ring-2"
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={() => setOpen(false)}
              className="inline-flex size-8 items-center justify-center rounded-lg text-ink/45 hover:bg-mist"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {error ? (
              <p className="px-1 py-2 text-xs text-signal">{error}</p>
            ) : hits.length === 0 ? (
              <p className="px-1 py-2 text-xs text-ink/45">
                {busy ? "Searching…" : "Type a phrase and press Enter."}
              </p>
            ) : (
              <ul className="space-y-1">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(hit.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full rounded-lg px-2 py-1.5 text-left hover:bg-mist",
                      )}
                    >
                      <p className="truncate text-[11px] font-semibold text-ink/55">
                        {hit.senderName} ·{" "}
                        {new Date(hit.createdAt).toLocaleString("en-CA")}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-ink">
                        {hit.body}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {nextCursor ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runSearch(query, nextCursor)}
                className="mt-2 w-full rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-ink/60 hover:bg-mist disabled:opacity-50"
              >
                {busy ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
