"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchV2Json } from "@/lib/agent/lead-profile-v2/fetch-json";
import {
  appendV2ChatSentMessage,
  canApplyV2ChatResponse,
  clearV2ChatUnread,
  composerSendPayload,
  mergeV2ChatContext,
  mergeV2ChatMessages,
  shouldMarkV2ChatRead,
  shouldSkipDuplicateV2ChatOlder,
  shouldSkipV2ChatSubmit,
  V2_CHAT_GET_ROUTE,
  V2_CHAT_READ_ROUTE,
  V2_CHAT_RESOURCE_KEY,
  V2_CHAT_SEARCH_ROUTE,
  V2_CHAT_SEND_ROUTE,
  v2ChatContextUrl,
  v2ChatGetUrl,
  v2ChatOlderCursorKey,
  v2ChatReactionUrl,
  v2ChatReadUrl,
  v2ChatSearchUrl,
  v2ChatSendUrl,
} from "@/lib/agent/lead-profile-v2/chat-query";
import {
  agentChatVoiceNoteUploadRoute,
  buildVoiceNoteUploadFormData,
  newVoiceNoteUploadId,
} from "@/lib/chat/voice-notes/client-upload";
import {
  CONVERSATION_LIVE_POLL_MS,
  conversationLivePollShouldTick,
  conversationLiveVisible,
  mergeLiveConversationMessages,
} from "@/lib/conversations/conversation-live-poll";
import {
  isV2AbortError,
  type LeadProfileV2Session,
} from "@/lib/agent/lead-profile-v2/request-gate";
import type {
  LeadProfileV2ChatMessage,
  LeadProfileV2ChatPanel,
} from "@/lib/agent/lead-profile-v2/types";

type ChatFetchInput = {
  cursor?: string | null;
  prepend: boolean;
  live?: boolean;
};

export type UseAgentChatThreadListeners = {
  onSent?: (message: LeadProfileV2ChatMessage) => void;
  onRead?: () => void;
};

export function useAgentChatThread(
  session: LeadProfileV2Session,
  leadId: string,
  enabled: boolean,
  listeners?: UseAgentChatThreadListeners,
) {
  const [panel, setPanel] = useState<LeadProfileV2ChatPanel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState(leadId);

  const leadIdRef = useRef(leadId);
  const enabledRef = useRef(enabled);
  const epochRef = useRef(0);
  const loadedForLeadRef = useRef<string | null>(null);
  const lastOlderCursorKeyRef = useRef<string | null>(null);
  const markedReadForLeadRef = useRef<string | null>(null);
  const sendInFlightRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  if (leadId !== activeLeadId) {
    setActiveLeadId(leadId);
    setPanel(null);
    setError(false);
    setBusy(false);
    setSendError(null);
    setSending(false);
    markedReadForLeadRef.current = null;
  }

  const fetchPage = useCallback(
    (input: ChatFetchInput) => {
      const live = Boolean(input.live);
      const run = () => {
        const stamp = { leadId, epoch: epochRef.current };
        return async (id: string, signal: AbortSignal) => {
          const apply = () =>
            canApplyV2ChatResponse({
              stamp,
              current: { leadId: leadIdRef.current, epoch: epochRef.current },
            });
          if (!live) {
            setBusy(true);
            if (!input.prepend) setError(false);
          }
          try {
            const json = await fetchV2Json<LeadProfileV2ChatPanel>(
              v2ChatGetUrl(id, input.cursor),
              V2_CHAT_GET_ROUTE,
              signal,
            );
            if (!apply() || signal.aborted) return;
            loadedForLeadRef.current = id;
            setPanel((prev) => {
              if (live && prev) {
                return {
                  ...prev,
                  conversation: json.conversation,
                  unread: json.unread,
                  smsSend: json.smsSend,
                  viewer: json.viewer,
                  peerTyping: Boolean(json.peerTyping),
                  messages: mergeLiveConversationMessages(
                    prev.messages,
                    json.messages,
                  ),
                };
              }
              if (!input.prepend || !prev) return json;
              return {
                ...json,
                messages: mergeV2ChatMessages(
                  prev.messages,
                  json.messages,
                  "prepend",
                ),
                page: json.page,
              };
            });
          } catch (err) {
            if (isV2AbortError(err) || signal.aborted) return;
            if (!apply()) return;
            if (live || input.prepend) {
              lastOlderCursorKeyRef.current = input.prepend
                ? null
                : lastOlderCursorKeyRef.current;
              return;
            }
            setError(true);
          } finally {
            if (!live && apply()) setBusy(false);
          }
        };
      };

      if (live) {
        if (pollInFlightRef.current) return;
        const controller = new AbortController();
        pollAbortRef.current = controller;
        pollInFlightRef.current = true;
        void run()(leadId, controller.signal).finally(() => {
          if (pollAbortRef.current === controller) {
            pollInFlightRef.current = false;
          }
        });
        return;
      }

      if (input.prepend) {
        const cursorKey = v2ChatOlderCursorKey({
          leadId,
          cursor: input.cursor ?? null,
        });
        if (
          shouldSkipDuplicateV2ChatOlder({
            inFlight: session.inspect(V2_CHAT_RESOURCE_KEY).inFlight,
            lastCursorKey: lastOlderCursorKeyRef.current,
            cursorKey,
          })
        ) {
          return;
        }
        if (!session.requestIfIdle(V2_CHAT_RESOURCE_KEY, leadId, run())) {
          return;
        }
        lastOlderCursorKeyRef.current = cursorKey;
        return;
      }

      epochRef.current += 1;
      lastOlderCursorKeyRef.current = null;
      session.abort(V2_CHAT_RESOURCE_KEY);
      session.request(V2_CHAT_RESOURCE_KEY, leadId, run());
    },
    [leadId, session],
  );

  useEffect(() => {
    leadIdRef.current = leadId;
    enabledRef.current = enabled;
    if (loadedForLeadRef.current !== leadId) {
      loadedForLeadRef.current = null;
    }
    if (!enabled) {
      session.abort(V2_CHAT_RESOURCE_KEY);
      lastOlderCursorKeyRef.current = null;
      pollAbortRef.current?.abort();
      pollInFlightRef.current = false;
      return;
    }
    if (loadedForLeadRef.current === leadId) return;
    fetchPage({ prepend: false });
  }, [enabled, leadId, fetchPage, session]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (
        !conversationLivePollShouldTick({
          enabled: enabledRef.current,
          visible: conversationLiveVisible(document),
          inFlight: pollInFlightRef.current,
          hasLoaded: loadedForLeadRef.current === leadIdRef.current,
        })
      ) {
        return;
      }
      fetchPage({ prepend: false, live: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);
    const timer = window.setInterval(tick, CONVERSATION_LIVE_POLL_MS);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
      pollAbortRef.current?.abort();
      pollInFlightRef.current = false;
    };
  }, [enabled, leadId, fetchPage]);

  useEffect(() => {
    if (
      !shouldMarkV2ChatRead({
        chatVisible: enabled,
        canMarkRead: Boolean(panel?.viewer.canMarkRead),
      })
    ) {
      return;
    }
    if (!panel || markedReadForLeadRef.current === leadId) return;
    const id = leadId;
    markedReadForLeadRef.current = id;
    void (async () => {
      try {
        await fetchV2Json(
          v2ChatReadUrl(id),
          V2_CHAT_READ_ROUTE,
          undefined,
          { method: "POST" },
        );
        if (leadIdRef.current !== id) return;
        setPanel((prev) => (prev ? clearV2ChatUnread(prev) : prev));
        listenersRef.current?.onRead?.();
      } catch {
        if (leadIdRef.current === id) {
          markedReadForLeadRef.current = null;
        }
      }
    })();
  }, [enabled, leadId, panel]);

  const reload = useCallback(() => {
    loadedForLeadRef.current = null;
    markedReadForLeadRef.current = null;
    fetchPage({ prepend: false });
  }, [fetchPage]);

  const invalidate = useCallback(() => {
    epochRef.current += 1;
    loadedForLeadRef.current = null;
    lastOlderCursorKeyRef.current = null;
    markedReadForLeadRef.current = null;
    setPanel(null);
    setError(false);
    setBusy(false);
    setSendError(null);
    if (enabledRef.current) fetchPage({ prepend: false });
  }, [fetchPage]);

  const loadOlder = useCallback(() => {
    const cursor = panel?.page.nextCursor;
    if (!cursor) return;
    fetchPage({ cursor, prepend: true });
  }, [fetchPage, panel]);

  const send = useCallback(
    async (
      body: string,
      channel: "CHAT" | "SMS" = "CHAT",
      options?: { replyToMessageId?: string | null },
    ): Promise<boolean> => {
      if (
        shouldSkipV2ChatSubmit({
          body,
          inFlight: sendInFlightRef.current,
          canSend: Boolean(panel?.viewer.canMarkRead),
          channel,
          smsEnabled: Boolean(panel?.smsSend?.enabled),
        })
      ) {
        return false;
      }
      sendInFlightRef.current = true;
      setSending(true);
      setSendError(null);
      try {
        const json = await fetchV2Json<{ message: LeadProfileV2ChatMessage }>(
          v2ChatSendUrl(leadId),
          V2_CHAT_SEND_ROUTE,
          undefined,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              composerSendPayload(
                body,
                channel,
                channel === "CHAT" ? options?.replyToMessageId : null,
              ),
            ),
          },
        );
        if (leadIdRef.current !== leadId) return false;
        setPanel((prev) =>
          prev ? appendV2ChatSentMessage(prev, json.message) : prev,
        );
        listenersRef.current?.onSent?.(json.message);
        return true;
      } catch (err) {
        if (leadIdRef.current !== leadId) return false;
        const message =
          err instanceof Error ? err.message : "Failed to send";
        setSendError(message);
        if (message.includes("Do not send it again")) {
          return true;
        }
        return false;
      } finally {
        sendInFlightRef.current = false;
        setSending(false);
      }
    },
    [leadId, panel],
  );

  const sendVoiceNote = useCallback(
    async (input: {
      blob: Blob;
      mimeType: string;
      durationMs: number;
      replyToMessageId?: string | null;
    }): Promise<boolean> => {
      if (!panel?.viewer.canMarkRead || sendInFlightRef.current) return false;
      sendInFlightRef.current = true;
      setSending(true);
      setSendError(null);
      const uploadId = newVoiceNoteUploadId();
      try {
        const json = await fetchV2Json<{ message: LeadProfileV2ChatMessage }>(
          agentChatVoiceNoteUploadRoute(leadId),
          V2_CHAT_SEND_ROUTE,
          undefined,
          {
            method: "POST",
            body: buildVoiceNoteUploadFormData({
              blob: input.blob,
              mimeType: input.mimeType,
              durationMs: input.durationMs,
              uploadId,
              replyToMessageId: input.replyToMessageId,
            }),
          },
        );
        if (leadIdRef.current !== leadId) return false;
        setPanel((prev) =>
          prev ? appendV2ChatSentMessage(prev, json.message) : prev,
        );
        listenersRef.current?.onSent?.(json.message);
        return true;
      } catch (err) {
        if (leadIdRef.current !== leadId) return false;
        const message =
          err instanceof Error ? err.message : "Failed to send voice note";
        setSendError(message);
        return false;
      } finally {
        sendInFlightRef.current = false;
        setSending(false);
      }
    },
    [leadId, panel?.viewer.canMarkRead],
  );

  /**
   * Append a LISTING_SHARE message already created by the picker (M4V endpoint).
   * Does not POST again — picker owns idempotency + retries.
   */
  const appendListingShareMessage = useCallback(
    async (message: LeadProfileV2ChatMessage): Promise<boolean> => {
      if (!panel?.viewer.canMarkRead) return false;
      if (leadIdRef.current !== leadId) return false;
      if (!message?.id) return false;
      setPanel((prev) =>
        prev ? appendV2ChatSentMessage(prev, message) : prev,
      );
      listenersRef.current?.onSent?.(message);
      return true;
    },
    [leadId, panel?.viewer.canMarkRead],
  );

  const reactToMessage = useCallback(
    async (messageId: string, key: string): Promise<boolean> => {
      try {
        const json = await fetchV2Json<{
          reactions?: LeadProfileV2ChatMessage["reactions"];
        }>(
          v2ChatReactionUrl(leadId, messageId),
          V2_CHAT_SEND_ROUTE,
          undefined,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key }),
          },
        );
        if (leadIdRef.current !== leadId) return false;
        setPanel((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((message) =>
              message.id === messageId
                ? { ...message, reactions: json.reactions ?? [] }
                : message,
            ),
          };
        });
        return true;
      } catch {
        return false;
      }
    },
    [leadId],
  );

  const searchMessages = useCallback(
    async (query: string, cursor?: string | null) => {
      const json = await fetchV2Json<{
        query: string;
        hits: Array<{
          id: string;
          body: string;
          senderName: string;
          senderKind: string;
          createdAt: string;
        }>;
        page: {
          limit: number;
          hasMore: boolean;
          nextCursor: string | null;
        };
      }>(v2ChatSearchUrl(leadId, query, cursor), V2_CHAT_SEARCH_ROUTE);
      return json;
    },
    [leadId],
  );

  const ensureMessageLoaded = useCallback(
    async (messageId: string): Promise<boolean> => {
      const id = messageId.trim();
      if (!id) return false;
      if (panel?.messages.some((message) => message.id === id)) return true;
      try {
        const json = await fetchV2Json<{
          messages: LeadProfileV2ChatMessage[];
          page: {
            hasMoreOlder: boolean;
            olderCursor: string | null;
          };
        }>(v2ChatContextUrl(leadId, id), V2_CHAT_GET_ROUTE);
        if (leadIdRef.current !== leadId) return false;
        if (!json.messages?.length) return false;
        setPanel((prev) =>
          prev
            ? mergeV2ChatContext(prev, {
                messages: json.messages,
                page: {
                  hasMoreOlder: Boolean(json.page?.hasMoreOlder),
                  olderCursor: json.page?.olderCursor ?? null,
                },
              })
            : prev,
        );
        return true;
      } catch {
        return false;
      }
    },
    [leadId, panel?.messages],
  );

  const loading = enabled && !error && panel === null;

  return {
    panel,
    loading,
    busy,
    error,
    sendError,
    sending,
    reload,
    invalidate,
    loadOlder,
    send,
    sendVoiceNote,
    appendListingShareMessage,
    reactToMessage,
    searchMessages,
    ensureMessageLoaded,
  };
}
