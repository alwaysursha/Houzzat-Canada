"use client";

import { useCallback } from "react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import {
  requireAuthForIntent,
  type CaptureIntent,
  type CaptureIntentDraft,
} from "@/lib/auth/capture-intent";

type AuthMode = "sign-in" | "sign-up";

/**
 * Future features call this instead of inventing their own auth continuation.
 * Existing buttons do not use it yet.
 */
export function useRequireAuthForIntent(): (
  draft: CaptureIntentDraft,
  mode?: AuthMode,
) =>
  | { ok: true; intent: CaptureIntent }
  | { ok: false; reason: "invalid" } {
  const { openAuth } = useAuthModal();

  return useCallback(
    (draft, mode) => {
      const host =
        typeof window === "undefined" ? "" : window.location.hostname;
      return requireAuthForIntent({
        draft,
        host,
        now: Date.now(),
        store: browserCaptureIntentStore(),
        openAuth,
        mode,
      });
    },
    [openAuth],
  );
}
