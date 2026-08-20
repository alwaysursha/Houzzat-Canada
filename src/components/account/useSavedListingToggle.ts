"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSavedListingsStatus } from "@/components/account/SavedListingsProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { useListingAccountChrome } from "@/components/listings/ListingAccountChromeProvider";
import { notifySavedListingsChanged } from "@/lib/account/saved-listings-sync";
import { flyHeartToSaved } from "@/lib/fly-to-saved";
import { SITE_MESSAGES } from "@/lib/site-messages";

/**
 * Single Save/Unsave mutation path for chrome, sticky bar, cards, etc.
 * Source of truth: SavedListingsProvider (Neon via /api/saved-listings).
 */
export function useSavedListingToggle({
  mlsNumber,
  authCallbackUrl,
  initiallySaved = false,
}: {
  mlsNumber: string;
  authCallbackUrl?: string;
  initiallySaved?: boolean;
}) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const sessionLoading = status === "loading";
  const savedStatus = useSavedListingsStatus();
  const chrome = useListingAccountChrome();
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const callbackUrl = authCallbackUrl ?? `/listing/${mlsNumber}`;

  const providerReady = Boolean(savedStatus?.ready);
  const chromeReady = chrome.active && chrome.loaded;

  /** Prefer provider; fall back to per-listing chrome while provider hydrates. */
  const saved = useMemo(() => {
    if (!signedIn) return false;
    if (providerReady) return savedStatus!.isSaved(mlsNumber);
    if (chromeReady) return chrome.saved;
    return initiallySaved;
  }, [
    signedIn,
    providerReady,
    savedStatus,
    mlsNumber,
    chromeReady,
    chrome.saved,
    initiallySaved,
  ]);

  /**
   * Guests are ready immediately. Signed-in: wait for provider or chrome so we
   * do not accept a tap against a false "unsaved" while hydration is in flight.
   */
  const ready = !signedIn
    ? true
    : sessionLoading
      ? false
      : providerReady || chromeReady;

  const toggle = useCallback(
    async (options?: { flyFrom?: HTMLElement | null }) => {
      if (pendingRef.current) return;
      if (!mlsNumber.trim()) return;

      if (sessionLoading) return;

      if (!signedIn) {
        openAuth({ mode: "sign-in", callbackUrl });
        return;
      }

      if (!providerReady && !chromeReady) return;

      const next = !saved;
      pendingRef.current = true;
      setPending(true);
      savedStatus?.setSavedState(mlsNumber, next);

      try {
        const res = await fetch("/api/saved-listings", {
          method: next ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mlsNumber }),
          credentials: "same-origin",
        });

        if (!res.ok) {
          savedStatus?.setSavedState(mlsNumber, !next);
          let requiresAuth = res.status === 401;
          let requiresEmailVerification = res.status === 403;
          try {
            const data = (await res.json()) as {
              requiresAuth?: boolean;
              requiresEmailVerification?: boolean;
            };
            if (data.requiresAuth) requiresAuth = true;
            if (data.requiresEmailVerification) requiresEmailVerification = true;
          } catch {
            // non-JSON error body
          }

          if (requiresAuth) {
            openAuth({ mode: "sign-in", callbackUrl });
            return;
          }
          if (requiresEmailVerification) {
            toast({
              message: SITE_MESSAGES.saveRequiresEmailVerificationToast,
              tone: "error",
            });
            return;
          }
          toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
          return;
        }

        toast({
          message: next
            ? SITE_MESSAGES.saveAddedToast
            : SITE_MESSAGES.saveRemovedToast,
          tone: next ? "success" : "info",
        });

        if (next && options?.flyFrom) {
          flyHeartToSaved(options.flyFrom);
        } else {
          notifySavedListingsChanged();
        }
      } catch {
        savedStatus?.setSavedState(mlsNumber, !next);
        toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [
      mlsNumber,
      sessionLoading,
      signedIn,
      providerReady,
      chromeReady,
      saved,
      savedStatus,
      openAuth,
      callbackUrl,
      toast,
    ],
  );

  return {
    saved,
    pending,
    ready,
    signedIn,
    sessionLoading,
    toggle,
  };
}
