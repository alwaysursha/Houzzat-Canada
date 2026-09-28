import {
  peekPendingIntent,
  type CaptureIntent,
  type CaptureIntentContext,
  type CaptureIntentRejectReason,
  type CaptureIntentStore,
  type CaptureIntentType,
} from "@/lib/auth/capture-intent";

/**
 * Feature modules register one handler per intent type.
 * A valid intent stays stored until its handler is registered.
 */
export type CaptureIntentHandler = (
  intent: CaptureIntent,
) => void | Promise<void>;

export type CaptureIntentDispatchResult =
  | { status: "none" }
  | { status: "waiting"; intent: CaptureIntent }
  | { status: "rejected"; reason: Exclude<CaptureIntentRejectReason, "none"> }
  | { status: "ready"; intent: CaptureIntent; handled: true };

const handlers = new Map<CaptureIntentType, CaptureIntentHandler>();
const listeners = new Set<() => void>();

function notifyHandlers(): void {
  for (const listener of [...listeners]) listener();
}

export function registerCaptureIntentHandler(
  type: CaptureIntentType,
  handler: CaptureIntentHandler,
): () => void {
  handlers.set(type, handler);
  notifyHandlers();
  return () => {
    if (handlers.get(type) === handler) handlers.delete(type);
  };
}

export function subscribeCaptureIntentHandlers(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Claim a pending intent only when its handler is registered.
 * Invalid records are cleared. A missing handler leaves the intent stored.
 * The claim happens before the handler runs, so a refresh cannot run it twice.
 */
export function dispatchPendingCaptureIntent(
  store: CaptureIntentStore,
  ctx: CaptureIntentContext,
): CaptureIntentDispatchResult {
  const peeked = peekPendingIntent(store, ctx);
  if (!peeked.ok) {
    if (peeked.reason === "none") return { status: "none" };
    store.remove();
    return { status: "rejected", reason: peeked.reason };
  }

  const handler = handlers.get(peeked.intent.type);
  if (!handler) {
    return { status: "waiting", intent: peeked.intent };
  }

  store.remove();
  try {
    const result = handler(peeked.intent);
    if (
      result != null &&
      typeof (result as Promise<void>).then === "function"
    ) {
      void (result as Promise<void>).catch(() => {
        // Already claimed. A failed resume must not be written back.
      });
    }
  } catch {
    // Already claimed. Do not restore the intent.
  }

  return { status: "ready", intent: peeked.intent, handled: true };
}
