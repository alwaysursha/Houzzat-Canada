"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { CustomerChatFloatingWindow } from "@/components/customer-chat/CustomerChatFloatingWindow";
import { CustomerChatUnreadPreview } from "@/components/customer-chat/CustomerChatUnreadPreview";
import {
  CUSTOMER_CHAT_GET_ROUTE,
  CUSTOMER_CHAT_PAGE_HREF,
  customerChatMessageBody,
} from "@/lib/customer-chat/query";
import {
  CUSTOMER_CHAT_OPEN_EVENT,
  clearCustomerChatSessionState,
  customerChatUnreadAutoOpenBatchKey,
  customerChatUnreadPreviewBody,
  findLatestUnreadAgentMessageId,
  isCustomerChatMobileViewport,
  normalizeCustomerChatDraft,
  normalizeCustomerChatListingContext,
  readCustomerChatBatchKey,
  readCustomerChatSessionDraft,
  readCustomerChatSessionListing,
  readCustomerChatWindowPosition,
  shouldAutoOpenCustomerChatForUnread,
  shouldDeferCustomerChatAutoOpen,
  shouldPeekCustomerChatUnread,
  writeCustomerChatBatchKey,
  writeCustomerChatSessionDraft,
  writeCustomerChatSessionListing,
  writeCustomerChatWindowPosition,
  type CustomerChatListingContext,
  type CustomerChatOpenDetail,
  type CustomerChatUnreadPreviewState,
  type CustomerChatWindowMode,
  type CustomerChatWindowPosition,
} from "@/lib/customer-chat/floating-chat";
import type { CustomerChatGetPayload } from "@/lib/customer-chat/types";
import { resolveAppShell } from "@/lib/mobile/app-shell";
import { setNativeStatusBarLightOverlay } from "@/lib/mobile/native-status-bar";
import {
  CUSTOMER_CHAT_HISTORY_STATE_KEY,
  CUSTOMER_CHAT_OVERLAY_PRIORITY,
  isCustomerChatHistoryState,
  pushCustomerChatOverlay,
} from "@/lib/customer-chat/chat-overlay";
import { VOICE_NOTE_MESSAGE_BODY } from "@/lib/chat/voice-notes/constants";
import { LISTING_SHARE_MESSAGE_BODY } from "@/lib/conversations/listing-share/payload";

type CustomerChatController = {
  mode: CustomerChatWindowMode;
  draft: string;
  listingContext: CustomerChatListingContext | null;
  position: CustomerChatWindowPosition;
  isMobile: boolean;
  preview: CustomerChatUnreadPreviewState | null;
  open: (detail?: CustomerChatOpenDetail) => void;
  minimize: () => void;
  expand: () => void;
  close: () => void;
  setDraft: (value: string) => void;
  setListingContext: (value: CustomerChatListingContext | null) => void;
  setPosition: (value: CustomerChatWindowPosition) => void;
};

const CustomerChatContext = createContext<CustomerChatController | null>(null);

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function memoryStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

export function useCustomerChatController(): CustomerChatController {
  const ctx = useContext(CustomerChatContext);
  if (!ctx) {
    throw new Error("useCustomerChatController requires CustomerChatProvider");
  }
  return ctx;
}

export function useOptionalCustomerChatController(): CustomerChatController | null {
  return useContext(CustomerChatContext);
}

export function CustomerChatProvider({ children }: { children: ReactNode }) {
  const { status, data } = useSession();
  const pathname = usePathname() || "/";
  const userId = data?.user?.id ?? null;
  const role = data?.user?.role;
  const isStaff =
    status === "authenticated" && (role === "ADMIN" || role === "AGENT");
  const onChatPage =
    pathname === CUSTOMER_CHAT_PAGE_HREF ||
    pathname.startsWith(`${CUSTOMER_CHAT_PAGE_HREF}/`);
  const onPro = pathname === "/pro" || pathname.startsWith("/pro/");

  const [houzzatProShell, setHouzzatProShell] = useState(false);
  const [mode, setMode] = useState<CustomerChatWindowMode>("closed");
  const [preview, setPreview] =
    useState<CustomerChatUnreadPreviewState | null>(null);
  const [draft, setDraftState] = useState("");
  const [listingContext, setListingState] =
    useState<CustomerChatListingContext | null>(null);
  const [position, setPositionState] = useState<CustomerChatWindowPosition>({
    x: 24,
    y: 24,
  });
  const [isMobile, setIsMobile] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);

  const openedBatchRef = useRef<string | null>(null);
  const dismissedBatchRef = useRef<string | null>(null);
  const lastUnreadBatchKeyRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const peekInFlightRef = useRef(false);
  const historyPushedRef = useRef(false);
  const closingFromPopRef = useRef(false);

  const storage = useMemo(() => browserStorage() ?? memoryStorage(), []);

  useEffect(() => {
    let cancelled = false;
    void resolveAppShell().then((shell) => {
      if (!cancelled) setHouzzatProShell(shell === "houzzatpro");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function syncViewport() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setIsMobile(isCustomerChatMobileViewport(width));
      if (userId) {
        setPositionState(
          readCustomerChatWindowPosition(storage, userId, { width, height }),
        );
      } else {
        setPositionState({
          x: Math.max(12, width - 404),
          y: Math.max(12, height - 656),
        });
      }
      setViewportReady(true);
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, [storage, userId]);

  useEffect(() => {
    const prev = prevUserIdRef.current;
    if (prev && prev !== userId) {
      clearCustomerChatSessionState(storage, prev);
      setMode("closed");
      setDraftState("");
      setListingState(null);
      openedBatchRef.current = null;
      dismissedBatchRef.current = null;
      lastUnreadBatchKeyRef.current = null;
    }
    prevUserIdRef.current = userId;
    if (!userId) {
      setMode("closed");
      setPreview(null);
      setDraftState("");
      setListingState(null);
      openedBatchRef.current = null;
      dismissedBatchRef.current = null;
      lastUnreadBatchKeyRef.current = null;
      return;
    }
    setDraftState(readCustomerChatSessionDraft(storage, userId));
    setListingState(readCustomerChatSessionListing(storage, userId));
    openedBatchRef.current = readCustomerChatBatchKey(
      storage,
      userId,
      "autoOpenBatch",
    );
    dismissedBatchRef.current = readCustomerChatBatchKey(
      storage,
      userId,
      "dismissedBatch",
    );
    lastUnreadBatchKeyRef.current = null;
  }, [storage, userId]);

  const setDraft = useCallback(
    (value: string) => {
      const next = normalizeCustomerChatDraft(value);
      setDraftState(next);
      if (userId) writeCustomerChatSessionDraft(storage, userId, next);
    },
    [storage, userId],
  );

  const setListingContext = useCallback(
    (value: CustomerChatListingContext | null) => {
      const next = value ? normalizeCustomerChatListingContext(value) : null;
      setListingState(next);
      if (userId) writeCustomerChatSessionListing(storage, userId, next);
    },
    [storage, userId],
  );

  const setPosition = useCallback(
    (value: CustomerChatWindowPosition) => {
      setPositionState(value);
      if (userId) writeCustomerChatWindowPosition(storage, userId, value);
    },
    [storage, userId],
  );

  const rememberOpenedBatch = useCallback(
    (batchKey: string | null) => {
      openedBatchRef.current = batchKey;
      if (userId) {
        writeCustomerChatBatchKey(storage, userId, "autoOpenBatch", batchKey);
      }
    },
    [storage, userId],
  );

  const rememberDismissedBatch = useCallback(
    (batchKey: string | null) => {
      dismissedBatchRef.current = batchKey;
      openedBatchRef.current = batchKey;
      if (userId) {
        writeCustomerChatBatchKey(storage, userId, "dismissedBatch", batchKey);
        writeCustomerChatBatchKey(storage, userId, "autoOpenBatch", batchKey);
      }
    },
    [storage, userId],
  );

  const open = useCallback(
    (detail?: CustomerChatOpenDetail) => {
      if (detail?.listingContext) {
        setListingContext(detail.listingContext);
      }
      if (detail?.draft != null) {
        setDraft(detail.draft);
      }
      setPreview(null);
      setMode("open");
    },
    [setDraft, setListingContext],
  );

  const minimize = useCallback(() => {
    setPreview(null);
    setMode("minimized");
  }, []);

  const expand = useCallback(() => {
    setPreview(null);
    setMode("open");
  }, []);

  useEffect(() => {
    function onOpenEvent(event: Event) {
      const custom = event as CustomEvent<CustomerChatOpenDetail>;
      open(custom.detail ?? { forceExpand: true });
    }
    window.addEventListener(CUSTOMER_CHAT_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener(CUSTOMER_CHAT_OPEN_EVENT, onOpenEvent);
    };
  }, [open]);

  const floatingEnabled =
    status === "authenticated" &&
    Boolean(userId) &&
    !isStaff &&
    !houzzatProShell &&
    !onPro &&
    !onChatPage &&
    viewportReady;

  useEffect(() => {
    if (!floatingEnabled || !userId) return;

    let cancelled = false;

    async function peekUnread() {
      if (cancelled || peekInFlightRef.current) return;
      if (
        !shouldPeekCustomerChatUnread({
          floatingEnabled: true,
          mode: modeRef.current,
        })
      ) {
        return;
      }
      peekInFlightRef.current = true;
      try {
        const res = await fetch(CUSTOMER_CHAT_GET_ROUTE, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as CustomerChatGetPayload;
        // Background peek must not mark read — GET never marks; never POST /read here.
        const latestUnreadAgentMessageId = findLatestUnreadAgentMessageId({
          messages: json.messages,
          customerLastReadAt: json.read.customerLastReadAt,
          unreadCount: json.read.unreadCount,
        });
        const batchKey = customerChatUnreadAutoOpenBatchKey({
          conversationId: json.conversation?.id ?? null,
          unreadCount: json.read.unreadCount,
          latestUnreadAgentMessageId,
        });
        lastUnreadBatchKeyRef.current = batchKey;
        const defer = shouldDeferCustomerChatAutoOpen({
          activeElement: document.activeElement,
          pathname,
        });
        if (
          !shouldAutoOpenCustomerChatForUnread({
            authenticated: true,
            mode: modeRef.current,
            batchKey,
            alreadyOpenedBatchKey: openedBatchRef.current,
            dismissedBatchKey: dismissedBatchRef.current,
            deferAutoOpen: defer,
          })
        ) {
          return;
        }
        if (!batchKey || !latestUnreadAgentMessageId) return;
        rememberOpenedBatch(batchKey);
        const latestMessage =
          json.messages.find(
            (message) => message.id === latestUnreadAgentMessageId,
          ) ?? null;
        const messageBody = latestMessage
          ? customerChatMessageBody(latestMessage)
          : "";
        const hasVoice =
          Boolean(
            latestMessage?.attachments?.some(
              (attachment) => attachment.kind === "VOICE_NOTE",
            ),
          ) || messageBody === VOICE_NOTE_MESSAGE_BODY;
        const isListingShare =
          messageBody === LISTING_SHARE_MESSAGE_BODY ||
          Boolean(
            latestMessage?.payload &&
              typeof latestMessage.payload === "object" &&
              (latestMessage.payload as { card?: string }).card ===
                "LISTING_SHARE",
          );
        setPreview({
          batchKey,
          agentName: json.agent?.name ?? null,
          agentPhotoUrl: json.agent?.photoUrl ?? null,
          messagePreview: customerChatUnreadPreviewBody({
            body: messageBody,
            hasVoiceAttachment: hasVoice,
            isListingShare,
          }),
          messageCreatedAt: latestMessage?.createdAt ?? null,
          unreadCount: json.read.unreadCount,
          latestUnreadAgentMessageId,
        });
        // Compact preview instead of forcing the full conversation open.
        setMode("preview");
      } catch {
        // best-effort peek
      } finally {
        peekInFlightRef.current = false;
      }
    }

    void peekUnread();
    const onVisible = () => {
      if (document.visibilityState === "visible") void peekUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(() => void peekUnread(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [floatingEnabled, pathname, rememberOpenedBatch, userId]);

  const closeWithDismiss = useCallback(() => {
    // Synchronously suppress the current unread batch so peek cannot reopen
    // before an async refresh finishes (and so navigation keeps the dismissal).
    const immediate =
      lastUnreadBatchKeyRef.current ||
      openedBatchRef.current ||
      dismissedBatchRef.current;
    if (immediate) {
      rememberDismissedBatch(immediate);
    }
    setPreview(null);
    setMode("closed");

    if (historyPushedRef.current && !closingFromPopRef.current) {
      historyPushedRef.current = false;
      if (isCustomerChatHistoryState(window.history.state)) {
        window.history.back();
      }
    }

    void (async () => {
      try {
        const res = await fetch(CUSTOMER_CHAT_GET_ROUTE, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as CustomerChatGetPayload;
        const latestUnreadAgentMessageId = findLatestUnreadAgentMessageId({
          messages: json.messages,
          customerLastReadAt: json.read.customerLastReadAt,
          unreadCount: json.read.unreadCount,
        });
        const batchKey = customerChatUnreadAutoOpenBatchKey({
          conversationId: json.conversation?.id ?? null,
          unreadCount: json.read.unreadCount,
          latestUnreadAgentMessageId,
        });
        if (batchKey) {
          lastUnreadBatchKeyRef.current = batchKey;
          rememberDismissedBatch(batchKey);
        }
      } catch {
        // ignore
      }
    })();
  }, [rememberDismissedBatch]);

  // Capacitor / browser Back: close open/preview overlays (preserve draft).
  useEffect(() => {
    if (!floatingEnabled) return;
    const overlayOpen =
      mode === "open" || mode === "preview" || mode === "minimized";
    if (!overlayOpen) return;

    const release = pushCustomerChatOverlay({
      id:
        mode === "preview"
          ? "customer-chat-preview"
          : mode === "minimized"
            ? "customer-chat-minimized"
            : "customer-chat-open",
      priority:
        mode === "preview"
          ? CUSTOMER_CHAT_OVERLAY_PRIORITY.preview
          : CUSTOMER_CHAT_OVERLAY_PRIORITY.open,
      close: () => {
        closeWithDismiss();
      },
    });

    if (!historyPushedRef.current && !isCustomerChatHistoryState(window.history.state)) {
      const prev =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {};
      window.history.pushState(
        { ...prev, [CUSTOMER_CHAT_HISTORY_STATE_KEY]: true },
        "",
      );
      historyPushedRef.current = true;
    } else if (isCustomerChatHistoryState(window.history.state)) {
      historyPushedRef.current = true;
    }

    function onPopState() {
      if (
        modeRef.current === "open" ||
        modeRef.current === "preview" ||
        modeRef.current === "minimized"
      ) {
        closingFromPopRef.current = true;
        historyPushedRef.current = false;
        closeWithDismiss();
        closingFromPopRef.current = false;
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      release();
      window.removeEventListener("popstate", onPopState);
    };
  }, [closeWithDismiss, floatingEnabled, mode]);

  // Dark status-bar icons while light floating chat covers the viewport.
  useEffect(() => {
    if (!floatingEnabled) return;
    const light =
      mode === "open" || mode === "preview" || mode === "minimized";
    setNativeStatusBarLightOverlay(light);
    return () => setNativeStatusBarLightOverlay(false);
  }, [floatingEnabled, mode]);

  const controller = useMemo<CustomerChatController>(
    () => ({
      mode,
      draft,
      listingContext,
      position,
      isMobile,
      preview,
      open,
      minimize,
      expand,
      close: closeWithDismiss,
      setDraft,
      setListingContext,
      setPosition,
    }),
    [
      mode,
      draft,
      listingContext,
      position,
      isMobile,
      preview,
      open,
      minimize,
      expand,
      closeWithDismiss,
      setDraft,
      setListingContext,
      setPosition,
    ],
  );

  return (
    <CustomerChatContext.Provider value={controller}>
      {children}
      {floatingEnabled && mode === "preview" && preview ? (
        <CustomerChatUnreadPreview preview={preview} />
      ) : null}
      {floatingEnabled && (mode === "open" || mode === "minimized") ? (
        <CustomerChatFloatingWindow />
      ) : null}
    </CustomerChatContext.Provider>
  );
}
