"use client";

import { useEffect, useRef, useState } from "react";
import { ChatListingShareCard } from "@/components/chat/ChatListingShareCard";
import { ChatComposerLinkPreviewCard } from "@/components/chat/ChatComposerLinkPreview";
import {
  CHAT_LISTING_URL_PREVIEW_DEBOUNCE_MS,
  chatListingUrlPreviewUrl,
  extractChatListingMls,
  type ChatListingUrlPreviewResponse,
} from "@/lib/chat/listing-url-preview";
import {
  buildComposerLinkPreview,
  type ChatComposerLinkPreview,
} from "@/lib/chat/link-preview";
import type { ListingSharePresentView } from "@/lib/conversations/listing-share/payload";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatListingComposerPreviewState =
  | { status: "idle" }
  | { status: "loading"; mlsNumber: string; href: string }
  | {
      status: "ready";
      mlsNumber: string;
      href: string;
      shareable: boolean;
      listingId: string;
      preview: ListingSharePresentView;
    }
  | {
      status: "error";
      mlsNumber: string;
      href: string;
      message: string;
    }
  | { status: "external"; basic: ChatComposerLinkPreview };

async function fetchPreview(
  mlsNumber: string,
  signal: AbortSignal,
): Promise<ChatListingUrlPreviewResponse> {
  const res = await fetch(chatListingUrlPreviewUrl(mlsNumber), {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  try {
    return (await res.json()) as ChatListingUrlPreviewResponse;
  } catch {
    return {
      ok: false,
      reason: "UNAVAILABLE",
      message: "Listing preview is temporarily unavailable.",
    };
  }
}

/** Debounced composer preview for the first URL in draft text. */
export function useChatComposerListingPreview(input: {
  draft: string;
  dismissedHref: string | null;
  enabled?: boolean;
}): ChatListingComposerPreviewState {
  const enabled = input.enabled !== false;
  const [state, setState] = useState<ChatListingComposerPreviewState>({
    status: "idle",
  });
  const genRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    const listing = extractChatListingMls(input.draft);
    const basic = buildComposerLinkPreview(input.draft);
    if (!listing && !basic) {
      setState({ status: "idle" });
      return;
    }
    if (basic && basic.href === input.dismissedHref) {
      setState({ status: "idle" });
      return;
    }
    if (!listing) {
      if (basic && basic.kind === "external") {
        setState({ status: "external", basic });
      } else {
        setState({ status: "idle" });
      }
      return;
    }
    if (listing.href === input.dismissedHref) {
      setState({ status: "idle" });
      return;
    }

    const gen = ++genRef.current;
    setState({
      status: "loading",
      mlsNumber: listing.mlsNumber,
      href: listing.href,
    });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchPreview(listing.mlsNumber, controller.signal).then((result) => {
        if (gen !== genRef.current) return;
        if (!result.ok) {
          setState({
            status: "error",
            mlsNumber: listing.mlsNumber,
            href: listing.href,
            message: result.message,
          });
          return;
        }
        setState({
          status: "ready",
          mlsNumber: result.mlsNumber,
          href: listing.href,
          shareable: result.shareable,
          listingId: result.listingId,
          preview: result.preview,
        });
      });
    }, CHAT_LISTING_URL_PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, input.dismissedHref, input.draft]);

  return state;
}

export function ChatComposerListingPreview({
  state,
  onDismiss,
}: {
  state: ChatListingComposerPreviewState;
  onDismiss: (href: string) => void;
}) {
  if (state.status === "idle") return null;

  if (state.status === "external") {
    return (
      <ChatComposerLinkPreviewCard
        preview={state.basic}
        onDismiss={() => onDismiss(state.basic.href)}
      />
    );
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-[#d7e8df] bg-[#f7fbf9] px-3 py-2 text-[12px] font-medium text-[#5b7a6c]">
        Loading listing preview…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-[#d7e8df] bg-[#f7fbf9] px-3 py-2">
        <p className="min-w-0 flex-1 text-[12px] font-medium text-[#5b7a6c]">
          {state.message}
        </p>
        <button
          type="button"
          aria-label="Remove link preview"
          onClick={() => onDismiss(state.href)}
          className="shrink-0 text-[#7a9a8b] hover:text-[#1a2e24]"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <ChatListingShareCard
        payload={state.preview}
        className="max-w-full shadow-sm"
      />
      {!state.shareable ? (
        <p className="mt-1 text-[11px] font-medium text-[#5b7a6c]">
          Preview for you — this listing can’t be shared as a property card.
        </p>
      ) : null}
      <button
        type="button"
        aria-label="Remove link preview"
        onClick={() => onDismiss(state.href)}
        className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-white/90 text-[#475569] shadow-sm ring-1 ring-[#d7e8df] hover:bg-white"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Transcript card for TEXT messages that contain a Houzzat listing URL. */
export function ChatMessageListingUrlCard({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  const listing = extractChatListingMls(body);
  const [preview, setPreview] = useState<ListingSharePresentView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!listing) return;
    const controller = new AbortController();
    void fetchPreview(listing.mlsNumber, controller.signal).then((result) => {
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setPreview(result.preview);
    });
    return () => controller.abort();
  }, [listing?.mlsNumber]);

  if (!listing) return null;
  if (preview) {
    return (
      <ChatListingShareCard
        payload={preview}
        className={cn("mb-1.5", className)}
      />
    );
  }
  if (failed) {
    return (
      <ChatComposerLinkPreviewCard
        preview={{
          href: listing.href,
          hostname: listing.hostname,
          kind: "listing",
          listingPath: null,
          mlsNumber: listing.mlsNumber,
          title: "Listing unavailable",
          description: listing.mlsNumber,
        }}
        className="mb-1.5"
      />
    );
  }
  return (
    <div className="mb-1.5 rounded-xl border border-[#d7e8df] bg-[#f7fbf9] px-3 py-2 text-[12px] text-[#5b7a6c]">
      Loading listing…
    </div>
  );
}
