"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  postAgentPresence,
  preferenceFromAvailability,
  PRESENCE_ACTIVITY_THROTTLE_MS,
  PRESENCE_CLIENT_HEARTBEAT_MS,
  PRESENCE_CLIENT_IDLE_MS,
  shouldSendPresenceHeartbeat,
  type AgentAvailabilityPreference,
} from "@/lib/chat/presence/client";

export type AgentPresencePublisherState = {
  preference: AgentAvailabilityPreference;
  preferencePending: boolean;
  preferenceError: string | null;
  setPreference: (next: AgentAvailabilityPreference) => Promise<boolean>;
};

/**
 * Genuine-activity presence publisher + manual Available/Away preference.
 * Mount via AgentPresenceProvider only (one instance per AgentShell tree).
 * Idle / hidden / AWAY stop heartbeats; inactivity never mutates preference.
 */
export function useAgentPresencePublisher(): AgentPresencePublisherState {
  const [preference, setPreferenceState] =
    useState<AgentAvailabilityPreference>("AVAILABLE");
  const [preferencePending, setPreferencePending] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  const preferenceRef = useRef(preference);
  preferenceRef.current = preference;

  const lastActivityAtRef = useRef<number | null>(null);
  const lastActivityMarkAtRef = useRef(0);
  const lastSentAtRef = useRef<number | null>(null);
  const locallyActiveRef = useRef(false);
  const inFlightRef = useRef(false);
  const pendingClearRef = useRef(false);
  const retryUntilRef = useRef(0);
  const heartbeatTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current != null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const sendActive = useCallback(async (active: boolean) => {
    if (preferenceRef.current === "AWAY" && active) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden" &&
      active
    ) {
      return;
    }
    const now = Date.now();
    if (active && now < retryUntilRef.current) return;

    if (inFlightRef.current) {
      if (!active) pendingClearRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      const result = await postAgentPresence(
        { active },
        { keepalive: !active },
      );
      if (!result.ok) {
        if (result.status === 429 && result.retryAfterSec) {
          retryUntilRef.current = Date.now() + result.retryAfterSec * 1000;
        }
        return;
      }
      retryUntilRef.current = 0;
      locallyActiveRef.current = active;
      lastSentAtRef.current = active ? Date.now() : null;
      if (mountedRef.current) {
        setPreferenceState(preferenceFromAvailability(result.availability));
      }
    } finally {
      inFlightRef.current = false;
      if (pendingClearRef.current) {
        pendingClearRef.current = false;
        void sendActive(false);
      }
    }
  }, []);

  const stopPresence = useCallback(() => {
    clearIdleTimer();
    clearHeartbeatTimer();
    if (locallyActiveRef.current || lastSentAtRef.current != null) {
      void sendActive(false);
    }
    locallyActiveRef.current = false;
    lastSentAtRef.current = null;
  }, [clearHeartbeatTimer, clearIdleTimer, sendActive]);

  const bumpHeartbeat = useCallback(() => {
    clearHeartbeatTimer();
    heartbeatTimerRef.current = window.setInterval(() => {
      if (preferenceRef.current !== "AVAILABLE") {
        clearHeartbeatTimer();
        return;
      }
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        stopPresence();
        return;
      }
      const lastActivity = lastActivityAtRef.current;
      if (
        lastActivity == null ||
        Date.now() - lastActivity >= PRESENCE_CLIENT_IDLE_MS
      ) {
        stopPresence();
        return;
      }
      if (
        shouldSendPresenceHeartbeat({
          now: Date.now(),
          lastSentAt: lastSentAtRef.current,
        })
      ) {
        void sendActive(true);
      }
    }, PRESENCE_CLIENT_HEARTBEAT_MS);
  }, [clearHeartbeatTimer, sendActive, stopPresence]);

  const onGenuineActivity = useCallback(() => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastActivityMarkAtRef.current < PRESENCE_ACTIVITY_THROTTLE_MS) {
      lastActivityAtRef.current = now;
      return;
    }
    lastActivityMarkAtRef.current = now;
    lastActivityAtRef.current = now;

    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      stopPresence();
    }, PRESENCE_CLIENT_IDLE_MS);

    if (preferenceRef.current !== "AVAILABLE") return;

    const shouldPulse = shouldSendPresenceHeartbeat({
      now,
      lastSentAt: lastSentAtRef.current,
    });
    if (!locallyActiveRef.current || shouldPulse) {
      void sendActive(true);
    }
    bumpHeartbeat();
  }, [bumpHeartbeat, clearIdleTimer, sendActive, stopPresence]);

  const setPreference = useCallback(
    async (next: AgentAvailabilityPreference) => {
      if (preferencePending) return false;
      setPreferencePending(true);
      setPreferenceError(null);
      try {
        const result = await postAgentPresence({ preference: next });
        if (!result.ok) {
          if (result.status === 429 && result.retryAfterSec) {
            retryUntilRef.current = Date.now() + result.retryAfterSec * 1000;
            setPreferenceError("Too many updates. Try again shortly.");
          } else {
            setPreferenceError("Could not update availability.");
          }
          return false;
        }
        const confirmed =
          next === "AWAY"
            ? result.availability === "away"
            : result.availability !== "away";
        if (!confirmed) {
          setPreferenceError("Could not update availability.");
          setPreferenceState(preferenceFromAvailability(result.availability));
          return false;
        }
        setPreferenceState(next);
        if (next === "AWAY") {
          stopPresence();
        } else if (
          lastActivityAtRef.current != null &&
          Date.now() - lastActivityAtRef.current < PRESENCE_CLIENT_IDLE_MS &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          void sendActive(true);
          bumpHeartbeat();
        }
        return true;
      } catch {
        setPreferenceError("Could not update availability.");
        return false;
      } finally {
        setPreferencePending(false);
      }
    },
    [bumpHeartbeat, preferencePending, sendActive, stopPresence],
  );

  useEffect(() => {
    mountedRef.current = true;

    void postAgentPresence({ active: false }).then((result) => {
      if (!result.ok || !mountedRef.current) return;
      setPreferenceState(preferenceFromAvailability(result.availability));
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopPresence();
      }
    };
    const onPageHide = () => {
      void postAgentPresence({ active: false }, { keepalive: true });
      locallyActiveRef.current = false;
      lastSentAtRef.current = null;
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "click",
      "scroll",
    ];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, onGenuineActivity, {
        capture: true,
        passive: true,
      });
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      mountedRef.current = false;
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, onGenuineActivity, true);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      clearIdleTimer();
      clearHeartbeatTimer();
      void postAgentPresence({ active: false }, { keepalive: true });
    };
  }, [clearHeartbeatTimer, clearIdleTimer, onGenuineActivity, stopPresence]);

  return {
    preference,
    preferencePending,
    preferenceError,
    setPreference,
  };
}
