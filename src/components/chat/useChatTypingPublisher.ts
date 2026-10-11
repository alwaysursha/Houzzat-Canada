"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  shouldSendTypingHeartbeat,
  TYPING_HEARTBEAT_MS,
  TYPING_IDLE_STOP_MS,
} from "@/lib/chat/typing/client";

/**
 * Publishes ephemeral typing heartbeats. Never sends draft text.
 * Clears on idle, disable, scope change, and unmount (best-effort).
 */
export function useChatTypingPublisher(input: {
  enabled: boolean;
  scopeKey: string | null;
  publish: (active: boolean) => Promise<boolean>;
}) {
  const enabledRef = useRef(input.enabled);
  const scopeRef = useRef(input.scopeKey);
  const publishRef = useRef(input.publish);
  enabledRef.current = input.enabled;
  scopeRef.current = input.scopeKey;
  publishRef.current = input.publish;

  const lastSentAtRef = useRef<number | null>(null);
  const locallyActiveRef = useRef(false);
  const inFlightRef = useRef(false);
  const pendingClearRef = useRef(false);
  const heartbeatTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current != null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const send = useCallback(async (active: boolean) => {
    if (!enabledRef.current || !scopeRef.current) {
      if (!active) {
        locallyActiveRef.current = false;
        lastSentAtRef.current = null;
      }
      return;
    }
    if (inFlightRef.current) {
      if (!active) pendingClearRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      const ok = await publishRef.current(active);
      if (ok) {
        locallyActiveRef.current = active;
        lastSentAtRef.current = active ? Date.now() : null;
      }
    } finally {
      inFlightRef.current = false;
      if (pendingClearRef.current) {
        pendingClearRef.current = false;
        void send(false);
      }
    }
  }, []);

  const clearTyping = useCallback(() => {
    clearIdle();
    clearHeartbeat();
    if (locallyActiveRef.current || lastSentAtRef.current != null) {
      void send(false);
    }
    locallyActiveRef.current = false;
    lastSentAtRef.current = null;
  }, [clearHeartbeat, clearIdle, send]);

  const bumpHeartbeat = useCallback(() => {
    clearHeartbeat();
    heartbeatTimerRef.current = window.setInterval(() => {
      if (!enabledRef.current || !scopeRef.current || !locallyActiveRef.current) {
        clearHeartbeat();
        return;
      }
      if (
        shouldSendTypingHeartbeat({
          now: Date.now(),
          lastSentAt: lastSentAtRef.current,
        })
      ) {
        void send(true);
      }
    }, TYPING_HEARTBEAT_MS);
  }, [clearHeartbeat, send]);

  const signalTyping = useCallback(() => {
    if (!enabledRef.current || !scopeRef.current) return;

    clearIdle();
    idleTimerRef.current = window.setTimeout(() => {
      clearHeartbeat();
      void send(false);
      locallyActiveRef.current = false;
    }, TYPING_IDLE_STOP_MS);

    const now = Date.now();
    const shouldPulse = shouldSendTypingHeartbeat({
      now,
      lastSentAt: lastSentAtRef.current,
    });
    if (!locallyActiveRef.current || shouldPulse) {
      locallyActiveRef.current = true;
      void send(true);
    }
    bumpHeartbeat();
  }, [bumpHeartbeat, clearHeartbeat, clearIdle, send]);

  useEffect(() => {
    if (!input.enabled || !input.scopeKey) {
      clearTyping();
    }
  }, [input.enabled, input.scopeKey, clearTyping]);

  useEffect(() => {
    return () => {
      clearIdle();
      clearHeartbeat();
      if (locallyActiveRef.current || lastSentAtRef.current != null) {
        void publishRef.current(false);
      }
      locallyActiveRef.current = false;
      lastSentAtRef.current = null;
    };
  }, [clearHeartbeat, clearIdle]);

  return { signalTyping, clearTyping };
}
