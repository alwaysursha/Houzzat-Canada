"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import {
  dispatchPendingCaptureIntent,
  subscribeCaptureIntentHandlers,
} from "@/lib/auth/capture-intent-dispatch";
import { ensureStartChatIntentHandler } from "@/lib/auth/start-chat-intent";
import { ensureViewListingIntentHandler } from "@/lib/auth/view-listing-intent";

/**
 * After sign-in or sign-up, resume a pending intent once its handler exists.
 * Renders nothing. A valid intent with no handler is left stored.
 */
export function CaptureIntentResume() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    ensureStartChatIntentHandler();
    ensureViewListingIntentHandler();
    const run = () => {
      if (typeof window === "undefined") return;
      dispatchPendingCaptureIntent(browserCaptureIntentStore(), {
        host: window.location.hostname,
        now: Date.now(),
      });
    };
    run();
    return subscribeCaptureIntentHandlers(run);
  }, [status]);

  return null;
}
