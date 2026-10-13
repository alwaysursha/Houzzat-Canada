"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Send } from "lucide-react";
import {
  V2_CHAT_TEXT_MAX_LENGTH,
  composerSendButtonLabel,
  composerSendPayload,
  latestInboundCustomerComposerChannel,
  nextAgentComposerChannelState,
  selectAgentComposerChannel,
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
  v2SmsAutomationBadge,
  type AgentComposerChannel,
} from "@/lib/agent/lead-profile-v2/chat-query";
import type {
  LeadProfileV2ChatMessage,
  LeadProfileV2ChatPanel,
} from "@/lib/agent/lead-profile-v2/types";
import { ChatConversationSearch } from "@/components/chat/ChatConversationSearch";
import { ChatEmojiPicker } from "@/components/chat/ChatEmojiPicker";
import {
  ChatListingShareCard,
  resolveChatListingShareView,
} from "@/components/chat/ChatListingShareCard";
import { ChatListingSharePicker } from "@/components/chat/ChatListingSharePicker";
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
import { ChatQuickReplyPicker } from "@/components/chat/ChatQuickReplyPicker";
import {
  ChatDateSeparator,
  ChatStickyDateLabel,
} from "@/components/chat/ChatTranscriptDates";
import { ChatTypingIndicator } from "@/components/chat/ChatTypingIndicator";
import { ChatVoicePlayer } from "@/components/chat/ChatVoicePlayer";
import { ChatVoiceRecorder } from "@/components/chat/ChatVoiceRecorder";
import { useChatTypingPublisher } from "@/components/chat/useChatTypingPublisher";
import {
  chatMessageDayKey,
  shouldShowChatDaySeparator,
} from "@/lib/chat/chat-date";
import { chatComposerTrailingAction } from "@/lib/chat/composer-ui";
import { insertEmojiAtCursor } from "@/lib/chat/emoji-catalog";
import { buildComposerLinkPreview } from "@/lib/chat/link-preview";
import {
  extractChatListingMls,
  isListingUrlOnlyBody,
} from "@/lib/chat/listing-url-preview";
import {
  newListingShareIdempotencyKey,
  postAgentListingShare,
} from "@/lib/chat/listing-share/client";
import type { ChatQuotedMessage } from "@/lib/chat/message-reply";
import { insertQuickReplyAtCursor } from "@/lib/chat/quick-replies/client";
import {
  agentChatTypingRoute,
  peerTypingFromPayload,
  postTypingActive,
} from "@/lib/chat/typing/client";
import {
  agentChatVoiceAudioRoute,
  messageVoiceNoteAttachment,
} from "@/lib/chat/voice-notes/client-upload";
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
  onSendVoice,
  onSendListingShare,
  onReact,
  onSearch,
  onEnsureMessage,
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
  onSend: (
    body: string,
    channel?: "CHAT" | "SMS",
    options?: { replyToMessageId?: string | null },
  ) => Promise<boolean>;
  onSendVoice?: (input: {
    blob: Blob;
    mimeType: string;
    durationMs: number;
    replyToMessageId?: string | null;
  }) => Promise<boolean>;
  onSendListingShare?: (message: LeadProfileV2ChatMessage) => Promise<boolean>;
  onReact?: (messageId: string, key: string) => Promise<boolean>;
  onSearch?: (
    query: string,
    cursor?: string | null,
  ) => Promise<{
    hits: Array<{
      id: string;
      body: string;
      senderName: string;
      createdAt: string;
    }>;
    page: { hasMore: boolean; nextCursor: string | null };
  }>;
  onEnsureMessage?: (messageId: string) => Promise<boolean>;
  composerId?: string;
  frame?: "card" | "plain";
}) {
  const [draft, setDraft] = useState("");
  const [channel, setChannel] = useState<"CHAT" | "SMS">("CHAT");
  const [manualChannel, setManualChannel] =
    useState<AgentComposerChannel | null>(null);
  const [appliedInboundId, setAppliedInboundId] = useState<string | null>(null);
  const [composerLeadId, setComposerLeadId] = useState(
    panel?.conversation.leadId ?? null,
  );
  const [replyTo, setReplyTo] = useState<ChatQuotedMessage | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
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
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);
  const previousHeightRef = useRef(0);
  const pendingPrependRef = useRef(false);
  const firstMessageId = panel?.messages[0]?.id ?? null;
  const lastMessageId = panel?.messages[panel.messages.length - 1]?.id ?? null;
  const leadId = panel?.conversation.leadId ?? null;
  const conversationId = panel?.conversation.id ?? null;
  const peerTyping = peerTypingFromPayload(panel?.peerTyping);
  const inbound = latestInboundCustomerComposerChannel(panel?.messages ?? []);
  const nextComposer = nextAgentComposerChannelState({
    leadId,
    prevLeadId: composerLeadId,
    inboundId: inbound?.id ?? null,
    inboundChannel: inbound?.channel ?? null,
    appliedInboundId,
    manualChannel,
    channel,
  });
  if (
    nextComposer.leadId !== composerLeadId ||
    nextComposer.channel !== channel ||
    nextComposer.manualChannel !== manualChannel ||
    nextComposer.appliedInboundId !== appliedInboundId
  ) {
    setComposerLeadId(nextComposer.leadId);
    setChannel(nextComposer.channel);
    setManualChannel(nextComposer.manualChannel);
    setAppliedInboundId(nextComposer.appliedInboundId);
    if (nextComposer.resetDraft) {
      setDraft("");
      setReplyTo(null);
    }
  }
  const displayedChannel = nextComposer.channel;
  const composerMode = v2ChatComposerMode({
    loading,
    error,
    canMarkRead: Boolean(panel?.viewer.canMarkRead),
  });
  const canSend = composerMode === "composer";
  const smsEnabled = Boolean(panel?.smsSend?.enabled);
  const smsBlockedReason = v2SmsBlockedCopy(panel?.smsSend?.reason);
  const smsSelected = displayedChannel === "SMS";
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
  const peerLastReadAt = panel?.conversation.customerLastReadAt ?? null;
  const typingEnabled =
    canSend &&
    !smsSelected &&
    !voiceBusy &&
    Boolean(leadId) &&
    Boolean(conversationId);
  const publishTyping = useCallback(
    (active: boolean) => {
      if (!leadId) return Promise.resolve(false);
      return postTypingActive(agentChatTypingRoute(leadId), active, {
        keepalive: !active,
      });
    },
    [leadId],
  );
  const { signalTyping, clearTyping } = useChatTypingPublisher({
    enabled: typingEnabled,
    scopeKey: conversationId,
    publish: publishTyping,
  });

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

  function selectDisplayedChannel(next: AgentComposerChannel) {
    const selected = selectAgentComposerChannel(next);
    setChannel(selected.channel);
    setManualChannel(selected.manualChannel);
    if (next === "SMS") setReplyTo(null);
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
    if (!smsSelected) signalTyping();
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        next.selectionStart,
        next.selectionEnd,
      );
    });
  }

  /** Insert quick-reply body at caret. Never sends. Preserves replyTo. */
  function insertQuickReply(body: string): boolean {
    if (smsSelected) return false;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = insertQuickReplyAtCursor({
      value: draft,
      text: body,
      selectionStart: start,
      selectionEnd: end,
      maxLength: V2_CHAT_TEXT_MAX_LENGTH,
    });
    if (!next.ok) return false;
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
    return true;
  }

  async function navigateToMessage(messageId: string) {
    setPendingNavigateId(messageId);
    if (panel?.messages.some((message) => message.id === messageId)) return;
    if (!onEnsureMessage) {
      setPendingNavigateId(null);
      return;
    }
    const loaded = await onEnsureMessage(messageId);
    if (!loaded) setPendingNavigateId(null);
  }

  useEffect(() => {
    if (!pendingNavigateId) return;
    if (!panel?.messages.some((message) => message.id === pendingNavigateId)) {
      return;
    }
    stickToBottomRef.current = false;
    const messageId = pendingNavigateId;
    setPendingNavigateId(null);
    requestAnimationFrame(() => {
      const el = document.getElementById(`agent-chat-msg-${messageId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(messageId);
      window.setTimeout(() => setHighlightId(null), 1600);
    });
  }, [pendingNavigateId, panel?.messages]);

  async function submit() {
    // Paste-only Houzzat listing URL → LISTING_SHARE (no duplicate TEXT+card).
    if (
      !smsSelected &&
      leadId &&
      onSendListingShare &&
      listingComposerPreview.status === "ready" &&
      listingComposerPreview.shareable &&
      listingComposerPreview.href !== linkPreviewDismissedHref &&
      isListingUrlOnlyBody(draft)
    ) {
      if (sending || !canSend) return;
      const result = await postAgentListingShare(leadId, {
        listingId: listingComposerPreview.listingId,
        idempotencyKey: newListingShareIdempotencyKey(),
      });
      if (!result.ok) return;
      const ok = await onSendListingShare(
        result.message as LeadProfileV2ChatMessage,
      );
      if (ok) {
        clearTyping();
        setDraft("");
        setReplyTo(null);
        setLinkPreviewDismissedHref(null);
        stickToBottomRef.current = true;
        textareaRef.current?.focus();
      }
      return;
    }

    if (
      !v2ChatComposerCanSubmit({
        body: draft,
        pending: sending,
        canSend,
        channel: displayedChannel,
        smsEnabled,
      })
    ) {
      return;
    }
    const payload = composerSendPayload(
      draft,
      displayedChannel,
      displayedChannel === "CHAT" ? replyTo?.id ?? null : null,
    );
    const sent = await onSend(payload.body, payload.channel, {
      replyToMessageId: payload.replyToMessageId ?? null,
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
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f4faf7]",
        frame === "card" &&
          "min-h-[20rem] rounded-2xl border border-[#d7e8df] bg-white lg:min-h-0",
      )}
    >
      {onSearch ? (
        <div className="flex shrink-0 justify-end border-b border-[#d7e8df] bg-white/90 px-3 py-1.5 sm:px-4">
          <ChatConversationSearch
            onSearch={onSearch}
            onSelect={(messageId) => {
              void navigateToMessage(messageId);
            }}
          />
        </div>
      ) : null}
      <div
        className="relative min-h-0 flex-1"
      >
        <ChatStickyDateLabel scrollerRef={scrollerRef} />
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat transcript"
        className="h-full min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
      >
        {loading ? (
          <ChatSkeleton />
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-ink/65">Couldn’t load chat.</p>
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry loading chat"
              className="rounded-xl border border-[#d7e8df] bg-mist px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-canopy/40"
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
                  className="rounded-full border border-[#d7e8df] bg-white px-3 py-1 text-[11px] font-semibold text-[#3d6a57] hover:bg-[#eef8f3] disabled:opacity-60"
                >
                  {busy ? "Loading earlier messages…" : "Load earlier messages"}
                </button>
              </div>
            ) : null}
            {(panel?.messages.length ?? 0) === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-ink/55">
                {v2ChatEmptyCopy(canSend)}
              </p>
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
                  <li key={row.message.id} className="min-w-0">
                    {showDay ? (
                      <ChatDateSeparator
                        createdAt={row.message.createdAt}
                        dayKey={dayKey}
                      />
                    ) : null}
                    {row.showDivider ? (
                      <div className="my-3 flex items-center gap-2">
                        <span className="h-px flex-1 bg-[#d7e8df]" />
                        <span className="text-[12px] font-semibold uppercase tracking-wide text-[#3d6a57]">
                          New messages
                        </span>
                        <span className="h-px flex-1 bg-[#d7e8df]" />
                      </div>
                    ) : null}
                    <ChatRow
                      message={row.message}
                      grouped={row.grouped}
                      highlighted={highlightId === row.message.id}
                      viewerUserId={panel?.viewer.userId ?? null}
                      leadId={leadId}
                      peerLastReadAt={peerLastReadAt}
                      onReply={() => {
                        if (row.message.deletedAt) return;
                        setReplyTo({
                          id: row.message.id,
                          senderName: row.message.senderName,
                          body: row.message.body,
                          deleted: false,
                        });
                        textareaRef.current?.focus();
                      }}
                      onReact={(key) => {
                        if (!onReact) return;
                        void onReact(row.message.id, key);
                      }}
                      onNavigateQuote={(messageId) => {
                        void navigateToMessage(messageId);
                      }}
                      canReact={Boolean(onReact)}
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
      {composerMode === "hidden" ? null : (
        <div className="shrink-0 border-t border-canopy/10 bg-mist/50 px-3 py-2.5 sm:px-4">
          {canSend ? (
            <div className="space-y-1.5">
              <div
                role="tablist"
                aria-label="Message channel"
                className="inline-flex rounded-lg border border-[#d7e8df] bg-white p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!smsSelected}
                  onClick={() => selectDisplayedChannel("CHAT")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12px] font-semibold",
                    !smsSelected
                      ? "bg-[#0f6b4c] text-white shadow-sm ring-1 ring-[#0c5740]"
                      : "text-[#5b7a6c] hover:text-[#12241c]",
                  )}
                >
                  Chat
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={smsSelected}
                  disabled={voiceBusy}
                  onClick={() => selectDisplayedChannel("SMS")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50",
                    smsSelected
                      ? "bg-[#0f6b4c] text-white shadow-sm ring-1 ring-[#0c5740]"
                      : "text-[#5b7a6c] hover:text-[#12241c]",
                  )}
                >
                  SMS
                </button>
              </div>
              {smsSelected && (panel?.smsQuickTexts?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {panel?.smsQuickTexts?.map((quickText) => (
                    <button
                      type="button"
                      key={quickText.id}
                      onClick={() => setDraft(quickText.rendered)}
                      disabled={sending}
                      className="rounded-full border border-[#d7e8df] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#3d6a57] hover:bg-[#eef8f3] hover:text-[#12241c] disabled:opacity-50"
                    >
                      {quickText.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {replyTo && !smsSelected ? (
                <ChatQuotedPreview
                  quote={replyTo}
                  onCancel={() => setReplyTo(null)}
                />
              ) : null}
              {!smsSelected ? (
                <ChatComposerListingPreview
                  state={listingComposerPreview}
                  onDismiss={(href) => setLinkPreviewDismissedHref(href)}
                />
              ) : null}
              {!smsSelected ? (
                <ChatTypingIndicator
                  visible={peerTyping}
                  label="Customer is typing…"
                  tone="customer"
                />
              ) : null}
              {smsSelected && !smsEnabled ? (
                <p className="text-[13px] text-ink/55" role="status">
                  {smsBlockedReason ?? "SMS is unavailable."}
                </p>
              ) : null}
              {voiceBusy ? (
                !smsSelected && onSendVoice ? (
                  <ChatVoiceRecorder
                    disabled={sending || !canSend}
                    sending={sending}
                    tone="customer"
                    onPhaseChange={(phase) => {
                      const busy = phase !== "idle";
                      setVoiceBusy(busy);
                      if (busy) clearTyping();
                    }}
                    onSend={async (voiceDraft) => {
                      const ok = await onSendVoice({
                        blob: voiceDraft.blob,
                        mimeType: voiceDraft.mimeType,
                        durationMs: voiceDraft.durationMs,
                        replyToMessageId: replyTo?.id ?? null,
                      });
                      if (ok) {
                        clearTyping();
                        setReplyTo(null);
                      }
                      return ok;
                    }}
                  />
                ) : null
              ) : (
                <div className="flex items-end gap-1.5 rounded-[1.35rem] border border-[#d7e8df] bg-white px-2 py-1.5 shadow-sm">
                  <ChatEmojiPicker
                    onPick={insertEmoji}
                    disabled={sending || (smsSelected && !smsEnabled)}
                  />
                  {!smsSelected ? (
                    <ChatQuickReplyPicker
                      onInsert={insertQuickReply}
                      disabled={sending || !canSend}
                    />
                  ) : null}
                  {!smsSelected && leadId && onSendListingShare ? (
                    <ChatListingSharePicker
                      leadId={leadId}
                      disabled={sending || !canSend}
                      onShared={async (message) => {
                        const ok = await onSendListingShare(
                          message as LeadProfileV2ChatMessage,
                        );
                        if (ok) clearTyping();
                        return ok;
                      }}
                    />
                  ) : null}
                  <label className="sr-only" htmlFor={composerId}>
                    {smsSelected ? "SMS message" : "Chat message"}
                  </label>
                  <textarea
                    id={composerId}
                    ref={textareaRef}
                    value={draft}
                    maxLength={V2_CHAT_TEXT_MAX_LENGTH}
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
                      if (!smsSelected) signalTyping();
                    }}
                    onKeyDown={onComposerKeyDown}
                    rows={1}
                    disabled={sending || (smsSelected && !smsEnabled)}
                    placeholder={
                      smsSelected ? "Write an SMS…" : "Write a message…"
                    }
                    className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1.5 py-2.5 text-[16px] leading-5 text-[#12241c] outline-none placeholder:leading-5 disabled:opacity-60"
                  />
                  <div className="relative flex shrink-0 flex-col items-end justify-end self-end">
                    {chatComposerTrailingAction({
                      body: draft,
                      voiceBusy,
                    }) === "send" || smsSelected ? (
                      <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={
                          !v2ChatComposerCanSubmit({
                            body: draft,
                            pending: sending,
                            canSend,
                            channel: displayedChannel,
                            smsEnabled,
                          })
                        }
                        aria-label={
                          smsSelected
                            ? "Send SMS message"
                            : "Send Chat message"
                        }
                        className="inline-flex size-10 items-center justify-center rounded-full bg-[#0f6b4c] text-white shadow-sm hover:bg-[#0c5740] disabled:opacity-50"
                      >
                        {sending ? (
                          <span className="text-[10px] font-bold">…</span>
                        ) : (
                          <Send className="size-4" aria-hidden />
                        )}
                      </button>
                    ) : !smsSelected && onSendVoice ? (
                      <ChatVoiceRecorder
                        disabled={sending || !canSend}
                        sending={sending}
                        tone="customer"
                        onPhaseChange={(phase) => {
                          const busy = phase !== "idle";
                          setVoiceBusy(busy);
                          if (busy) clearTyping();
                        }}
                        onSend={async (voiceDraft) => {
                          const ok = await onSendVoice({
                            blob: voiceDraft.blob,
                            mimeType: voiceDraft.mimeType,
                            durationMs: voiceDraft.durationMs,
                            replyToMessageId: replyTo?.id ?? null,
                          });
                          if (ok) {
                            clearTyping();
                            setReplyTo(null);
                          }
                          return ok;
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={
                          !v2ChatComposerCanSubmit({
                            body: draft,
                            pending: sending,
                            canSend,
                            channel: displayedChannel,
                            smsEnabled,
                          })
                        }
                        aria-label={composerSendButtonLabel({
                          channel: displayedChannel,
                          sending,
                        })}
                        className="inline-flex size-10 items-center justify-center rounded-full bg-[#0f6b4c] text-white disabled:opacity-50"
                      >
                        <Send className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              )}
              {remaining <= 200 && !voiceBusy ? (
                <p className="text-[12px] text-ink/40">{remaining} left</p>
              ) : null}
              {sendError ? (
                <p
                  className="text-[13px] font-medium text-signal"
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
            <p className="text-[13px] text-ink/55">
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
  highlighted,
  viewerUserId,
  leadId,
  peerLastReadAt,
  onReply,
  onReact,
  onNavigateQuote,
  canReact,
}: {
  message: LeadProfileV2ChatMessage;
  grouped: boolean;
  highlighted: boolean;
  viewerUserId: string | null;
  leadId: string | null;
  peerLastReadAt: string | null;
  onReply: () => void;
  onReact: (key: string) => void;
  onNavigateQuote: (messageId: string) => void;
  canReact: boolean;
}) {
  if (message.kind === "SYSTEM_CARD") {
    return (
      <div className="flex justify-center py-1">
        <p className="rounded-full bg-mist px-3 py-1 text-[11px] font-semibold text-ink/55">
          {v2ChatSystemCardLabel(message.payload)}
        </p>
      </div>
    );
  }

  const automationBadge = v2SmsAutomationBadge(message.payload);
  const mine =
    message.senderKind === "AGENT" &&
    Boolean(viewerUserId) &&
    message.senderUserId === viewerUserId &&
    !automationBadge;
  const customer = message.senderKind === "CUSTOMER";
  const label = automationBadge
    ? message.senderKind === "AGENT" &&
      message.senderName &&
      message.senderName !== "Houzzat"
      ? `HouzzatPRO · ${message.senderName}`
      : "HouzzatPRO"
    : mine
      ? "You"
      : message.senderName;
  const body = v2ChatMessageBody(message);
  const deleted = Boolean(message.deletedAt);
  const voice =
    deleted || !leadId
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
  const sms = message.channel === "SMS";
  const delivery = v2SmsDeliveryLabel(message);
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
          {delivery ? (
            <span className="ml-1.5 font-medium text-[#5b7a6c]">{delivery}</span>
          ) : null}
        </p>
      ) : sms || automationBadge || delivery ? (
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
          {delivery ? <span>{delivery}</span> : null}
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
      {voice && leadId ? (
        <div
          className={cn(
            "rounded-2xl px-2.5 py-2 shadow-sm",
            mine
              ? "bg-[#d8f3e7]"
              : customer
                ? "bg-white ring-1 ring-[#d7e8df]"
                : "bg-white ring-1 ring-[#d7e8df]",
          )}
        >
          <ChatVoicePlayer
            src={agentChatVoiceAudioRoute(leadId, message.id, voice.id)}
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
                : customer
                  ? "bg-white text-[#12241c] ring-1 ring-[#d7e8df]"
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
      {canReact && !deleted ? (
        <ChatReactionBar
          reactions={message.reactions ?? []}
          onToggle={onReact}
        />
      ) : null}
    </>
  );

  return (
    <div
      id={`agent-chat-msg-${message.id}`}
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
        }${delivery ? `, ${delivery}` : ""}${deleted ? ", deleted" : ""}`}
      >
        {!deleted && !sms ? (
          <ChatMessageActions
            align={mine ? "end" : "start"}
            canReply
            canReact={canReact}
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
      <div className="h-10 w-2/3 rounded-2xl bg-[#e7f0eb]" />
      <div className="ml-auto h-10 w-1/2 rounded-2xl bg-[#d8f3e7]" />
      <div className="h-10 w-3/5 rounded-2xl bg-[#e7f0eb]" />
    </div>
  );
}
