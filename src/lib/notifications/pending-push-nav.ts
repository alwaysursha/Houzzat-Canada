/**
 * Durable one-shot pending navigation after a push tap (cold-start safe).
 * sessionStorage survives WebView reload within the same session; not ordinary
 * background→foreground without a new tap.
 */

import { sanitizePushHref } from "@/lib/notifications/push-href";

const KEY = "houzzat:pending-push-nav";
const MAX_AGE_MS = 5 * 60 * 1000;

type PendingPushNav = {
  href: string;
  /** FCM / plugin message id when available — dedupe replays. */
  id?: string;
  storedAt: number;
};

let consumedIds = new Set<string>();
let navigating = false;

function readRaw(): PendingPushNav | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPushNav>;
    if (typeof parsed.href !== "string" || typeof parsed.storedAt !== "number") {
      return null;
    }
    return {
      href: parsed.href,
      id: typeof parsed.id === "string" ? parsed.id : undefined,
      storedAt: parsed.storedAt,
    };
  } catch {
    return null;
  }
}

function writeRaw(value: PendingPushNav | null) {
  if (typeof window === "undefined") return;
  try {
    if (!value) {
      sessionStorage.removeItem(KEY);
      return;
    }
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

/** Stash a sanitized destination from a notification tap. */
export function stashPendingPushNavigation(input: {
  href: unknown;
  id?: string | null;
}): string | null {
  const href = sanitizePushHref(input.href);
  if (!href) return null;
  const id = input.id?.trim() || undefined;
  if (id && consumedIds.has(id)) return null;

  writeRaw({
    href,
    id,
    storedAt: Date.now(),
  });
  return href;
}

export function peekPendingPushNavigation(): PendingPushNav | null {
  const pending = readRaw();
  if (!pending) return null;
  if (Date.now() - pending.storedAt > MAX_AGE_MS) {
    writeRaw(null);
    return null;
  }
  if (!sanitizePushHref(pending.href)) {
    writeRaw(null);
    return null;
  }
  return pending;
}

/**
 * Consume pending push nav exactly once. Returns href or null.
 * Clears storage before the caller navigates to avoid loops on reload.
 */
export function takePendingPushNavigation(): string | null {
  if (navigating) return null;
  const pending = peekPendingPushNavigation();
  if (!pending) return null;
  if (pending.id && consumedIds.has(pending.id)) {
    writeRaw(null);
    return null;
  }

  writeRaw(null);
  if (pending.id) {
    consumedIds.add(pending.id);
    // Bound memory in long-lived WebViews.
    if (consumedIds.size > 40) {
      consumedIds = new Set([...consumedIds].slice(-20));
    }
  }
  return pending.href;
}

export function markPushNavigationStarted() {
  navigating = true;
}

export function markPushNavigationFinished() {
  navigating = false;
}

/** Test helper — reset module state. */
export function __resetPendingPushNavigationForTests() {
  consumedIds = new Set();
  navigating = false;
  writeRaw(null);
}
