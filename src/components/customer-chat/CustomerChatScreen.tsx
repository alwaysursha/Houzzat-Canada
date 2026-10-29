"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowLeft, Minus, Send, X } from "lucide-react";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { AccountVerifyEmailAction } from "@/components/account/AccountVerifyEmailAction";
import { ChatConversationSearch } from "@/components/chat/ChatConversationSearch";
import { ChatEmojiPicker } from "@/components/chat/ChatEmojiPicker";
import {
  ChatListingShareCard,
  resolveChatListingShareView,
} from "@/components/chat/ChatListingShareCard";
import { ChatAgentAvatar } from "@/components/chat/ChatAgentAvatar";
import { ChatBubbleBodyWithMeta, ChatBubbleMeta } from "@/components/chat/ChatBubbleMeta";
import { ChatMessageLinkCard } from "@/components/chat/ChatComposerLinkPreview";
import {
  ChatComposerListingPreview,
  ChatMessageListingUrlCard,
  useChatComposerListingPreview,
} from "@/components/chat/ChatListingUrlPreview";
import { ChatLinkifiedText } from "@/components/chat/ChatLinkifiedText";
import { ChatMessageActions } from "@/components/chat/ChatMessageActions";
import {
  ChatQuotedPreview,
  ChatReactionBar,
} from "@/components/chat/ChatMessageExtras";
import {
  ChatDateSeparator,
  ChatStickyDateLabel,
} from "@/components/chat/ChatTranscriptDates";
import { ChatTypingIndicator } from "@/components/chat/ChatTypingIndicator";
import { ChatVoicePlayer } from "@/components/chat/ChatVoicePlayer";
import { ChatVoiceRecorder } from "@/components/chat/ChatVoiceRecorder";
import { useChatTypingPublisher } from "@/components/chat/useChatTypingPublisher";
import { useCustomerChatThread } from "@/components/customer-chat/useCustomerChatThread";
import {
  chatMessageDayKey,
  shouldShowChatDaySeparator,
} from "@/lib/chat/chat-date";
import { insertEmojiAtCursor } from "@/lib/chat/emoji-catalog";
import { buildComposerLinkPreview } from "@/lib/chat/link-preview";
import {
  extractChatListingMls,
  isListingUrlOnlyBody,
} from "@/lib/chat/listing-url-preview";
import { chatComposerTrailingAction } from "@/lib/chat/composer-ui";
import {
  customerChatTypingRoute,
  peerTypingFromPayload,
  postTypingActive,
} from "@/lib/chat/typing/client";
import {
  customerChatVoiceAudioRoute,
  messageVoiceNoteAttachment,
} from "@/lib/chat/voice-notes/client-upload";
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
  customerChatAgentAvailabilityLabel,
  formatCustomerChatListingBanner,
  presentCustomerChatAgentAvailability,
  presentCustomerChatAgentInitials,
  presentCustomerChatAgentName,
  type CustomerChatAgentAvailability,
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
    sendVoiceNote,
    reactToMessage,
    searchMessages,
    ensureMessageLoaded,
  } = useCustomerChatThread({ chatVisible, enabled: true });
  const brandName = useTenantDisplayName("Houzzat");
  const [localDraft, setLocalDraft] = useState("");
  const draft = controlledDraft ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;
  const [replyTo, setReplyTo] = useState<CustomerChatMessage | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [linkPreviewDismissedHref, setLinkPreviewDismissedHref] = useState<
    string | null
  >(null);
  const listingComposerPreview = useChatComposerListingPreview({
    draft,
    dismissedHref: linkPreviewDismissedHref,
    enabled: true,
  });
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pendingNavigateId, setPendingNavigateId] = useState<string | null>(
    null,
  );
  const conversationId = payload?.conversation?.id ?? null;
  const blocked = Boolean(payload?.blocked) || sendError?.kind === "blocked";
  const canSend = Boolean(payload?.canSend) && !blocked && !loadError;
  const peerTyping = peerTypingFromPayload(payload?.peerTyping);
  const typingEnabled =
    chatVisible && canSend && !voiceBusy && Boolean(conversationId);
  const publishTyping = useCallback(
    (active: boolean) =>
      postTypingActive(customerChatTypingRoute(), active, {
        keepalive: !active,
      }),
    [],
  );
  const { signalTyping, clearTyping } = useChatTypingPublisher({
    enabled: typingEnabled,
    scopeKey: conversationId,
    publish: publishTyping,
  });
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
  const agentName = presentCustomerChatAgentName(payload?.agent, brandName);
  const agentInitials = presentCustomerChatAgentInitials(payload?.agent);
  const agentPhoto = payload?.agent?.photoUrl?.trim() || null;
  const agentAvailability = presentCustomerChatAgentAvailability(
    payload?.agentAvailability,
  );
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
      clearTyping();
      setDraft("");
      setReplyTo(null);
      setLinkPreviewDismissedHref(null);
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
    signalTyping();
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

  // Push / notification "Reply" deep link focuses the composer (no fake inline reply UI).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("compose") !== "1") return;
    if (!canSend || loading) return;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [canSend, loading, chrome]);

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
              "border-b border-[#d7e8df] bg-white",
            chrome === "mobile-sheet" &&
              "bg-white text-[#12241c]",
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
                className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#d7e8df] bg-white text-[#12241c] hover:bg-[#eef8f3]"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
            ) : null}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <ChatAgentAvatar
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
                    <h1 className="truncate font-display text-[1.25rem] text-[#12241c] sm:text-2xl">
                      {agentName}
                    </h1>
                    <AgentAvailabilityLine availability={agentAvailability} />
                  </>
                ) : (
                  <>
                    <h2 className="truncate text-[17px] font-semibold tracking-tight text-[#12241c] sm:text-lg">
                      {agentName}
                    </h2>
                    <AgentAvailabilityLine availability={agentAvailability} />
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
                      className="inline-flex size-9 items-center justify-center rounded-lg text-[#1a2e24] hover:bg-[#eef8f3]"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                  ) : null}
                  {onClose ? (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close chat"
                      className="inline-flex size-9 items-center justify-center rounded-lg text-[#1a2e24] hover:bg-[#eef8f3]"
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

      <div className="relative min-h-0 flex-1">
        <ChatStickyDateLabel scrollerRef={scrollerRef} />
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat transcript"
        aria-live="polite"
        className="h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-[#f4faf7] px-3 py-3 sm:px-4"
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
              <ol className="space-y-2.5">
                {rows.map((row, index) => {
                  const previous = rows[index - 1]?.message ?? null;
                  const showDay = shouldShowChatDaySeparator({
                    previousCreatedAt: previous?.createdAt,
                    currentCreatedAt: row.message.createdAt,
                  });
                  const dayKey = chatMessageDayKey(row.message.createdAt);
                  return (
                  <li key={row.message.id}>
                    {showDay ? (
                      <ChatDateSeparator
                        createdAt={row.message.createdAt}
                        dayKey={dayKey}
                      />
                    ) : null}
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
                      onReply={() => {
                        setReplyTo(row.message);
                        requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                      onReact={(key) => {
                        void reactToMessage(row.message.id, key);
                      }}
                      onNavigateQuote={(messageId) => {
                        void navigateToMessage(messageId);
                      }}
                    />
                  </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>
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
            <ChatComposerListingPreview
              state={listingComposerPreview}
              onDismiss={(href) => setLinkPreviewDismissedHref(href)}
            />
            <ChatTypingIndicator
              visible={peerTyping}
              label={`${agentName.split(" ")[0] || "Agent"} is typing…`}
              tone="customer"
            />
            {micError && !voiceBusy ? (
              <p
                className="rounded-lg border border-signal/25 bg-white px-2.5 py-1.5 text-[11px] leading-snug text-signal"
                role="alert"
              >
                {micError}
              </p>
            ) : null}
            {/* Single ChatVoiceRecorder instance — remounting on voiceBusy caused a second mic tap. */}
            <div
              className={cn(
                "flex gap-1.5",
                voiceBusy
                  ? "w-full"
                  : "items-end rounded-[1.35rem] border border-[#d7e8df] bg-white px-2 py-1 shadow-sm",
              )}
            >
              {!voiceBusy ? (
                <>
                  <ChatEmojiPicker
                    disabled={sending || !canSend}
                    onPick={insertEmoji}
                  />
                  <label className="sr-only" htmlFor={COMPOSER_ID}>
                    Message to {agentName}
                  </label>
                  <textarea
                    id={COMPOSER_ID}
                    ref={textareaRef}
                    value={draft}
                    maxLength={CUSTOMER_CHAT_TEXT_MAX_LENGTH}
                    onChange={(event) => {
                      const next = event.target.value;
                      setDraft(next);
                      if (linkPreviewDismissedHref) {
                        const preview = buildComposerLinkPreview(next);
                        if (
                          !preview ||
                          preview.href !== linkPreviewDismissedHref
                        ) {
                          setLinkPreviewDismissedHref(null);
                        }
                      }
                      signalTyping();
                    }}
                    onKeyDown={onComposerKeyDown}
                    rows={1}
                    disabled={sending || !canSend}
                    enterKeyHint="send"
                    placeholder="Write a message…"
                    className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2.5 text-[16px] leading-5 text-[#12241c] outline-none placeholder:truncate placeholder:whitespace-nowrap disabled:opacity-60"
                  />
                  {chatComposerTrailingAction({ body: draft, voiceBusy }) ===
                  "send" ? (
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
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0f6b4c] text-white shadow-sm hover:bg-[#0c5740] disabled:opacity-50"
                    >
                      {sending ? (
                        <span className="text-[10px] font-bold">…</span>
                      ) : (
                        <Send className="size-4" aria-hidden />
                      )}
                    </button>
                  ) : null}
                </>
              ) : null}
              {canSend &&
              (voiceBusy ||
                chatComposerTrailingAction({ body: draft, voiceBusy }) ===
                  "mic") ? (
                <div className={cn(voiceBusy ? "min-w-0 w-full" : "shrink-0")}>
                  <ChatVoiceRecorder
                    disabled={sending || !canSend}
                    sending={sending}
                    tone="customer"
                    onErrorChange={setMicError}
                    onPhaseChange={(phase) => {
                      const busy = phase !== "idle";
                      setVoiceBusy(busy);
                      if (busy) {
                        clearTyping();
                        setMicError(null);
                      }
                    }}
                    onSend={async (voiceDraft) => {
                      const ok = await sendVoiceNote({
                        blob: voiceDraft.blob,
                        mimeType: voiceDraft.mimeType,
                        durationMs: voiceDraft.durationMs,
                        replyToMessageId: replyTo?.id ?? null,
                      });
                      if (ok) {
                        clearTyping();
                        setReplyTo(null);
                        setMicError(null);
                      }
                      return ok;
                    }}
                  />
                </div>
              ) : null}
            </div>
            {remaining <= 200 && !voiceBusy ? (
              <p className="text-[12px] text-[#7a9a8b]">{remaining} left</p>
            ) : null}
            {sendError ? (
              <div className="space-y-2" role="alert">
                <p className="text-[13px] font-medium text-signal">
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

function AgentAvailabilityLine({
  availability,
}: {
  availability: CustomerChatAgentAvailability;
}) {
  const label = customerChatAgentAvailabilityLabel(availability);
  return (
    <p
      className="mt-0.5 flex h-4 items-center gap-1.5 text-xs text-ink/50"
      role="status"
      aria-label={label}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          availability === "online" && "bg-emerald-500",
          availability === "away" && "bg-amber-500",
          availability === "offline" && "bg-ink/30",
        )}
        aria-hidden
      />
      <span className="truncate font-medium">{label}</span>
    </p>
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
  const brandName = useTenantDisplayName("Houzzat");
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
  const label = mine
    ? "You"
    : message.senderName?.trim() || presentCustomerChatAgentName(null, brandName);
  const body = customerChatMessageBody(message);
  const deleted = Boolean(message.deletedAt);
  const voice = deleted
    ? null
    : messageVoiceNoteAttachment(message.attachments);
  const listingShare =
    !deleted && !voice && message.kind === "TEXT" && message.channel === "CHAT"
      ? resolveChatListingShareView(message.payload)
      : { kind: "none" as const };
  const listingUrl =
    !deleted && !voice && listingShare.kind === "none"
      ? extractChatListingMls(body)
      : null;
  const linkPreview =
    !deleted && !voice && listingShare.kind === "none" && !listingUrl
      ? buildComposerLinkPreview(body)
      : null;
  const hideUrlBody = Boolean(listingUrl && isListingUrlOnlyBody(body));
  const sentAt = new Date(message.createdAt).toLocaleString("en-CA");
  const tone = mine ? ("outgoing" as const) : ("incoming" as const);

  const bubble = (
    <>
      {!grouped ? (
        <p
          className={cn(
            "mb-0.5 text-[13px] font-semibold",
            mine ? "text-right text-[#0c5740]" : "text-[#1a2e24]",
          )}
        >
          {label}
          {sms ? (
            <span className="ml-1.5 rounded bg-[#eef8f3] px-1 py-px text-[10px] font-bold uppercase tracking-wide text-[#3d6a57]">
              SMS
            </span>
          ) : null}
          {automationBadge ? (
            <span className="ml-1.5 rounded bg-[#eef8f3] px-1 py-px text-[10px] font-semibold tracking-wide text-[#3d6a57]">
              {automationBadge}
            </span>
          ) : null}
        </p>
      ) : sms || automationBadge ? (
        <p
          className={cn(
            "mb-0.5 text-[12px] font-medium text-[#5b7a6c]",
            mine ? "text-right" : "text-left",
          )}
        >
          {sms ? <span className="mr-1 font-semibold">SMS</span> : null}
          {automationBadge ? (
            <span className="mr-1 font-semibold">{automationBadge}</span>
          ) : null}
        </p>
      ) : null}
      {message.replyTo ? (
        <div className="mb-1">
          <ChatQuotedPreview
            quote={message.replyTo}
            compact
            onNavigate={() => onNavigateQuote(message.replyTo!.id)}
          />
        </div>
      ) : null}
      {voice ? (
        <div
          className={cn(
            "rounded-2xl px-2.5 py-2 shadow-sm",
            mine ? "bg-[#d8f3e7]" : "bg-white ring-1 ring-[#d7e8df]",
          )}
        >
          <ChatVoicePlayer
            src={customerChatVoiceAudioRoute(message.id, voice.id)}
            durationMs={voice.durationMs}
            tone={tone}
          />
          <div className="mt-1 flex justify-end">
            <ChatBubbleMeta
              createdAt={message.createdAt}
              isOwnMessage={mine}
              deliveredAt={message.deliveredAt}
              peerLastReadAt={peerLastReadAt}
              tone={tone}
            />
          </div>
        </div>
      ) : listingShare.kind !== "none" ? (
        <div>
          <ChatListingShareCard payload={message.payload} />
          <div className="mt-1 flex justify-end px-1">
            <ChatBubbleMeta
              createdAt={message.createdAt}
              isOwnMessage={mine}
              deliveredAt={message.deliveredAt}
              peerLastReadAt={peerLastReadAt}
              tone={tone}
            />
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "rounded-2xl px-3.5 pb-1.5 pt-2 shadow-sm",
            deleted
              ? "bg-[#eef8f3] italic text-[#5b7a6c] ring-1 ring-[#d7e8df]"
              : mine
                ? "bg-[#d8f3e7] text-[#12241c]"
                : "bg-white text-[#12241c] ring-1 ring-[#d7e8df]",
          )}
        >
          {listingUrl ? <ChatMessageListingUrlCard body={body} /> : null}
          {linkPreview ? <ChatMessageLinkCard preview={linkPreview} /> : null}
          {hideUrlBody ? (
            <div className="mt-1 flex items-end justify-end">
              <ChatBubbleMeta
                createdAt={message.createdAt}
                isOwnMessage={mine}
                deliveredAt={message.deliveredAt}
                peerLastReadAt={peerLastReadAt}
                tone={tone}
              />
            </div>
          ) : (
            <ChatBubbleBodyWithMeta
              createdAt={message.createdAt}
              isOwnMessage={mine}
              deliveredAt={message.deliveredAt}
              peerLastReadAt={peerLastReadAt}
              tone={tone}
            >
              <ChatLinkifiedText text={body} />
            </ChatBubbleBodyWithMeta>
          )}
        </div>
      )}
      <ChatReactionBar
        reactions={message.reactions ?? []}
        onToggle={onReact}
      />
    </>
  );

  return (
    <div
      id={`chat-msg-${message.id}`}
      className={cn(
        "flex min-w-0 rounded-xl transition",
        highlighted ? "bg-[#e7f6ef] ring-1 ring-[#0f6b4c]/20" : null,
        mine ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "min-w-0 max-w-[min(88%,32rem)]",
          mine ? "items-end" : "items-start",
        )}
        aria-label={`${label}, ${sentAt}${sms ? ", SMS" : ""}${
          automationBadge ? `, ${automationBadge}` : ""
        }${deleted ? ", deleted" : ""}`}
      >
        {!deleted && !sms ? (
          <ChatMessageActions
            align={mine ? "end" : "start"}
            canReply
            canReact
            onReply={onReply}
            onReact={onReact}
          >
            {bubble}
          </ChatMessageActions>
        ) : (
          bubble
        )}
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
