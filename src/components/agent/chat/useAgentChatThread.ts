"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchV2Json } from "@/lib/agent/lead-profile-v2/fetch-json";
import {
  appendV2ChatSentMessage,
  canApplyV2ChatResponse,
  clearV2ChatUnread,
  mergeV2ChatMessages,
  shouldMarkV2ChatRead,
  shouldSkipDuplicateV2ChatOlder,
  shouldSkipV2ChatSubmit,
  V2_CHAT_GET_ROUTE,
  V2_CHAT_READ_ROUTE,
  V2_CHAT_RESOURCE_KEY,
  V2_CHAT_SEND_ROUTE,
  v2ChatGetUrl,
  v2ChatOlderCursorKey,
  v2ChatReadUrl,
  v2ChatSendUrl,
} from "@/lib/agent/lead-profile-v2/chat-query";
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
      const run = () => {
        const stamp = { leadId, epoch: epochRef.current };
        return async (id: string, signal: AbortSignal) => {
          const apply = () =>
            canApplyV2ChatResponse({
              stamp,
              current: { leadId: leadIdRef.current, epoch: epochRef.current },
            });
          setBusy(true);
          if (!input.prepend) setError(false);
          try {
            const json = await fetchV2Json<LeadProfileV2ChatPanel>(
              v2ChatGetUrl(id, input.cursor),
              V2_CHAT_GET_ROUTE,
              signal,
            );
            if (!apply() || signal.aborted) return;
            loadedForLeadRef.current = id;
            setPanel((prev) => {
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
            if (input.prepend) {
              lastOlderCursorKeyRef.current = null;
              return;
            }
            setError(true);
          } finally {
            if (apply()) setBusy(false);
          }
        };
      };

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
      return;
    }
    if (loadedForLeadRef.current === leadId) return;
    fetchPage({ prepend: false });
  }, [enabled, leadId, fetchPage, session]);

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
    async (body: string): Promise<boolean> => {
      if (
        shouldSkipV2ChatSubmit({
          body,
          inFlight: sendInFlightRef.current,
          canSend: Boolean(panel?.viewer.canMarkRead),
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
            body: JSON.stringify({ body }),
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
        setSendError(
          err instanceof Error ? err.message : "Failed to send",
        );
        return false;
      } finally {
        sendInFlightRef.current = false;
        setSending(false);
      }
    },
    [leadId, panel],
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
  };
}
