/**
 * Stage 5.11 — Bootstrap FCM registration + tap handling when workspace is active.
 */

import { useEffect } from "react";
import {
  getInitialPushNotification,
  subscribeFcmOpened,
  subscribeFcmTokenRefresh,
} from "../lib/fcm-bridge";
import { publishPushNavigation } from "../lib/push-navigation";
import {
  onFcmTokenRefresh,
  registerHouzzatProPush,
} from "../lib/push-registration";
import { useAuth } from "../state/AuthContext";

export function PushRegistrationBootstrap() {
  const { state, user } = useAuth();
  const userId = user?.id ?? null;
  const active = state === "WORKSPACE_ACTIVE" && Boolean(userId);

  useEffect(() => {
    if (!active || !userId) return;
    void registerHouzzatProPush(userId);
  }, [active, userId]);

  useEffect(() => {
    if (!active || !userId) return;
    return subscribeFcmTokenRefresh((token) => {
      void onFcmTokenRefresh(token, userId);
    });
  }, [active, userId]);

  useEffect(() => {
    const unsub = subscribeFcmOpened(({ href, type }) => {
      publishPushNavigation(href, type);
    });
    void getInitialPushNotification().then((initial) => {
      if (initial) publishPushNavigation(initial.href, initial.type);
    });
    return unsub;
  }, []);

  return null;
}
