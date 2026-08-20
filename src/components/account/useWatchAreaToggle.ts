"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import {
  invalidateAreaMonitorsCache,
  loadAreaMonitorsCache,
  patchAreaMonitorsCache,
  peekAreaMonitorsCache,
  subscribeAreaMonitorsCache,
  type AreaMonitorCacheRow,
} from "@/components/account/area-monitors-cache";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import {
  isAreaWatchesChangedMessage,
  isAreaWatchesRevStorageKey,
  AREA_WATCHES_CHANGED_EVENT,
  notifyAreaWatchesChanged,
} from "@/lib/account/watch-sync";
import { SITE_MESSAGES } from "@/lib/site-messages";

function watchSegmentOf(
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "ALL" | string,
): "RESIDENTIAL" | "COMMERCIAL" {
  return segment === "COMMERCIAL" ? "COMMERCIAL" : "RESIDENTIAL";
}

function matchesMonitor(
  item: AreaMonitorCacheRow,
  city: string,
  community: string | null,
  transactionType: string,
  segment: string,
) {
  return (
    item.city.toLowerCase() === city.toLowerCase() &&
    (item.community ?? null) === community &&
    item.transactionType === transactionType &&
    (item.segment ?? "RESIDENTIAL") === segment
  );
}

export function useWatchAreaToggle({
  city,
  community,
  transactionType,
  segment,
  authCallbackUrl = "/search",
}: {
  city: string;
  community?: string | null;
  transactionType: "SALE" | "LEASE" | "ALL";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | "ALL" | string;
  authCallbackUrl?: string;
}) {
  const { status, data: session } = useSession();
  const signedIn = status === "authenticated";
  const sessionLoading = status === "loading";
  const userKey = session?.user?.email ?? session?.user?.id ?? "anon";
  const { openAuth } = useAuthModal();
  const { confirm, toast } = useSiteAlert();
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(!signedIn);
  const [, setTick] = useState(0);
  const pendingRef = useRef(false);

  const canWatch = Boolean(city.trim());
  const normalizedCommunity = community?.trim() || null;
  const normalizedTxn = transactionType === "ALL" ? "ALL" : transactionType;
  const normalizedSegment = watchSegmentOf(segment);

  useEffect(() => {
    return subscribeAreaMonitorsCache(() => setTick((n) => n + 1));
  }, []);

  useEffect(() => {
    function onChanged() {
      invalidateAreaMonitorsCache();
      if (signedIn) {
        void loadAreaMonitorsCache(userKey).then(() => setReady(true));
      }
    }
    function onStorage(event: StorageEvent) {
      if (isAreaWatchesRevStorageKey(event.key)) onChanged();
    }
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isAreaWatchesChangedMessage(event.data)) return;
      onChanged();
    }
    window.addEventListener(AREA_WATCHES_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener(AREA_WATCHES_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
    };
  }, [signedIn, userKey]);

  useEffect(() => {
    if (!signedIn || !canWatch) {
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(Boolean(peekAreaMonitorsCache(userKey)));
    void loadAreaMonitorsCache(userKey).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, canWatch, userKey]);

  const items = peekAreaMonitorsCache(userKey) ?? [];
  const match = useMemo(
    () =>
      items.find((item) =>
        matchesMonitor(
          item,
          city.trim(),
          normalizedCommunity,
          normalizedTxn,
          normalizedSegment,
        ),
      ) ?? null,
    [items, city, normalizedCommunity, normalizedTxn, normalizedSegment],
  );

  const watching = Boolean(match);
  const monitorId = match?.id ?? null;

  const toggle = useCallback(async () => {
    if (pendingRef.current) return;
    if (!canWatch) return;
    if (sessionLoading) return;

    if (!signedIn) {
      openAuth({ mode: "sign-in", callbackUrl: authCallbackUrl });
      return;
    }

    if (watching) {
      const ok = await confirm({
        ...SITE_MESSAGES.removeAreaWatch,
        destructive: true,
      });
      if (!ok) return;

      pendingRef.current = true;
      setPending(true);
      const previous = match;
      patchAreaMonitorsCache(userKey, (list) =>
        list.filter((item) => item.id !== previous?.id),
      );

      try {
        const res = await fetch("/api/account/area-monitors", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(
            previous?.id
              ? { id: previous.id }
              : {
                  city: city.trim(),
                  community: normalizedCommunity,
                  transactionType: normalizedTxn,
                  segment: normalizedSegment,
                },
          ),
        });
        if (!res.ok) {
          if (previous) {
            patchAreaMonitorsCache(userKey, (list) => [...list, previous]);
          }
          let requiresEmailVerification = res.status === 403;
          try {
            const data = (await res.json()) as {
              requiresEmailVerification?: boolean;
            };
            if (data.requiresEmailVerification) requiresEmailVerification = true;
          } catch {
            // ignore
          }
          toast({
            message: requiresEmailVerification
              ? SITE_MESSAGES.watchRequiresEmailVerificationToast
              : SITE_MESSAGES.genericErrorToast,
            tone: "error",
          });
          return;
        }
        notifyAreaWatchesChanged();
        toast({ message: SITE_MESSAGES.areaRemovedToast, tone: "info" });
      } catch {
        if (previous) {
          patchAreaMonitorsCache(userKey, (list) => [...list, previous]);
        }
        toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
      return;
    }

    pendingRef.current = true;
    setPending(true);
    const optimistic: AreaMonitorCacheRow = {
      id: `optimistic-${Date.now()}`,
      city: city.trim(),
      community: normalizedCommunity,
      transactionType: normalizedTxn,
      segment: normalizedSegment,
    };
    patchAreaMonitorsCache(userKey, (list) => [...list, optimistic]);

    try {
      const res = await fetch("/api/account/area-monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          city: city.trim(),
          community: normalizedCommunity,
          transactionType: normalizedTxn,
          segment: normalizedSegment,
          notifyNew: true,
          notifySold: true,
        }),
      });
      if (!res.ok) {
        patchAreaMonitorsCache(userKey, (list) =>
          list.filter((item) => item.id !== optimistic.id),
        );
        let requiresEmailVerification = res.status === 403;
        try {
          const data = (await res.json()) as {
            requiresEmailVerification?: boolean;
          };
          if (data.requiresEmailVerification) requiresEmailVerification = true;
        } catch {
          // ignore
        }
        toast({
          message: requiresEmailVerification
            ? SITE_MESSAGES.watchRequiresEmailVerificationToast
            : SITE_MESSAGES.genericErrorToast,
          tone: "error",
        });
        return;
      }
      const data = (await res.json()) as { item?: AreaMonitorCacheRow };
      patchAreaMonitorsCache(userKey, (list) => {
        const withoutOptimistic = list.filter(
          (item) => item.id !== optimistic.id,
        );
        if (data.item) {
          const exists = withoutOptimistic.some((item) => item.id === data.item!.id);
          return exists ? withoutOptimistic : [...withoutOptimistic, data.item];
        }
        return withoutOptimistic;
      });
      notifyAreaWatchesChanged();
      toast({ message: SITE_MESSAGES.areaWatchedToast, tone: "success" });
    } catch {
      patchAreaMonitorsCache(userKey, (list) =>
        list.filter((item) => item.id !== optimistic.id),
      );
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [
    canWatch,
    sessionLoading,
    signedIn,
    watching,
    match,
    userKey,
    city,
    normalizedCommunity,
    normalizedTxn,
    normalizedSegment,
    authCallbackUrl,
    openAuth,
    confirm,
    toast,
  ]);

  return {
    watching,
    monitorId,
    pending,
    ready: ready || !signedIn,
    canWatch,
    signedIn,
    toggle,
  };
}
