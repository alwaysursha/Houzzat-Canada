/**
 * Stage 5.11 — in-app push tap navigation bus (no WebView / hostname).
 */

import type { PushNavTarget } from "./push-href";
import { resolvePushNavTarget } from "./push-href";

type Listener = (target: PushNavTarget) => void;

const listeners = new Set<Listener>();
let pending: PushNavTarget | null = null;

export function publishPushNavigation(rawHref: unknown, rawType?: unknown): void {
  void rawType;
  const target = resolvePushNavTarget(rawHref);
  if (listeners.size === 0) {
    pending = target;
    return;
  }
  pending = null;
  for (const listener of listeners) {
    try {
      listener(target);
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribePushNavigation(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const next = pending;
    pending = null;
    try {
      listener(next);
    } catch {
      // ignore
    }
  }
  return () => {
    listeners.delete(listener);
  };
}
