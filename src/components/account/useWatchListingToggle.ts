"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { usePropertyWatchesStatus } from "@/components/account/PropertyWatchesProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { useListingAccountChrome } from "@/components/listings/ListingAccountChromeProvider";
import { notifyPropertyWatchesChanged } from "@/lib/account/watch-sync";
import {
  openGuestPropertyWatchIntent,
  retainPropertyWatchIntentHandler,
} from "@/lib/auth/property-watch-intent";
import { SITE_MESSAGES } from "@/lib/site-messages";

export function useWatchListingToggle({
  mlsNumber,
  authCallbackUrl,
  initiallyWatching = false,
  confirmUnwatch = true,
}: {
  mlsNumber: string;
  authCallbackUrl?: string;
  initiallyWatching?: boolean;
  /** When false, skip the stop-watching confirm dialog (mobile bar already confirms). */
  confirmUnwatch?: boolean;
}) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const sessionLoading = status === "loading";
  const watchStatus = usePropertyWatchesStatus();
  const chrome = useListingAccountChrome();
  const { openAuth } = useAuthModal();
  const { confirm, toast, alert } = useSiteAlert();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    return retainPropertyWatchIntentHandler({
      onWatched: () => {
        void alert({ ...SITE_MESSAGES.watchAdded });
      },
      onVerification: () => {
        toast({
          message: SITE_MESSAGES.watchRequiresEmailVerificationToast,
          tone: "error",
        });
      },
      onFailed: () => {
        toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      },
    });
  }, [alert, toast]);

  const callbackUrl = authCallbackUrl ?? `/listing/${mlsNumber}`;
  const providerReady = Boolean(watchStatus?.ready);
  const chromeReady = chrome.active && chrome.loaded;

  const watching = useMemo(() => {
    if (!signedIn) return false;
    if (providerReady) return watchStatus!.isWatching(mlsNumber);
    if (chromeReady) return chrome.watching;
    return initiallyWatching;
  }, [
    signedIn,
    providerReady,
    watchStatus,
    mlsNumber,
    chromeReady,
    chrome.watching,
    initiallyWatching,
  ]);

  const ready = !signedIn
    ? true
    : sessionLoading
      ? false
      : providerReady || chromeReady;

  const toggle = useCallback(async () => {
    if (pendingRef.current) return;
    if (!mlsNumber.trim()) return;
    if (sessionLoading) return;

    if (!signedIn) {
      openGuestPropertyWatchIntent({
        mlsNumber,
        callbackPath: callbackUrl,
        host: window.location.hostname,
        now: Date.now(),
        store: browserCaptureIntentStore(),
        openAuth,
      });
      return;
    }

    if (!providerReady && !chromeReady) return;

    const next = !watching;
    if (!next && confirmUnwatch) {
      const ok = await confirm({
        ...SITE_MESSAGES.stopWatchingHome,
        destructive: true,
      });
      if (!ok) return;
    }

    pendingRef.current = true;
    setPending(true);
    watchStatus?.setWatchingState(mlsNumber, next);

    try {
      const res = await fetch("/api/account/property-monitors", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mlsNumber }),
        credentials: "same-origin",
      });

      if (!res.ok) {
        watchStatus?.setWatchingState(mlsNumber, !next);
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
          // non-JSON
        }
        if (requiresAuth) {
          openAuth({ mode: "sign-in", callbackUrl });
          return;
        }
        if (requiresEmailVerification) {
          toast({
            message: SITE_MESSAGES.watchRequiresEmailVerificationToast,
            tone: "error",
          });
          return;
        }
        toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
        return;
      }

      notifyPropertyWatchesChanged();

      if (next) {
        await alert({ ...SITE_MESSAGES.watchAdded });
      } else {
        toast({ message: SITE_MESSAGES.watchRemovedToast, tone: "info" });
      }
    } catch {
      watchStatus?.setWatchingState(mlsNumber, !next);
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [
    mlsNumber,
    sessionLoading,
    signedIn,
    providerReady,
    chromeReady,
    watching,
    confirmUnwatch,
    watchStatus,
    openAuth,
    callbackUrl,
    confirm,
    toast,
    alert,
  ]);

  return {
    watching,
    pending,
    ready,
    signedIn,
    toggle,
  };
}
