"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { AccountVerifyEmailAction } from "@/components/account/AccountVerifyEmailAction";
import { useCustomerChatThread } from "@/components/customer-chat/useCustomerChatThread";
import {
  CUSTOMER_CHAT_PAGE_HREF,
  CUSTOMER_CHAT_TEXT_MAX_LENGTH,
  customerChatBlockedCopy,
  customerChatBubbleAlign,
  customerChatComposerCanSubmit,
  customerChatComposerKeyAction,
  customerChatEmptyCopy,
  customerChatEmptyTitle,
  customerChatMessageBody,
  customerChatPrependScrollTop,
  customerChatTranscriptItems,
  customerUnreadDividerMessageId,
} from "@/lib/customer-chat/query";
import type { CustomerChatMessage } from "@/lib/customer-chat/types";
import { cn } from "@/lib/utils";

const COMPOSER_ID = "customer-chat-composer";

export function CustomerChatScreen() {
  const {
    payload,
    loading,
    busy,
    loadError,
    sendError,
    sending,
    reload,
    loadOlder,
    send,
  } = useCustomerChatThread();
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const stickToBottomRef = useRef(true);
  const previousHeightRef = useRef(0);
  const pendingPrependRef = useRef(false);
  const firstMessageId = payload?.messages[0]?.id ?? null;
  const lastMessageId =
    payload?.messages[payload.messages.length - 1]?.id ?? null;

  const blocked = Boolean(payload?.blocked) || sendError?.kind === "blocked";
  const canSend = Boolean(payload?.canSend) && !blocked && !loadError;
  const dividerMessageId = payload
    ? customerUnreadDividerMessageId(
        payload.messages,
        payload.read.customerLastReadAt,
        payload.read.unreadCount,
      )
    : null;
  const rows = customerChatTranscriptItems(
    payload?.messages ?? [],
    dividerMessageId,
  );

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (pendingPrependRef.current) {
      el.scrollTop = customerChatPrependScrollTop({
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
  }, [firstMessageId, lastMessageId, payload?.messages.length, loading]);

  useEffect(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!vv || !root) return;
    function sync() {
      if (!root || !vv) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--customer-chat-keyboard", `${inset}px`);
    }
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

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
    loadOlder();
  }

  async function submit() {
    if (
      !customerChatComposerCanSubmit({
        body: draft,
        pending: sending,
        canSend,
      })
    ) {
      return;
    }
    const sent = await send(draft);
    if (sent) {
      setDraft("");
      stickToBottomRef.current = true;
      textareaRef.current?.focus();
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const action = customerChatComposerKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
    });
    if (action !== "send") return;
    event.preventDefault();
    void submit();
  }

  const remaining = CUSTOMER_CHAT_TEXT_MAX_LENGTH - draft.length;
  const verificationRequired = sendError?.kind === "verification";

  return (
    <section
      ref={rootRef}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-surface",
        "-mx-4 -mt-10 -mb-[calc(2.5rem+var(--mobile-bottom-nav,0px))] h-[calc(100dvh-5.75rem-env(safe-area-inset-top,0px)-var(--mobile-bottom-nav,0px))] pb-[var(--customer-chat-keyboard,0px)]",
        "md:mx-auto md:mt-0 md:mb-0 md:h-[min(42rem,calc(100dvh-9rem))] md:max-w-2xl md:rounded-2xl md:border md:border-line md:pb-0",
      )}
    >
      <header className="shrink-0 border-b border-line/80 px-4 py-3 sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
          Chat
        </p>
        <h1 className="font-display text-xl text-ink sm:text-2xl">
          Chat with your agent
        </h1>
        <p className="mt-0.5 text-sm text-ink/55">Your Agent</p>
      </header>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat transcript"
        aria-live="polite"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
      >
        {loading ? (
          <ChatSkeleton />
        ) : loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-ink/65">{loadError.message}</p>
            {loadError.kind === "auth" ? (
              <AuthOpenButton
                mode="sign-in"
                callbackUrl={CUSTOMER_CHAT_PAGE_HREF}
                className="rounded-xl bg-canopy px-4 py-2 text-sm font-semibold text-white hover:bg-canopy-deep"
              >
                Sign in
              </AuthOpenButton>
            ) : (
              <button
                type="button"
                onClick={reload}
                aria-label="Retry loading chat"
                className="rounded-xl border border-line bg-mist px-3 py-1.5 text-sm font-semibold text-ink hover:border-canopy/40"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <>
            {payload?.page.hasMore ? (
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
                  className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-semibold text-ink/65 hover:bg-mist disabled:opacity-60"
                >
                  {busy ? "Loading earlier…" : "Load earlier"}
                </button>
              </div>
            ) : null}
            {(payload?.messages.length ?? 0) === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                <p className="font-display text-xl text-ink">
                  {customerChatEmptyTitle()}
                </p>
                <p className="mt-2 max-w-sm text-sm text-ink/55">
                  {customerChatEmptyCopy()}
                </p>
              </div>
            ) : (
              <ol className="space-y-1.5">
                {rows.map((row) => (
                  <li key={row.message.id}>
                    {row.showDivider ? (
                      <div className="my-3 flex items-center gap-2">
                        <span className="h-px flex-1 bg-line" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">
                          New messages
                        </span>
                        <span className="h-px flex-1 bg-line" />
                      </div>
                    ) : null}
                    <CustomerChatRow
                      message={row.message}
                      grouped={row.grouped}
                    />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>

      {blocked ? (
        <div className="shrink-0 border-t border-line bg-mist/70 px-4 py-3">
          <p className="text-sm text-ink/65" role="status">
            {customerChatBlockedCopy()}
          </p>
        </div>
      ) : loading || loadError ? null : (
        <div className="shrink-0 border-t border-line bg-mist/50 px-3 py-2.5 sm:px-4">
          <div className="space-y-1.5">
            <label className="sr-only" htmlFor={COMPOSER_ID}>
              Message to your agent
            </label>
            <textarea
              id={COMPOSER_ID}
              ref={textareaRef}
              value={draft}
              maxLength={CUSTOMER_CHAT_TEXT_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              rows={2}
              disabled={sending || !canSend}
              enterKeyHint="send"
              placeholder="Write a message…"
              className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none ring-canopy/40 focus:ring-2 disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-[11px] leading-4 text-ink/40">
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
                  !customerChatComposerCanSubmit({
                    body: draft,
                    pending: sending,
                    canSend,
                  })
                }
                aria-label="Send message"
                className="shrink-0 rounded-xl bg-canopy px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-canopy-deep disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
            {sendError ? (
              <div className="space-y-2" role="alert">
                <p className="text-[12px] font-medium text-signal">
                  {sendError.message} Your message was kept.
                </p>
                {verificationRequired ? (
                  <AccountVerifyEmailAction
                    callbackUrl={CUSTOMER_CHAT_PAGE_HREF}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function CustomerChatRow({
  message,
  grouped,
}: {
  message: CustomerChatMessage;
  grouped: boolean;
}) {
  const align = customerChatBubbleAlign(message.senderKind, message.kind);
  if (align === "center") {
    const label = customerChatMessageBody(message) || "Update";
    return (
      <div className="flex justify-center py-1">
        <p className="rounded-full bg-mist px-3 py-1 text-[11px] font-semibold text-ink/55">
          {label}
        </p>
      </div>
    );
  }

  const mine = align === "right";
  const label = mine ? "You" : message.senderName || "Your Agent";
  const body = customerChatMessageBody(message);
  const deleted = Boolean(message.deletedAt);
  const sentAt = new Date(message.createdAt).toLocaleString("en-CA");

  return (
    <div className={cn("flex min-w-0", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn("min-w-0 max-w-[min(85%,28rem)]", mine ? "items-end" : "items-start")}
        aria-label={`${label}, ${sentAt}${deleted ? ", deleted" : ""}`}
      >
        {grouped ? (
          <p
            className={cn(
              "mb-0.5 text-[10px] font-medium text-ink/40",
              mine ? "text-right" : "text-left",
            )}
          >
            {sentAt}
          </p>
        ) : (
          <p
            className={cn(
              "mb-0.5 text-[11px] font-semibold",
              mine ? "text-right text-canopy-deep" : "text-ink/65",
            )}
          >
            {label}
            <span className="ml-1.5 font-medium text-ink/40">{sentAt}</span>
          </p>
        )}
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-5",
            deleted
              ? "bg-mist italic text-ink/55 ring-1 ring-line"
              : mine
                ? "bg-canopy text-white"
                : "bg-mist text-ink",
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
      <div className="h-10 w-2/3 rounded-2xl bg-mist" />
      <div className="ml-auto h-10 w-1/2 rounded-2xl bg-canopy/10" />
      <div className="h-10 w-3/5 rounded-2xl bg-mist" />
    </div>
  );
}
