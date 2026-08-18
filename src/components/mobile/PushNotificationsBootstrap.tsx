"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useSession } from "next-auth/react";
import { resolveAppShell } from "@/lib/mobile/app-shell";

/**
 * Registers the native FCM/APNs token after sign-in.
 * No-ops on web or if the Push plugin / permission is unavailable.
 */
export function PushNotificationsBootstrap() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let remove: (() => void) | null = null;

    void (async () => {
      try {
        const shell = await resolveAppShell();
        if (cancelled) return;
        if (shell !== "houzzat" && shell !== "houzzatpro") return;

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") return;

        const handle = await PushNotifications.addListener(
          "registration",
          (token) => {
            const value = token.value?.trim();
            if (!value) return;
            void fetch("/api/notifications/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: value,
                platform: Capacitor.getPlatform() === "ios" ? "ios" : "android",
                shell,
              }),
            });
          },
        );
        remove = () => {
          void handle.remove();
        };
        if (cancelled) {
          remove();
          return;
        }
        await PushNotifications.register();
      } catch {
        // Plugin missing until native cap sync + Firebase config.
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [status]);

  return null;
}
