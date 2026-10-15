"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useSession } from "next-auth/react";
import {
  bindPendingPushNavigationUser,
  consumePendingPushNavigation,
  ensurePushActionListener,
  flushPendingPushUnregister,
  hydratePendingPushNavigation,
  registerPushForSession,
  schedulePushRegistration,
} from "@/lib/notifications/push-client";

/**
 * Native push bootstrap for Houzzat / HouzzatPro shells.
 * - Tap listener attaches early (cold-start retained events).
 * - FCM register waits until after first paint + authenticated.
 * - Does not re-prompt after an explicit denial.
 * - Pro bootstrap host defers deep-link consume until tenant landing.
 */
export function PushNotificationsBootstrap() {
  const { status, data } = useSession();
  const registeredForSession = useRef<string | null>(null);
  const userId = data?.user?.id ?? null;

  // Tap routing + offline unregister — independent of auth.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void (async () => {
      await flushPendingPushUnregister();
      if (cancelled) return;
      await hydratePendingPushNavigation();
      if (cancelled) return;
      await ensurePushActionListener();
      if (cancelled) return;
      consumePendingPushNavigation();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // After Home paint: register when signed in (deferred permission).
  useEffect(() => {
    if (status !== "authenticated" || !userId) {
      registeredForSession.current = null;
      return;
    }
    if (!Capacitor.isNativePlatform()) return;
    if (registeredForSession.current === userId) return;

    let cancelled = false;
    const cancelSchedule = schedulePushRegistration(() => {
      if (cancelled) return;
      if (registeredForSession.current === userId) return;
      registeredForSession.current = userId;
      void registerPushForSession({ userId });
    });

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [status, userId]);

  // Bind pending tap to this account; consume only when not on Pro bootstrap/handoff.
  useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated" && userId) {
      void hydratePendingPushNavigation().then(() => {
        bindPendingPushNavigationUser(userId);
        consumePendingPushNavigation({ expectedUserId: userId });
      });
      return;
    }
    consumePendingPushNavigation();
  }, [status, userId]);

  return null;
}
