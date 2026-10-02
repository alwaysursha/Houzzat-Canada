"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { syncViewListingGate } from "@/lib/auth/view-listing-intent";
import { acquireScrollLock } from "@/lib/scroll-lock";
import {
  browserListingAccessStore,
  getListingAccessServerSnapshot,
  getListingAccessSnapshot,
  getListingAccessUnavailableServerSnapshot,
  getListingAccessUnavailableSnapshot,
  normalizeListingAccessMls,
  notifyListingAccess,
  resolveAnonymousListingAccess,
  setListingAccessWriteFailed,
  subscribeListingAccess,
} from "@/lib/listings/anonymous-listing-access";

/**
 * Client overlay for the anonymous second-listing gate.
 * The server-rendered listing stays in the tree underneath.
 */
export function ListingAccessGate({
  mlsNumber,
  callbackPath,
  signedIn,
  children,
}: {
  mlsNumber: string;
  callbackPath: string;
  signedIn: boolean;
  children: ReactNode;
}) {
  const { status } = useSession();
  const { openAuth, closeAuth } = useAuthModal();
  const closeAuthRef = useRef(closeAuth);
  const blockedRef = useRef(false);
  closeAuthRef.current = closeAuth;
  const presentedMls = useRef<string | null>(null);
  const freeMls = useSyncExternalStore(
    subscribeListingAccess,
    getListingAccessSnapshot,
    getListingAccessServerSnapshot,
  );
  const storageUnavailable = useSyncExternalStore(
    subscribeListingAccess,
    getListingAccessUnavailableSnapshot,
    getListingAccessUnavailableServerSnapshot,
  );
  const normalizedMls = normalizeListingAccessMls(mlsNumber);
  const authenticated = signedIn || status === "authenticated";
  const ready = signedIn || status !== "loading";
  const blocked =
    ready &&
    !authenticated &&
    (storageUnavailable ||
      (freeMls != null && normalizedMls != null && freeMls !== normalizedMls));

  useLayoutEffect(() => {
    if (!ready || authenticated || !normalizedMls) return;
    const decision = resolveAnonymousListingAccess(
      browserListingAccessStore(),
      normalizedMls,
    );
    setListingAccessWriteFailed(decision.access === "storage_unavailable");
    notifyListingAccess();
  }, [ready, authenticated, normalizedMls]);

  blockedRef.current = blocked;

  useEffect(() => {
    if (!blocked) return;
    return acquireScrollLock();
  }, [blocked]);

  useEffect(() => {
    return () => {
      if (blockedRef.current) closeAuthRef.current();
    };
  }, []);

  useLayoutEffect(() => {
    if (!blocked || !normalizedMls) return;
    syncViewListingGate({
      blocked: true,
      mlsNumber: normalizedMls,
      callbackPath,
      host: window.location.hostname,
      now: Date.now(),
      store: browserCaptureIntentStore(),
    });
    if (presentedMls.current === normalizedMls) return;
    presentedMls.current = normalizedMls;
    openAuth({
      mode: "sign-up",
      callbackUrl: callbackPath,
      intent: "VIEW_LISTING",
    });
  }, [blocked, normalizedMls, callbackPath, openAuth]);

  return (
    <>
      <div className="listing-detail-type" inert={blocked ? true : undefined}>
        {children}
      </div>
      {blocked ? (
        <button
          type="button"
          className="fixed inset-0 z-[95] flex items-end justify-center bg-ink/35 px-4 py-8 sm:items-center"
          onClick={() =>
            openAuth({
              mode: "sign-up",
              callbackUrl: callbackPath,
              intent: "VIEW_LISTING",
            })
          }
        >
          <span className="rounded-xl bg-canopy px-5 py-3 text-sm font-semibold text-white shadow-lg">
            Sign in to view this listing
          </span>
        </button>
      ) : null}
    </>
  );
}
