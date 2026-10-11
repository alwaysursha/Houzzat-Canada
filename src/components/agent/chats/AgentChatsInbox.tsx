"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { AgentChatTranscriptPane } from "@/components/agent/chat/AgentChatTranscriptPane";
import { useAgentChatThread } from "@/components/agent/chat/useAgentChatThread";
import { fetchV2Json } from "@/lib/agent/lead-profile-v2/fetch-json";
import { createLeadProfileV2Session } from "@/lib/agent/lead-profile-v2/request-gate";
import {
  applyInboxMarkRead,
  applyInboxSentMessage,
  CHATS_INBOX_API_ROUTE,
  CHATS_INBOX_SEARCH_DEBOUNCE_MS,
  chatsInboxListUrl,
  chatsPageHref,
  chatsViewLeadHref,
  formatInboxTime,
  inboxEmptyCopy,
  inboxInitials,
  mergeInboxRows,
  moveInboxRowToTop,
  readChatsLeadParam,
  type ChatsInboxFilter,
  type ChatsInboxListResult,
  type ChatsInboxRow,
} from "@/lib/agent/chats-inbox-query";
import type { LeadProfileV2ChatMessage } from "@/lib/agent/lead-profile-v2/types";
import { cn } from "@/lib/utils";

export function AgentChatsInbox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedLeadId = readChatsLeadParam(searchParams);
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChatsInboxFilter>("all");
  const [rows, setRows] = useState<ChatsInboxRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const sessionRef = useRef(createLeadProfileV2Session());
  const listAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = queryInput.trim();
      setDebouncedQ(trimmed || null);
    }, CHATS_INBOX_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [queryInput]);

  const loadList = useCallback(
    async (cursor: string | null) => {
      const isMore = Boolean(cursor);
      if (isMore) setLoadingMore(true);
      else {
        listAbortRef.current?.abort();
        setLoading(true);
        setError(false);
      }
      const controller = new AbortController();
      if (!isMore) listAbortRef.current = controller;
      try {
        const json = await fetchV2Json<ChatsInboxListResult>(
          chatsInboxListUrl({
            q: debouncedQ,
            filter,
            cursor,
          }),
          CHATS_INBOX_API_ROUTE,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setHasMore(json.page.hasMore);
        setNextCursor(json.page.nextCursor);
        setRows((prev) =>
          isMore ? mergeInboxRows(prev, json.conversations) : json.conversations,
        );
      } catch {
        if (controller.signal.aborted) return;
        if (isMore) return;
        setError(true);
        setRows([]);
        setHasMore(false);
        setNextCursor(null);
      } finally {
        if (!controller.signal.aborted) {
          if (isMore) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [debouncedQ, filter],
  );

  useEffect(() => {
    void loadList(null);
    return () => listAbortRef.current?.abort();
  }, [loadList]);

  function selectLead(leadId: string | null) {
    router.replace(chatsPageHref(leadId), { scroll: false });
  }

  const selectedRowFromList = useMemo(
    () => rows.find((row) => row.leadId === selectedLeadId) ?? null,
    [rows, selectedLeadId],
  );
  const selectedRowCacheRef = useRef<ChatsInboxRow | null>(null);
  if (selectedRowFromList) selectedRowCacheRef.current = selectedRowFromList;
  const selectedRow =
    selectedRowFromList ??
    (selectedRowCacheRef.current?.leadId === selectedLeadId
      ? selectedRowCacheRef.current
      : null);

  const onRead = useCallback(() => {
    if (!selectedLeadId) return;
    setRows((prev) =>
      prev.map((row) =>
        row.leadId === selectedLeadId ? applyInboxMarkRead(row) : row,
      ),
    );
  }, [selectedLeadId]);

  const onSent = useCallback(
    (message: LeadProfileV2ChatMessage) => {
      if (!selectedLeadId) return;
      setRows((prev) =>
        moveInboxRowToTop(prev, selectedLeadId, (row) =>
          applyInboxSentMessage(row, message),
        ),
      );
    },
    [selectedLeadId],
  );

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-1 overflow-hidden bg-white lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
      <aside
        className={cn(
          "min-h-0 min-w-0 flex-col border-[#e2e8f0] bg-white lg:flex lg:border-r",
          selectedLeadId ? "hidden" : "flex",
        )}
      >
        <div className="shrink-0 border-b border-[#e2e8f0] px-4 py-3">
          <h1 className="font-display text-2xl text-[#1e2a38]">Chats</h1>
          <label className="sr-only" htmlFor="agent-chats-search">
            Search chats
          </label>
          <input
            id="agent-chats-search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Search name, email, or phone"
            className="mt-3 w-full rounded-lg border border-[#d8dee6] bg-[#f8fafc] px-3 py-2 text-sm text-[#1e2a38] outline-none ring-[#2b6cb0] placeholder:text-[#94a3b8] focus:bg-white focus:ring-2"
          />
          <div
            role="tablist"
            aria-label="Chat filters"
            className="mt-3 flex w-fit rounded-lg border border-[#d8dee6] bg-[#f8fafc] p-0.5"
          >
            <FilterTab
              label="All"
              selected={filter === "all"}
              onSelect={() => setFilter("all")}
            />
            <FilterTab
              label="Unread"
              selected={filter === "unread"}
              onSelect={() => setFilter("unread")}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <InboxSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <p className="text-sm text-[#64748b]">Couldn’t load chats.</p>
              <button
                type="button"
                onClick={() => void loadList(null)}
                className="rounded-lg border border-[#d8dee6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1e2a38] hover:bg-[#f8fafc]"
              >
                Retry
              </button>
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-[#64748b]">
              {inboxEmptyCopy({ filter, q: debouncedQ })}
            </p>
          ) : (
            <ul>
              {rows.map((row) => (
                <li key={row.conversationId}>
                  <button
                    type="button"
                    onClick={() => selectLead(row.leadId)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-[#f1f5f9] px-4 py-3 text-left transition hover:bg-[#f8fafc]",
                      selectedLeadId === row.leadId && "bg-[#eef6ff]",
                    )}
                  >
                    <InboxAvatar
                      name={row.lead.displayName}
                      avatarUrl={row.lead.avatarUrl}
                      unread={row.unread.count > 0}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm text-[#1e2a38]",
                            row.unread.count > 0
                              ? "font-bold"
                              : "font-semibold",
                          )}
                        >
                          {row.lead.displayName}
                        </span>
                        <span className="shrink-0 text-[11px] text-[#94a3b8]">
                          {formatInboxTime(row.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[13px]",
                            row.unread.count > 0
                              ? "font-medium text-[#1e2a38]"
                              : "text-[#64748b]",
                          )}
                        >
                          {row.latestMessage?.preview || "No messages"}
                        </span>
                        {row.latestMessage?.channel === "SMS" ? (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                            SMS
                          </span>
                        ) : null}
                        {row.unread.count > 0 ? (
                          <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-canopy px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {row.unread.count > 99 ? "99+" : row.unread.count}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMore && !loading && !error ? (
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={() => void loadList(nextCursor)}
                disabled={loadingMore || !nextCursor}
                className="w-full rounded-lg border border-[#d8dee6] bg-white px-3 py-2 text-[12px] font-semibold text-[#475569] hover:bg-[#f8fafc] disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <section
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col bg-[#f7f9fb]",
          selectedLeadId ? "flex" : "hidden lg:flex",
        )}
      >
        {selectedLeadId ? (
          <SelectedThread
            leadId={selectedLeadId}
            row={selectedRow}
            session={sessionRef.current}
            onBack={() => selectLead(null)}
            onRead={onRead}
            onSent={onSent}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-canopy shadow-sm ring-1 ring-[#e2e8f0]">
              <MessageCircle className="size-6" strokeWidth={1.75} />
            </span>
            <p className="font-display text-xl text-[#1e2a38]">
              Select a conversation
            </p>
            <p className="max-w-sm text-sm text-[#64748b]">
              Choose a chat from the list to read and reply in the same thread
              as Lead Profile.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function SelectedThread({
  leadId,
  row,
  session,
  onBack,
  onRead,
  onSent,
}: {
  leadId: string;
  row: ChatsInboxRow | null;
  session: ReturnType<typeof createLeadProfileV2Session>;
  onBack: () => void;
  onRead: () => void;
  onSent: (message: LeadProfileV2ChatMessage) => void;
}) {
  const chat = useAgentChatThread(session, leadId, true, { onRead, onSent });
  const name = row?.lead.displayName ?? "Conversation";
  const email = row?.lead.email;
  const phone = row?.lead.phone;
  const subtitle = [email, phone].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-[#e2e8f0] bg-white px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chats"
          className="inline-flex size-10 items-center justify-center rounded-lg text-[#1e2a38] hover:bg-[#f8fafc] lg:hidden"
        >
          <ArrowLeft className="size-5" />
        </button>
        <InboxAvatar
          name={name}
          avatarUrl={row?.lead.avatarUrl ?? null}
          unread={false}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[#1e2a38] sm:text-base">
            {name}
          </p>
          {subtitle ? (
            <p className="truncate text-[12px] text-[#64748b]">{subtitle}</p>
          ) : null}
        </div>
        <Link
          href={chatsViewLeadHref(leadId)}
          className="shrink-0 rounded-lg border border-[#d8dee6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1e2a38] hover:bg-[#f8fafc]"
        >
          View Lead
        </Link>
      </header>
      <AgentChatTranscriptPane
        panel={chat.panel}
        loading={chat.loading}
        error={chat.error}
        busy={chat.busy}
        sending={chat.sending}
        sendError={chat.sendError}
        onRetry={chat.reload}
        onLoadOlder={chat.loadOlder}
        onSend={chat.send}
        onSendVoice={chat.sendVoiceNote}
        onSendListingShare={chat.appendListingShareMessage}
        onReact={chat.reactToMessage}
        onSearch={chat.searchMessages}
        onEnsureMessage={chat.ensureMessageLoaded}
        composerId="agent-chats-composer"
        frame="plain"
      />
    </div>
  );
}

function FilterTab({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "rounded-md px-3 py-1 text-[12px] font-semibold transition",
        selected
          ? "bg-white text-[#1e2a38] shadow-sm"
          : "text-[#64748b] hover:text-[#1e2a38]",
      )}
    >
      {label}
    </button>
  );
}

function InboxAvatar({
  name,
  avatarUrl,
  unread,
}: {
  name: string;
  avatarUrl: string | null;
  unread: boolean;
}) {
  return (
    <span
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8eef7] text-[12px] font-bold text-[#2b6cb0]",
        unread && "ring-2 ring-canopy/40",
      )}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        inboxInitials(name)
      )}
    </span>
  );
}

function InboxSkeleton() {
  return (
    <div className="space-y-0" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-[#f1f5f9] px-4 py-3"
        >
          <span className="size-11 rounded-full bg-[#f1f5f9]" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-1/2 rounded bg-[#f1f5f9]" />
            <span className="block h-3 w-3/4 rounded bg-[#f8fafc]" />
          </span>
        </div>
      ))}
    </div>
  );
}
