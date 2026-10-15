"use client";

/**
 * After qualification completes, wait ~60s of active browsing, then arm the
 * Customer Introduction welcome (appears in chat). Skips inactive tabs,
 * abandoned funnels, and duplicate tabs/sessions.
 */

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const ACTIVE_MS = 60_000;
const TICK_MS = 1_000;
const STORAGE_PREFIX = "houzzat:welcome-intro:";
export const QUALIFICATION_COMPLETED_EVENT = "houzzat:qualification-completed";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readState(userId: string): "armed" | "done" | null {
  try {
    const v = localStorage.getItem(storageKey(userId));
    if (v === "armed" || v === "done") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeState(userId: string, state: "armed" | "done") {
  try {
    localStorage.setItem(storageKey(userId), state);
  } catch {
    /* ignore */
  }
}

export function CustomerWelcomeChatScheduler() {
  const { status, data } = useSession();
  const userId = data?.user?.id ?? null;
  const activeMs = useRef(0);
  const interacted = useRef(false);
  const qualified = useRef(false);
  const fired = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    if (fired.current) return;
    const existing = readState(userId);
    if (existing === "done") {
      fired.current = true;
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    function onInteract() {
      interacted.current = true;
    }

    function onQualified() {
      qualified.current = true;
      activeMs.current = 0;
      interacted.current = false;
    }

    const interactEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    for (const ev of interactEvents) {
      window.addEventListener(ev, onInteract, { passive: true });
    }
    window.addEventListener(QUALIFICATION_COMPLETED_EVENT, onQualified);

    async function refreshQualified() {
      try {
        const res = await fetch("/api/auth/qualification", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          qualificationCompletedAt?: string | null;
        };
        if (body.qualificationCompletedAt) {
          qualified.current = true;
        }
      } catch {
        /* ignore */
      }
    }

    async function tryFire() {
      if (cancelled || fired.current || !userId) return;
      fired.current = true;
      writeState(userId, "armed");
      try {
        const res = await fetch("/api/auth/welcome-introduction", {
          method: "POST",
          credentials: "same-origin",
        });
        if (res.ok || res.status === 409) {
          writeState(userId, "done");
        } else {
          fired.current = false;
          try {
            localStorage.removeItem(storageKey(userId));
          } catch {
            /* ignore */
          }
        }
      } catch {
        fired.current = false;
      }
    }

    void refreshQualified();

    timer = window.setInterval(() => {
      if (cancelled || fired.current) return;
      if (!qualified.current) return;
      if (document.visibilityState !== "visible") return;
      if (!interacted.current) return;
      activeMs.current += TICK_MS;
      if (activeMs.current < ACTIVE_MS) return;
      void tryFire();
    }, TICK_MS);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
      for (const ev of interactEvents) {
        window.removeEventListener(ev, onInteract);
      }
      window.removeEventListener(QUALIFICATION_COMPLETED_EVENT, onQualified);
    };
  }, [status, userId]);

  return null;
}
