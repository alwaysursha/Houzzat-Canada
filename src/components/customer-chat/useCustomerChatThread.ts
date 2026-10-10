"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useClientToolsVerification } from "@/components/auth/ClientToolsVerificationProvider";
import {
  CUSTOMER_CHAT_GET_ROUTE,
  CUSTOMER_CHAT_PAGE_HREF,
  CUSTOMER_CHAT_READ_ROUTE,
  CUSTOMER_CHAT_SEND_ROUTE,
  appendCustomerChatSentMessage,
  customerChatContextRoute,
  customerChatGetUrl,
  customerChatReactionRoute,
  customerChatSearchUrl,
  customerChatSendBody,
  mergeCustomerChatContext,
  mergeCustomerChatMessages,
  parseCustomerChatLoadError,
  parseCustomerChatSendFailure,
  shouldMarkCustomerChatRead,
  shouldSkipCustomerChatSubmit,
  shouldSkipDuplicateCustomerChatOlder,
} from "@/lib/customer-chat/query";
import {
  CONVERSATION_LIVE_POLL_MS,
  conversationLivePollShouldTick,
  conversationLiveVisible,
  mergeLiveConversationMessages,
} from "@/lib/conversations/conversation-live-poll";
import type {
  CustomerChatGetPayload,
  CustomerChatLoadErrorKind,
  CustomerChatMessage,
  CustomerChatSendFailure,
  CustomerChatSendPayload,
} from "@/lib/customer-chat/types";

function emptyPayload(): CustomerChatGetPayload {
  return {
    conversation: null,
    messages: [],
    page: { limit: 40, hasMore: false, nextCursor: null },
    canSend: true,
    blocked: false,
    read: {
      customerLastReadAt: null,
      agentLastReadAt: null,
      unreadCount: 0,
    },
    agent: null,
  };
}

export type UseCustomerChatThreadOptions = {
  /** When false, transcript still loads/polls but read receipts are not posted. */
  chatVisible?: boolean;
  /** When false, skip network (floating shell closed). */
  enabled?: boolean;
};

async function readJson(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function useCustomerChatThread(
  options: UseCustomerChatThreadOptions = {},
) {
  const chatVisible = options.chatVisible !== false;
  const enabled = options.enabled !== false;
  const { openAuth } = useAuthModal();
  const { openClientToolsVerification } = useClientToolsVerification();
  const [payload, setPayload] = useState<CustomerChatGetPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{
    kind: CustomerChatLoadErrorKind;
    message: string;
  } | null>(null);
  const [sendError, setSendError] = useState<CustomerChatSendFailure | null>(
    null,
  );
  const [sending, setSending] = useState(false);

  const sendInFlightRef = useRef(false);
  const olderInFlightRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const lastOlderCursorRef = useRef<string | null>(null);
  const markedReadIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetchPage = useCallback(async (input: {
    cursor?: string | null;
    prepend: boolean;
    live?: boolean;
  }) => {
    const live = Boolean(input.live);
    if (live) {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
    }
    if (input.prepend) {
      const cursor = input.cursor ?? "";
      if (
        shouldSkipDuplicateCustomerChatOlder({
          inFlight: olderInFlightRef.current,
          lastCursor: lastOlderCursorRef.current,
          cursor,
        })
      ) {
        return;
      }
      olderInFlightRef.current = true;
      lastOlderCursorRef.current = cursor;
    } else if (!live) {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      lastOlderCursorRef.current = null;
      setLoadError(null);
      if (!loadedRef.current) setLoading(true);
    }
    if (!live) setBusy(true);
    const signal = live
      ? abortRef.current?.signal
      : input.prepend
        ? undefined
        : abortRef.current?.signal;
    try {
      const res = await fetch(customerChatGetUrl(input.cursor), {
        method: "GET",
        cache: "no-store",
        signal,
      });
      const body = await readJson(res);
      if (signal?.aborted) return;
      if (!res.ok) {
        if (live) return;
        if (!input.prepend) {
          setLoadError(parseCustomerChatLoadError(res.status, body));
          setPayload(null);
          loadedRef.current = false;
        } else {
          lastOlderCursorRef.current = null;
        }
        return;
      }
      const json = body as CustomerChatGetPayload;
      loadedRef.current = true;
      setLoadError(null);
      setPayload((prev) => {
        if (live && prev) {
          return {
            ...prev,
            conversation: json.conversation,
            canSend: json.canSend,
            blocked: json.blocked,
            read: json.read,
            agent: json.agent ?? prev.agent,
            messages: mergeLiveConversationMessages(
              prev.messages,
              json.messages,
            ),
          };
        }
        if (!input.prepend || !prev) return json;
        return {
          ...json,
          messages: mergeCustomerChatMessages(
            prev.messages,
            json.messages,
            "prepend",
          ),
          page: json.page,
        };
      });
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (live) return;
      if (!input.prepend) {
        setLoadError({
          kind: "generic",
          message: "Couldn’t load chat. Please try again.",
        });
        loadedRef.current = false;
      } else {
        lastOlderCursorRef.current = null;
      }
    } finally {
      if (live) pollInFlightRef.current = false;
      if (input.prepend) olderInFlightRef.current = false;
      if (!live) {
        setBusy(false);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void fetchPage({ prepend: false });
    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, fetchPage]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (
        !conversationLivePollShouldTick({
          enabled: true,
          visible: conversationLiveVisible(document),
          inFlight: pollInFlightRef.current,
          hasLoaded: loadedRef.current,
        })
      ) {
        return;
      }
      void fetchPage({ prepend: false, live: true });
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
    };
  }, [enabled, fetchPage]);

  useEffect(() => {
    const openId = payload?.conversation?.id ?? null;
    if (
      !shouldMarkCustomerChatRead({
        chatVisible,
        openId,
        alreadyMarkedId: markedReadIdRef.current,
      })
    ) {
      return;
    }
    const id = openId;
    if (!id) return;
    markedReadIdRef.current = id;
    void (async () => {
      try {
        const res = await fetch(CUSTOMER_CHAT_READ_ROUTE, { method: "POST" });
        if (!res.ok) {
          markedReadIdRef.current = null;
          return;
        }
        setPayload((prev) =>
          prev
            ? {
                ...prev,
                read: { customerLastReadAt: new Date().toISOString(), unreadCount: 0 },
              }
            : prev,
        );
      } catch {
        markedReadIdRef.current = null;
      }
    })();
  }, [payload, chatVisible]);

  const reload = useCallback(() => {
    loadedRef.current = false;
    markedReadIdRef.current = null;
    void fetchPage({ prepend: false });
  }, [fetchPage]);

  const loadOlder = useCallback(() => {
    const cursor = payload?.page.nextCursor;
    if (!cursor) return;
    void fetchPage({ cursor, prepend: true });
  }, [fetchPage, payload]);

  const send = useCallback(
    async (
      body: string,
      options?: { replyToMessageId?: string | null },
    ): Promise<boolean> => {
      const canSend = Boolean(payload && payload.canSend && !payload.blocked);
      if (
        shouldSkipCustomerChatSubmit({
          body,
          inFlight: sendInFlightRef.current,
          canSend,
        })
      ) {
        return false;
      }
      sendInFlightRef.current = true;
      setSending(true);
      setSendError(null);
      try {
        const res = await fetch(CUSTOMER_CHAT_SEND_ROUTE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            customerChatSendBody(body, options?.replyToMessageId),
          ),
        });
        const json = await readJson(res);
        if (!res.ok) {
          const failure = parseCustomerChatSendFailure(
            res.status,
            json,
            res.headers.get("Retry-After"),
          );
          setSendError(failure);
          if (failure.kind === "blocked") {
            setPayload((prev) =>
              prev ? { ...prev, blocked: true, canSend: false } : prev,
            );
          }
          if (failure.kind === "verification") {
            openClientToolsVerification({
              callbackUrl: CUSTOMER_CHAT_PAGE_HREF,
            });
          }
          if (failure.kind === "auth") {
            openAuth({
              mode: "sign-in",
              callbackUrl: CUSTOMER_CHAT_PAGE_HREF,
            });
          }
          return false;
        }
        const sent = json as CustomerChatSendPayload;
        setPayload((prev) => {
          const base = prev ?? emptyPayload();
          return {
            ...appendCustomerChatSentMessage(
              base,
              sent.conversation,
              sent.message,
            ),
            conversation: sent.conversation,
            canSend: true,
            blocked: false,
          };
        });
        return true;
      } catch {
        setSendError({
          kind: "generic",
          message: "Couldn’t send your message. Please try again.",
          retryAfterSec: null,
        });
        return false;
      } finally {
        sendInFlightRef.current = false;
        setSending(false);
      }
    },
    [openAuth, openClientToolsVerification, payload],
  );

  const reactToMessage = useCallback(
    async (messageId: string, key: string): Promise<boolean> => {
      try {
        const res = await fetch(customerChatReactionRoute(messageId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        if (!res.ok) return false;
        const json = (await res.json()) as {
          reactions?: CustomerChatGetPayload["messages"][number]["reactions"];
        };
        setPayload((prev) => {
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
    [],
  );

  const searchMessages = useCallback(
    async (query: string, cursor?: string | null) => {
      const res = await fetch(customerChatSearchUrl(query, cursor), {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("search failed");
      }
      return (await res.json()) as {
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
      };
    },
    [],
  );

  const ensureMessageLoaded = useCallback(
    async (messageId: string): Promise<boolean> => {
      const id = messageId.trim();
      if (!id) return false;
      const already = payload?.messages.some((message) => message.id === id);
      if (already) return true;
      try {
        const res = await fetch(customerChatContextRoute(id), {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return false;
        const json = (await res.json()) as {
          messages?: CustomerChatMessage[];
          page?: {
            hasMoreOlder: boolean;
            olderCursor: string | null;
          };
        };
        if (!json.messages?.length) return false;
        setPayload((prev) => {
          const base = prev ?? emptyPayload();
          return mergeCustomerChatContext(base, {
            messages: json.messages ?? [],
            page: {
              hasMoreOlder: Boolean(json.page?.hasMoreOlder),
              olderCursor: json.page?.olderCursor ?? null,
            },
          });
        });
        return true;
      } catch {
        return false;
      }
    },
    [payload?.messages],
  );

  return {
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
    getRoute: CUSTOMER_CHAT_GET_ROUTE,
    sendRoute: CUSTOMER_CHAT_SEND_ROUTE,
    readRoute: CUSTOMER_CHAT_READ_ROUTE,
  };
}
