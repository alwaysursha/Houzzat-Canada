"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  V2_CHAT_TEXT_MAX_LENGTH,
  v2ChatComposerCanSubmit,
  v2ChatComposerKeyAction,
  v2ChatComposerMode,
  v2ChatEmptyCopy,
  v2ChatMessageBody,
  v2ChatPrependScrollTop,
  v2ChatReadOnlyReason,
  v2ChatSystemCardLabel,
  v2ChatTranscriptItems,
  v2SmsBlockedCopy,
  v2SmsDeliveryLabel,
} from "@/lib/agent/lead-profile-v2/chat-query";
import type {
  LeadProfileV2ChatMessage,
  LeadProfileV2ChatPanel,
} from "@/lib/agent/lead-profile-v2/types";
import { cn } from "@/lib/utils";

export function AgentChatTranscriptPane({
  panel,
  loading,
  error,
  busy,
  sending,
  sendError,
  onRetry,
  onLoadOlder,
  onSend,
  composerId = "v2-chat-composer",
  frame = "card",
}: {
  panel: LeadProfileV2ChatPanel | null;
  loading: boolean;
  error: boolean;
  busy: boolean;
  sending: boolean;
  sendError: string | null;
  onRetry: () => void;
  onLoadOlder: () => void;
  onSend: (body: string, channel?: "CHAT" | "SMS") => Promise<boolean>;
  composerId?: string;
  frame?: "card" | "plain";
}) {
  const [draft, setDraft] = useState("");
  const [channel, setChannel] = useState<"CHAT" | "SMS">("CHAT");
  const [composerLeadId, setComposerLeadId] = useState(
    panel?.conversation.leadId ?? null,
  );
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);
  const previousHeightRef = useRef(0);
  const pendingPrependRef = useRef(false);
  const firstMessageId = panel?.messages[0]?.id ?? null;
  const lastMessageId = panel?.messages[panel.messages.length - 1]?.id ?? null;
  const leadId = panel?.conversation.leadId ?? null;
  if (leadId !== composerLeadId) {
    setComposerLeadId(leadId);
    setDraft("");
    setChannel("CHAT");
  }
  const composerMode = v2ChatComposerMode({
    loading,
    error,
    canMarkRead: Boolean(panel?.viewer.canMarkRead),
  });
  const canSend = composerMode === "composer";
  const smsEnabled = Boolean(panel?.smsSend?.enabled);
  const smsBlockedReason = v2SmsBlockedCopy(panel?.smsSend?.reason);
  const smsSelected = channel === "SMS";
  const readOnlyReason = panel
    ? v2ChatReadOnlyReason({
        canMarkRead: panel.viewer.canMarkRead,
        assignedAgentId: panel.assignedAgentId,
      })
    : null;
  const rows = v2ChatTranscriptItems(
    panel?.messages ?? [],
    panel?.unread.dividerMessageId ?? null,
  );

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (pendingPrependRef.current) {
      el.scrollTop = v2ChatPrependScrollTop({
        previousScrollHeight: previousHeightRef.current,
        nextScrollHeight: el.scrollHeight,
        previousScrollTop: el.scrollTop,
      });
      pendingPrependRef.current = false;
      return;
    }
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [firstMessageId, lastMessageId, panel?.messages.length, loading]);

  useEffect(() => {
    if (!busy && pendingPrependRef.current) {
      pendingPrependRef.current = false;
    }
  }, [busy]);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 48;
  }

  function handleLoadOlder() {
    const el = scrollerRef.current;
    previousHeightRef.current = el?.scrollHeight ?? 0;
    pendingPrependRef.current = true;
    stickToBottomRef.current = false;
    onLoadOlder();
  }

  async function submit() {
    if (
      !v2ChatComposerCanSubmit({
        body: draft,
        pending: sending,
        canSend,
        channel,
        smsEnabled,
      })
    ) {
      return;
    }
    const sent = await onSend(draft, channel);
    if (sent) {
      setDraft("");
      stickToBottomRef.current = true;
      textareaRef.current?.focus();
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const action = v2ChatComposerKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
    });
    if (action !== "send") return;
    event.preventDefault();
    void submit();
  }

  const remaining = V2_CHAT_TEXT_MAX_LENGTH - draft.length;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-white",
        frame === "card" &&
          "min-h-[20rem] rounded-lg border border-[#e2e8f0] lg:min-h-0",
      )}
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat transcript"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
      >
        {loading ? (
          <ChatSkeleton />
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-[#64748b]">Couldn’t load chat.</p>
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry loading chat"
              className="rounded-lg border border-[#d8dee6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1e2a38] hover:bg-[#f8fafc]"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {panel?.page.hasMore ? (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadOlder}
                  disabled={busy}
                  aria-label={
                    busy
                      ? "Loading earlier messages"
                      : "Load earlier messages"
                  }
                  className="rounded-full border border-[#d8dee6] bg-white px-3 py-1 text-[11px] font-semibold text-[#475569] hover:bg-[#f8fafc] disabled:opacity-60"
                >
                  {busy ? "Loading earlier messages…" : "Load earlier messages"}
                </button>
              </div>
            ) : null}
            {(panel?.messages.length ?? 0) === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-[#64748b]">
                {v2ChatEmptyCopy(canSend)}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {rows.map((row) => (
                  <li key={row.message.id}>
                    {row.showDivider ? (
                      <div className="my-3 flex items-center gap-2">
                        <span className="h-px flex-1 bg-[#e2e8f0]" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
                          New messages
                        </span>
                        <span className="h-px flex-1 bg-[#e2e8f0]" />
                      </div>
                    ) : null}
                    <ChatRow
                      message={row.message}
                      grouped={row.grouped}
                      viewerUserId={panel?.viewer.userId ?? null}
                    />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
      {composerMode === "hidden" ? null : (
        <div className="shrink-0 border-t border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5 sm:px-4">
          {canSend ? (
            <div className="space-y-1.5">
              <div
                role="tablist"
                aria-label="Message channel"
                className="inline-flex rounded-lg border border-[#d8dee6] bg-white p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!smsSelected}
                  onClick={() => setChannel("CHAT")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold",
                    !smsSelected
                      ? "bg-[#2b6cb0] text-white"
                      : "text-[#64748b] hover:text-[#1e2a38]",
                  )}
                >
                  Chat
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={smsSelected}
                  onClick={() => setChannel("SMS")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold",
                    smsSelected
                      ? "bg-[#2b6cb0] text-white"
                      : "text-[#64748b] hover:text-[#1e2a38]",
                  )}
                >
                  SMS
                </button>
              </div>
              <label className="sr-only" htmlFor={composerId}>
                {smsSelected ? "SMS message" : "Chat message"}
              </label>
              <textarea
                id={composerId}
                ref={textareaRef}
                value={draft}
                maxLength={V2_CHAT_TEXT_MAX_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposerKeyDown}
                rows={2}
                disabled={sending || (smsSelected && !smsEnabled)}
                placeholder={
                  smsSelected ? "Write an SMS…" : "Write a message…"
                }
                className="w-full resize-none rounded-lg border border-[#d8dee6] bg-white px-3 py-2 text-sm text-[#1e2a38] outline-none ring-[#2b6cb0] focus:ring-2 disabled:opacity-60"
              />
              {smsSelected && !smsEnabled ? (
                <p className="text-[12px] text-[#64748b]" role="status">
                  {smsBlockedReason ?? "SMS is unavailable."}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-[11px] leading-4 text-[#94a3b8]">
                  <span className="hidden sm:inline">
                    Enter to send · Shift+Enter for a new line
                  </span>
                  {remaining <= 200 ? (
                    <span>
                      <span className="hidden sm:inline"> · </span>
                      {remaining} left
                    </span>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={
                    !v2ChatComposerCanSubmit({
                      body: draft,
                      pending: sending,
                      canSend,
                      channel,
                      smsEnabled,
                    })
                  }
                  aria-label={
                    smsSelected ? "Send SMS message" : "Send chat message"
                  }
                  className="shrink-0 rounded-lg bg-[#2b6cb0] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#245a94] disabled:opacity-50"
                >
                  {sending ? "Sending…" : smsSelected ? "Send SMS" : "Send"}
                </button>
              </div>
              {sendError ? (
                <p
                  className="text-[12px] font-medium text-[#b45309]"
                  role="alert"
                >
                  {sendError}
                  {sendError.includes("Do not send it again")
                    ? ""
                    : " Your message was kept."}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] text-[#64748b]">
              {readOnlyReason ??
                "Only the assigned agent can send chat messages."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ChatRow({
  message,
  grouped,
  viewerUserId,
}: {
  message: LeadProfileV2ChatMessage;
  grouped: boolean;
  viewerUserId: string | null;
}) {
  if (message.kind === "SYSTEM_CARD") {
    return (
      <div className="flex justify-center py-1">
        <p className="rounded-full bg-[#f1f5f9] px-3 py-1 text-[11px] font-semibold text-[#475569]">
          {v2ChatSystemCardLabel(message.payload)}
        </p>
      </div>
    );
  }

  const mine =
    message.senderKind === "AGENT" &&
    Boolean(viewerUserId) &&
    message.senderUserId === viewerUserId;
  const customer = message.senderKind === "CUSTOMER";
  const label = mine ? "You" : message.senderName;
  const body = v2ChatMessageBody(message);
  const deleted = Boolean(message.deletedAt);
  const sentAt = new Date(message.createdAt).toLocaleString("en-CA");
  const sms = message.channel === "SMS";
  const delivery = v2SmsDeliveryLabel(message);

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[72%]",
          mine ? "items-end" : "items-start",
        )}
        aria-label={`${label}, ${sentAt}${sms ? ", SMS" : ""}${
          delivery ? `, ${delivery}` : ""
        }${deleted ? ", deleted" : ""}`}
      >
        {grouped ? (
          <p
            className={cn(
              "mb-0.5 text-[10px] font-medium text-[#94a3b8]",
              mine ? "text-right" : "text-left",
            )}
          >
            {sms ? <span className="mr-1 font-semibold">SMS</span> : null}
            {sentAt}
            {delivery ? <span className="ml-1">· {delivery}</span> : null}
          </p>
        ) : (
          <p
            className={cn(
              "mb-0.5 text-[11px] font-semibold",
              mine ? "text-right text-[#2b6cb0]" : "text-[#475569]",
            )}
          >
            {label}
            {sms ? (
              <span className="ml-1.5 rounded bg-[#e2e8f0] px-1 py-px text-[9px] font-bold uppercase tracking-wide text-[#475569]">
                SMS
              </span>
            ) : null}
            <span className="ml-1.5 font-medium text-[#94a3b8]">{sentAt}</span>
            {delivery ? (
              <span className="ml-1 font-medium text-[#94a3b8]">
                · {delivery}
              </span>
            ) : null}
          </p>
        )}
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-5",
            deleted
              ? "bg-[#f8fafc] italic text-[#64748b] ring-1 ring-[#e2e8f0]"
              : mine
                ? "bg-[#2b6cb0] text-white"
                : customer
                  ? "bg-[#f1f5f9] text-[#1e2a38]"
                  : "bg-[#eef6ff] text-[#1e2a38]",
          )}
        >
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-3 py-2" aria-hidden="true">
      <div className="h-10 w-2/3 rounded-2xl bg-[#f1f5f9]" />
      <div className="ml-auto h-10 w-1/2 rounded-2xl bg-[#e8eef7]" />
      <div className="h-10 w-3/5 rounded-2xl bg-[#f1f5f9]" />
    </div>
  );
}
