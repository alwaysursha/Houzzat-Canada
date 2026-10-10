"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowLeft, Minus, X } from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { AccountVerifyEmailAction } from "@/components/account/AccountVerifyEmailAction";
import { ChatConversationSearch } from "@/components/chat/ChatConversationSearch";
import { ChatEmojiPicker } from "@/components/chat/ChatEmojiPicker";
import {
  ChatQuotedPreview,
  ChatReactionBar,
  ChatReceiptLabel,
} from "@/components/chat/ChatMessageExtras";
import { useCustomerChatThread } from "@/components/customer-chat/useCustomerChatThread";
import { insertEmojiAtCursor } from "@/lib/chat/emoji-catalog";
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
  customerSmsAutomationBadge,
  customerUnreadDividerMessageId,
} from "@/lib/customer-chat/query";
import {
  CUSTOMER_CHAT_FLOATING_SIZE,
  clampCustomerChatWindowPosition,
  formatCustomerChatListingBanner,
  presentCustomerChatAgentInitials,
  presentCustomerChatAgentName,
  type CustomerChatListingContext,
  type CustomerChatWindowPosition,
} from "@/lib/customer-chat/floating-chat";
import type { CustomerChatMessage } from "@/lib/customer-chat/types";
import { cn } from "@/lib/utils";

const COMPOSER_ID = "customer-chat-composer";

export type CustomerChatChrome = "page" | "floating" | "mobile-sheet";

export function CustomerChatScreen({
  chrome = "page",
  draft: controlledDraft,
  onDraftChange,
  listingContext = null,
  onClose,
  onMinimize,
  chatVisible = true,
  hideOuterHeader = false,
  position,
  onPositionChange,
}: {
  chrome?: CustomerChatChrome;
  draft?: string;
  onDraftChange?: (value: string) => void;
  listingContext?: CustomerChatListingContext | null;
  onClose?: () => void;
  onMinimize?: () => void;
  chatVisible?: boolean;
  hideOuterHeader?: boolean;
  position?: CustomerChatWindowPosition;
  onPositionChange?: (value: CustomerChatWindowPosition) => void;
} = {}) {
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
    reactToMessage,
    searchMessages,
    ensureMessageLoaded,
  } = useCustomerChatThread({ chatVisible, enabled: true });
  const [localDraft, setLocalDraft] = useState("");
  const draft = controlledDraft ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;
  const [replyTo, setReplyTo] = useState<CustomerChatMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pendingNavigateId, setPendingNavigateId] = useState<string | null>(
    null,
  );
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const stickToBottomRef = useRef(true);
  const previousHeightRef = useRef(0);
  const pendingPrependRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
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
  const agentName = presentCustomerChatAgentName(payload?.agent);
  const agentInitials = presentCustomerChatAgentInitials(payload?.agent);
  const agentPhoto = payload?.agent?.photoUrl?.trim() || null;
  const listingBanner = formatCustomerChatListingBanner(listingContext);

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
    const sent = await send(draft, {
      replyToMessageId: replyTo?.id ?? null,
    });
    if (sent) {
      setDraft("");
      setReplyTo(null);
      stickToBottomRef.current = true;
      textareaRef.current?.focus();
    }
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = insertEmojiAtCursor({
      value: draft,
      emoji,
      selectionStart: start,
      selectionEnd: end,
    });
    setDraft(next.value);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        next.selectionStart,
        next.selectionEnd,
      );
    });
  }

  async function navigateToMessage(messageId: string) {
    setPendingNavigateId(messageId);
    const loaded = await ensureMessageLoaded(messageId);
    if (!loaded) {
      setPendingNavigateId(null);
    }
  }

  useEffect(() => {
    if (!pendingNavigateId) return;
    if (!payload?.messages.some((message) => message.id === pendingNavigateId)) {
      return;
    }
    stickToBottomRef.current = false;
    const messageId = pendingNavigateId;
    setPendingNavigateId(null);
    requestAnimationFrame(() => {
      const el = document.getElementById(`chat-msg-${messageId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(messageId);
      window.setTimeout(() => setHighlightId(null), 1600);
    });
  }, [pendingNavigateId, payload?.messages]);

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const action = customerChatComposerKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
    });
    if (action !== "send") return;
    event.preventDefault();
    void submit();
  }

  function onHeaderPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (chrome !== "floating" || !position || !onPositionChange) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    setDragging(true);
  }

  function onHeaderPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !onPositionChange) return;
    onPositionChange(
      clampCustomerChatWindowPosition(
        {
          x: drag.originX + (event.clientX - drag.startX),
          y: drag.originY + (event.clientY - drag.startY),
        },
        { width: window.innerWidth, height: window.innerHeight },
        CUSTOMER_CHAT_FLOATING_SIZE,
      ),
    );
  }

  function onHeaderPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  const remaining = CUSTOMER_CHAT_TEXT_MAX_LENGTH - draft.length;
  const verificationRequired = sendError?.kind === "verification";
  const floatingChrome = chrome === "floating" || chrome === "mobile-sheet";

  return (
    <section
      ref={rootRef}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        chrome === "page" &&
          "bg-surface -mx-4 -mt-10 -mb-[calc(2.5rem+var(--mobile-bottom-nav,0px))] h-[calc(100dvh-5.75rem-env(safe-area-inset-top,0px)-var(--mobile-bottom-nav,0px))] pb-[var(--customer-chat-keyboard,0px)] md:mx-auto md:mt-0 md:mb-0 md:h-[min(42rem,calc(100dvh-9rem))] md:max-w-2xl md:rounded-2xl md:border md:border-line md:pb-0",
        chrome === "floating" && "h-full bg-transparent",
        chrome === "mobile-sheet" &&
          "h-full bg-transparent pb-[calc(var(--customer-chat-keyboard,0px)+env(safe-area-inset-bottom,0px))]",
      )}
    >
      {hideOuterHeader && chrome === "floating" ? null : (
        <header
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          className={cn(
            "shrink-0 border-b border-canopy/10 px-4 py-3 sm:px-5",
            floatingChrome &&
              "bg-gradient-to-r from-[#f3fbf7] via-white to-[#eef8f3]",
            chrome === "floating" &&
              position &&
              onPositionChange &&
              (dragging ? "cursor-grabbing" : "cursor-grab"),
          )}
        >
          <div className="flex items-start gap-3">
            {chrome === "mobile-sheet" && onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close chat"
                className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink/70 hover:bg-mist"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
            ) : null}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <AgentAvatar
                name={agentName}
                initials={agentInitials}
                photoUrl={agentPhoto}
              />
              <div className="min-w-0">
                {chrome === "page" ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
                      Chat
                    </p>
                    <h1 className="truncate font-display text-xl text-ink sm:text-2xl">
                      Chat with your agent
                    </h1>
                    <p className="mt-0.5 truncate text-sm text-ink/55">
                      {agentName}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="truncate font-display text-lg text-ink">
                      {agentName}
                    </h2>
                    <p className="truncate text-xs text-ink/50">
                      HouzzatPRO Chat
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ChatConversationSearch
                onSearch={searchMessages}
                onSelect={(messageId) => {
                  void navigateToMessage(messageId);
                }}
              />
              {chrome === "floating" ? (
                <>
                  {onMinimize ? (
                    <button
                      type="button"
                      onClick={onMinimize}
                      aria-label="Minimize chat"
                      className="inline-flex size-8 items-center justify-center rounded-lg text-ink/55 hover:bg-mist hover:text-ink"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                  ) : null}
                  {onClose ? (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close chat"
                      className="inline-flex size-8 items-center justify-center rounded-lg text-ink/55 hover:bg-mist hover:text-ink"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </header>
      )}

      {listingBanner ? (
        <div className="shrink-0 border-b border-canopy/10 bg-[#f3fbf7] px-4 py-2 text-[12px] font-medium text-canopy-deep">
          <p className="truncate" title={listingBanner}>
            About {listingBanner}
          </p>
        </div>
      ) : null}

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
                      highlighted={highlightId === row.message.id}
                      peerLastReadAt={payload?.read.agentLastReadAt ?? null}
                      onReply={() => setReplyTo(row.message)}
                      onReact={(key) => {
                        void reactToMessage(row.message.id, key);
                      }}
                      onNavigateQuote={(messageId) => {
                        void navigateToMessage(messageId);
                      }}
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
        <div
          className={cn(
            "shrink-0 border-t border-canopy/10 px-3 py-2.5 sm:px-4",
            floatingChrome ? "bg-white/90 backdrop-blur-sm" : "bg-mist/50",
          )}
        >
          <div className="space-y-1.5">
            {replyTo ? (
              <ChatQuotedPreview
                quote={{
                  id: replyTo.id,
                  senderName: replyTo.senderName || "Message",
                  body: replyTo.body,
                  deleted: Boolean(replyTo.deletedAt),
                }}
                onCancel={() => setReplyTo(null)}
                onNavigate={() => {
                  void navigateToMessage(replyTo.id);
                }}
              />
            ) : null}
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
              <div className="flex min-w-0 items-center gap-2">
                <ChatEmojiPicker
                  disabled={sending || !canSend}
                  onPick={insertEmoji}
                />
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
              </div>
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

function AgentAvatar({
  name,
  initials,
  photoUrl,
}: {
  name: string;
  initials: string;
  photoUrl: string | null;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- workspace branding CDN URLs vary by tenant
      <img
        src={photoUrl}
        alt={name}
        className="size-10 shrink-0 rounded-full object-cover ring-2 ring-canopy/15"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-canopy text-[12px] font-bold text-white shadow-sm"
    >
      {initials}
    </span>
  );
}

function CustomerChatRow({
  message,
  grouped,
  highlighted = false,
  peerLastReadAt,
  onReply,
  onReact,
  onNavigateQuote,
}: {
  message: CustomerChatMessage;
  grouped: boolean;
  highlighted?: boolean;
  peerLastReadAt: string | null;
  onReply: () => void;
  onReact: (key: string) => void;
  onNavigateQuote: (messageId: string) => void;
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
  const sms = message.channel === "SMS";
  const automationBadge = customerSmsAutomationBadge(message.payload);
  const label = mine ? "You" : message.senderName || "Your Agent";
  const body = customerChatMessageBody(message);
  const deleted = Boolean(message.deletedAt);
  const sentAt = new Date(message.createdAt).toLocaleString("en-CA");

  return (
    <div
      id={`chat-msg-${message.id}`}
      className={cn(
        "flex min-w-0 rounded-xl transition",
        highlighted ? "bg-canopy/5 ring-1 ring-canopy/20" : null,
        mine ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn("min-w-0 max-w-[min(85%,28rem)]", mine ? "items-end" : "items-start")}
        aria-label={`${label}, ${sentAt}${sms ? ", SMS" : ""}${
          automationBadge ? `, ${automationBadge}` : ""
        }${deleted ? ", deleted" : ""}`}
      >
        {grouped ? (
          <p
            className={cn(
              "mb-0.5 text-[10px] font-medium text-ink/40",
              mine ? "text-right" : "text-left",
            )}
          >
            {sms ? <span className="mr-1 font-semibold">SMS</span> : null}
            {automationBadge ? (
              <span className="mr-1 font-semibold">{automationBadge}</span>
            ) : null}
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
            {sms ? (
              <span className="ml-1.5 rounded bg-mist px-1 py-px text-[9px] font-bold uppercase tracking-wide text-ink/55">
                SMS
              </span>
            ) : null}
            {automationBadge ? (
              <span className="ml-1.5 rounded bg-mist px-1 py-px text-[9px] font-semibold tracking-wide text-ink/55">
                {automationBadge}
              </span>
            ) : null}
            <span className="ml-1.5 font-medium text-ink/40">{sentAt}</span>
          </p>
        )}
        {message.replyTo ? (
          <div className="mb-1">
            <ChatQuotedPreview
              quote={message.replyTo}
              compact
              onNavigate={() => onNavigateQuote(message.replyTo!.id)}
            />
          </div>
        ) : null}
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-5 shadow-sm",
            deleted
              ? "bg-mist italic text-ink/55 ring-1 ring-line"
              : mine
                ? "bg-canopy text-white"
                : "bg-white text-ink ring-1 ring-canopy/10",
          )}
        >
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {body}
          </p>
        </div>
        <ChatReceiptLabel
          isOwnMessage={mine}
          messageCreatedAt={message.createdAt}
          deliveredAt={message.deliveredAt}
          peerLastReadAt={peerLastReadAt}
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={onReply}
            className="text-[11px] font-semibold text-ink/45 hover:text-canopy-deep"
          >
            Reply
          </button>
        </div>
        <ChatReactionBar
          reactions={message.reactions ?? []}
          onToggle={onReact}
        />
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
