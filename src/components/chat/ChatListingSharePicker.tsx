"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bath, Bed, House, Loader2, Search, X } from "lucide-react";
import { ChatListingShareCard } from "@/components/chat/ChatListingShareCard";
import {
  AGENT_LISTING_SHARE_SEARCH_DEBOUNCE_MS,
  AGENT_LISTING_SHARE_SEARCH_MIN_Q,
  fetchAgentListingShareSearch,
  newListingShareIdempotencyKey,
  postAgentListingShare,
  resolveListingShareIdempotencyKey,
  type AgentListingSharePickerItem,
} from "@/lib/chat/listing-share/client";
import {
  formatListPrice,
  formatListingAddress,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import {
  STAFF_OVERLAY_PRIORITY,
  useStaffOverlay,
} from "@/lib/mobile/use-staff-overlay";
import { cn } from "@/lib/utils";

type PanelView =
  | { kind: "search" }
  | { kind: "preview"; item: AgentListingSharePickerItem };

function formatBeds(beds: number): string {
  return Number.isInteger(beds) ? String(beds) : beds.toFixed(1);
}

function formatBaths(baths: number): string {
  return Number.isInteger(baths) ? String(baths) : baths.toFixed(1);
}

function ResultRow({
  item,
  onSelect,
}: {
  item: AgentListingSharePickerItem;
  onSelect: () => void;
}) {
  const preview = item.preview;
  const [street, cityLine] = formatListingAddress(preview);
  const price = formatListPrice(preview.listPrice, preview.transactionType);
  const status = listingStatusLabel(preview.status, preview.transactionType);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full min-w-0 items-stretch gap-3 rounded-xl border border-[#e2e8f0] bg-white p-2.5 text-left transition hover:border-canopy/30 hover:bg-[#f3fbf7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35"
    >
      <div className="relative h-16 w-[5.5rem] shrink-0 overflow-hidden rounded-lg bg-mist">
        {preview.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- validated snapshot CDN URL
          <img
            src={preview.primaryImageUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-canopy/35">
            <House className="size-5" aria-hidden />
          </div>
        )}
        <span
          className={cn(
            "absolute left-1 top-1 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide text-white",
            listingStatusBadgeClass(preview.status),
          )}
        >
          {status}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 py-0.5">
        <p className="text-sm font-bold text-canopy">{price}</p>
        <p className="truncate text-[13px] font-semibold text-ink">{street}</p>
        <p className="truncate text-[11px] text-ink/55">{cityLine}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink/55">
          <span>{propertyTypeLabel(preview.propertyType)}</span>
          <span className="inline-flex items-center gap-0.5">
            <Bed className="size-3" aria-hidden />
            {formatBeds(preview.beds)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Bath className="size-3" aria-hidden />
            {formatBaths(preview.baths)}
          </span>
        </p>
      </div>
    </button>
  );
}

export function ChatListingSharePicker({
  leadId,
  disabled = false,
  onShared,
}: {
  leadId: string;
  disabled?: boolean;
  /** Append message via existing chat thread. Never push from client. */
  onShared: (message: unknown) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<AgentListingSharePickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [view, setView] = useState<PanelView>({ kind: "search" });
  const [idempotency, setIdempotency] = useState<{
    listingId: string;
    key: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();

  useStaffOverlay({
    open,
    id: `listing-share:${leadId}`,
    priority: STAFF_OVERLAY_PRIORITY.leadPopup + 3,
    lockScroll: true,
    onClose: () => {
      if (sendingRef.current) return;
      setOpen(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, AGENT_LISTING_SHARE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    if (view.kind !== "search") return;

    if (debouncedQuery.length < AGENT_LISTING_SHARE_SEARCH_MIN_Q) {
      setItems([]);
      setLoading(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setSearchError(null);
    void fetchAgentListingShareSearch(debouncedQuery, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        if (!result.ok) {
          setItems([]);
          setSearchError(result.error);
          return;
        }
        setItems(result.items);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setLoading(false);
        setItems([]);
        setSearchError(
          "Couldn’t search properties. Check your connection and try again.",
        );
      });

    return () => controller.abort();
  }, [debouncedQuery, open, view.kind]);

  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (sendingRef.current) return;
        if (view.kind === "preview") {
          setView({ kind: "search" });
          setSendError(null);
          return;
        }
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = [
        ...node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, view.kind]);

  function resetState() {
    setQuery("");
    setDebouncedQuery("");
    setItems([]);
    setLoading(false);
    setSearchError(null);
    setView({ kind: "search" });
    setIdempotency(null);
    setSending(false);
    setSendError(null);
    sendingRef.current = false;
  }

  function openPicker() {
    if (disabled) return;
    resetState();
    setOpen(true);
  }

  function closePicker() {
    if (sendingRef.current) return;
    setOpen(false);
    resetState();
  }

  function selectItem(item: AgentListingSharePickerItem) {
    setIdempotency((previous) =>
      resolveListingShareIdempotencyKey({
        listingId: item.listingId,
        previous,
      }),
    );
    setSendError(null);
    setView({ kind: "preview", item });
  }

  async function sendSelected() {
    if (view.kind !== "preview" || sendingRef.current) return;
    const item = view.item;
    const keyBundle =
      idempotency?.listingId === item.listingId
        ? idempotency
        : {
            listingId: item.listingId,
            key: newListingShareIdempotencyKey(),
          };
    setIdempotency(keyBundle);
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const result = await postAgentListingShare(leadId, {
        listingId: item.listingId,
        idempotencyKey: keyBundle.key,
      });
      if (!result.ok) {
        setSendError(result.error);
        return;
      }
      const appended = await onShared(result.message);
      if (!appended) {
        setSendError("Shared, but the transcript didn’t update. Refresh chat.");
        return;
      }
      setOpen(false);
      resetState();
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Share property"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-lg border border-[#d8dee6] bg-white text-[#475569] transition hover:bg-[#eef6ff] hover:text-[#1e2a38] disabled:opacity-50",
          open && "border-[#2b6cb0]/40 bg-[#eef6ff] text-[#2b6cb0]",
        )}
      >
        <House className="size-4" aria-hidden />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !sendingRef.current) {
              closePicker();
            }
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-canopy/15 sm:rounded-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="text-sm font-semibold text-ink"
                >
                  {view.kind === "preview"
                    ? "Preview property"
                    : "Share a property"}
                </h2>
                <p className="text-[11px] text-ink/50">
                  {view.kind === "preview"
                    ? "Customer will see this card in chat."
                    : "Search workspace listings that guests can view."}
                </p>
              </div>
              <button
                type="button"
                onClick={closePicker}
                disabled={sending}
                aria-label="Close"
                className="inline-flex size-9 items-center justify-center rounded-lg text-ink/55 hover:bg-mist hover:text-ink disabled:opacity-50"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            {view.kind === "search" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-[#e2e8f0] px-4 py-3">
                  <label className="sr-only" htmlFor={`${titleId}-search`}>
                    Search listings
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/35"
                      aria-hidden
                    />
                    <input
                      id={`${titleId}-search`}
                      ref={searchInputRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Address or MLS® number"
                      autoComplete="off"
                      className="w-full rounded-xl border border-[#d8dee6] bg-white py-2.5 pl-9 pr-3 text-sm text-ink outline-none ring-canopy/30 focus:ring-2"
                    />
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink/50">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Searching…
                    </div>
                  ) : searchError ? (
                    <div className="space-y-3 py-8 text-center">
                      <p className="text-sm text-ink/65" role="alert">
                        {searchError}
                      </p>
                      <button
                        type="button"
                        onClick={() => setDebouncedQuery(query.trim())}
                        className="rounded-lg bg-canopy px-3 py-2 text-xs font-semibold text-white hover:bg-canopy-deep"
                      >
                        Retry
                      </button>
                    </div>
                  ) : debouncedQuery.length < AGENT_LISTING_SHARE_SEARCH_MIN_Q ? (
                    <p className="py-10 text-center text-sm text-ink/45">
                      Type at least {AGENT_LISTING_SHARE_SEARCH_MIN_Q} characters
                      to search.
                    </p>
                  ) : items.length === 0 ? (
                    <p className="py-10 text-center text-sm text-ink/45">
                      No shareable listings matched. Try another address or MLS®.
                    </p>
                  ) : (
                    items.map((item) => (
                      <ResultRow
                        key={item.listingId}
                        item={item}
                        onSelect={() => selectItem(item)}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                  <div className="mx-auto flex w-full max-w-[19rem] justify-center">
                    <ChatListingShareCard payload={view.item.preview} />
                  </div>
                </div>
                {sendError ? (
                  <p
                    className="px-4 pb-2 text-[12px] font-medium text-[#b45309]"
                    role="alert"
                  >
                    {sendError}
                  </p>
                ) : null}
                <div className="flex gap-2 border-t border-[#e2e8f0] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setView({ kind: "search" });
                      setSendError(null);
                    }}
                    disabled={sending}
                    className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-[#d8dee6] bg-white px-3 text-sm font-semibold text-ink hover:bg-mist disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendSelected()}
                    disabled={sending}
                    className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-canopy px-3 text-sm font-semibold text-white hover:bg-canopy-deep disabled:opacity-50"
                  >
                    {sending ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Sharing…
                      </span>
                    ) : (
                      "Share in chat"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
