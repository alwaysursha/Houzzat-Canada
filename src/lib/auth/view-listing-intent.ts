import {
  createCaptureIntent,
  peekPendingIntent,
  saveCaptureIntent,
  type CaptureIntent,
  type CaptureIntentStore,
} from "@/lib/auth/capture-intent";
import { registerCaptureIntentHandler } from "@/lib/auth/capture-intent-dispatch";

export type ViewListingIntentWrite = "created" | "kept" | "skipped" | "invalid";

/**
 * Store VIEW_LISTING only while the visitor is blocked.
 * A valid non-view intent already in the single slot is left alone.
 * The same VIEW_LISTING is not rewritten on a rerender.
 */
export function syncViewListingGate(input: {
  blocked: boolean;
  mlsNumber: string;
  callbackPath: string;
  host: string;
  now: number;
  store: CaptureIntentStore;
}): ViewListingIntentWrite {
  if (!input.blocked) return "skipped";

  const peeked = peekPendingIntent(input.store, {
    host: input.host,
    now: input.now,
  });
  if (peeked.ok && peeked.intent.type !== "VIEW_LISTING") return "kept";
  if (
    peeked.ok &&
    peeked.intent.type === "VIEW_LISTING" &&
    peeked.intent.mlsNumber === input.mlsNumber.trim().toUpperCase() &&
    peeked.intent.callbackPath === input.callbackPath
  ) {
    return "kept";
  }

  const created = createCaptureIntent(
    {
      type: "VIEW_LISTING",
      mlsNumber: input.mlsNumber,
      callbackPath: input.callbackPath,
    },
    { host: input.host, now: input.now },
  );
  if (!created.ok) return "invalid";
  saveCaptureIntent(input.store, created.intent);
  return "created";
}

export type ViewListingResumeResult = "opened" | "ignored";

/**
 * Access continuation only. Does not save, watch, message, or book.
 */
export function resumeViewListingIntent(
  intent: CaptureIntent,
  deps: {
    pathname?: string;
    navigate?: (path: string) => void;
  } = {},
): ViewListingResumeResult {
  if (intent.type !== "VIEW_LISTING") return "ignored";
  const pathname =
    deps.pathname ??
    (typeof window === "undefined" ? "" : window.location.pathname);
  const pathOnly = intent.callbackPath.split("?")[0] ?? intent.callbackPath;
  if (pathname === pathOnly) return "opened";

  const navigate =
    deps.navigate ??
    ((path: string) => {
      if (typeof window === "undefined") return;
      window.location.assign(path);
    });
  navigate(intent.callbackPath);
  return "opened";
}

let viewListingRegistered = false;

export function ensureViewListingIntentHandler(): void {
  if (viewListingRegistered) return;
  viewListingRegistered = true;
  registerCaptureIntentHandler("VIEW_LISTING", (intent) => {
    resumeViewListingIntent(intent);
  });
}
