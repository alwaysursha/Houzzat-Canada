/**
 * Durable one-shot pending navigation after a push tap.
 *
 * - sessionStorage: same-origin warm path / in-page reloads
 * - Capacitor Preferences (native): survives Pro platform→tenant origin change
 *
 * Consumption is deferred on the Pro bootstrap host and /pro/* routes so
 * workspace handoff can finish before the deep link runs.
 */

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import { sanitizePushHref } from "@/lib/notifications/push-href";

const SESSION_KEY = "houzzat:pending-push-nav";
const PREF_KEY = "houzzat.pendingPushNav";
const MAX_AGE_MS = 5 * 60 * 1000;

export type PendingPushNav = {
  href: string;
  /** FCM / plugin message id when available — dedupe replays. */
  id?: string;
  storedAt: number;
  /** Bound after auth so a later account cannot inherit the destination. */
  userId?: string;
};

let consumedIds = new Set<string>();
let navigating = false;

/** Test / non-native Preferences stand-in. */
let prefsTestStore: Map<string, string> | null = null;

function isNativePreferences(): boolean {
  if (prefsTestStore) return true;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function readSession(): PendingPushNav | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return parsePending(raw);
  } catch {
    return null;
  }
}

function writeSession(value: PendingPushNav | null) {
  if (typeof window === "undefined") return;
  try {
    if (!value) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

function parsePending(raw: string): PendingPushNav | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PendingPushNav>;
    if (typeof parsed.href !== "string" || typeof parsed.storedAt !== "number") {
      return null;
    }
    return {
      href: parsed.href,
      id: typeof parsed.id === "string" ? parsed.id : undefined,
      storedAt: parsed.storedAt,
      userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
    };
  } catch {
    return null;
  }
}

async function readPreferences(): Promise<PendingPushNav | null> {
  if (!isNativePreferences()) return null;
  try {
    if (prefsTestStore) {
      const raw = prefsTestStore.get(PREF_KEY);
      return raw ? parsePending(raw) : null;
    }
    const { value } = await Preferences.get({ key: PREF_KEY });
    if (!value) return null;
    return parsePending(value);
  } catch {
    return null;
  }
}

async function writePreferences(value: PendingPushNav | null): Promise<void> {
  if (!isNativePreferences()) return;
  try {
    if (prefsTestStore) {
      if (!value) prefsTestStore.delete(PREF_KEY);
      else prefsTestStore.set(PREF_KEY, JSON.stringify(value));
      return;
    }
    if (!value) {
      await Preferences.remove({ key: PREF_KEY });
      return;
    }
    await Preferences.set({ key: PREF_KEY, value: JSON.stringify(value) });
  } catch {
    // ignore
  }
}

function isFresh(pending: PendingPushNav): boolean {
  if (Date.now() - pending.storedAt > MAX_AGE_MS) return false;
  return Boolean(sanitizePushHref(pending.href));
}

function persist(value: PendingPushNav | null) {
  writeSession(value);
  void writePreferences(value);
}

/**
 * True while Pro cold-start / handoff must not hard-navigate to a CRM deep link.
 * Covers app.houzzatpro.com and any host's /pro/* (including tenant handoff exchange).
 */
export function shouldDeferPushNavigationConsume(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const path = window.location.pathname || "/";
    if (path === "/pro" || path.startsWith("/pro/")) return true;
    if (isPlatformMobileBootstrapHost(window.location.hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

/** Pull Preferences into sessionStorage after a cross-origin navigation. */
export async function hydratePendingPushNavigation(): Promise<void> {
  const session = readSession();
  if (session && isFresh(session)) return;

  const fromPrefs = await readPreferences();
  if (!fromPrefs || !isFresh(fromPrefs)) {
    if (session) writeSession(null);
    if (fromPrefs) await writePreferences(null);
    return;
  }
  writeSession(fromPrefs);
}

/** Stash a sanitized destination from a notification tap. */
export function stashPendingPushNavigation(input: {
  href: unknown;
  id?: string | null;
  userId?: string | null;
}): string | null {
  const href = sanitizePushHref(input.href);
  if (!href) return null;
  const id = input.id?.trim() || undefined;
  if (id && consumedIds.has(id)) return null;

  const userId = input.userId?.trim() || undefined;
  persist({
    href,
    id,
    storedAt: Date.now(),
    ...(userId ? { userId } : {}),
  });
  return href;
}

export function peekPendingPushNavigation(): PendingPushNav | null {
  const pending = readSession();
  if (!pending) return null;
  if (!isFresh(pending)) {
    persist(null);
    return null;
  }
  return pending;
}

/**
 * Consume pending push nav exactly once. Returns href or null.
 * Clears storage before the caller navigates to avoid loops on reload.
 */
export function takePendingPushNavigation(options?: {
  expectedUserId?: string | null;
}): string | null {
  if (navigating) return null;
  const pending = peekPendingPushNavigation();
  if (!pending) return null;
  if (pending.id && consumedIds.has(pending.id)) {
    persist(null);
    return null;
  }

  // When a bound userId exists, only enforce mismatch if the caller supplies one.
  const expected = options?.expectedUserId?.trim() || null;
  if (pending.userId && expected && pending.userId !== expected) {
    persist(null);
    return null;
  }

  persist(null);
  if (pending.id) {
    consumedIds.add(pending.id);
    if (consumedIds.size > 40) {
      consumedIds = new Set([...consumedIds].slice(-20));
    }
  }
  return pending.href;
}

/**
 * After tenant session is ready: hydrate Preferences, then take once.
 * Ignores bootstrap-host deferral (caller decides when landing is safe).
 */
export async function takePendingPushNavigationForTenantLanding(options?: {
  expectedUserId?: string | null;
}): Promise<string | null> {
  await hydratePendingPushNavigation();
  return takePendingPushNavigation({
    expectedUserId: options?.expectedUserId,
  });
}

/** Stamp the authenticated user onto an unbound pending destination. */
export function bindPendingPushNavigationUser(userId: string): void {
  const id = userId.trim();
  if (!id) return;
  const pending = peekPendingPushNavigation();
  if (!pending) return;
  if (pending.userId && pending.userId !== id) {
    persist(null);
    return;
  }
  if (pending.userId === id) return;
  persist({ ...pending, userId: id });
}

/** Clear pending push destination (logout / account switch). */
export function clearPendingPushNavigation(): void {
  persist(null);
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
  writeSession(null);
  prefsTestStore?.clear();
}

/** Enable in-memory Preferences for Node selftests (native dual-write path). */
export function __enablePendingPushNavPreferencesForTests() {
  prefsTestStore = new Map();
}

export function __disablePendingPushNavPreferencesForTests() {
  prefsTestStore = null;
}
