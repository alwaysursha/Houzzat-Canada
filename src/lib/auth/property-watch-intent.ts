import { notifyPropertyWatchesChanged } from "@/lib/account/watch-sync";
import {
  requireAuthForIntent,
  type CaptureIntent,
  type CaptureIntentStore,
} from "@/lib/auth/capture-intent";
import { registerCaptureIntentHandler } from "@/lib/auth/capture-intent-dispatch";

export type PropertyWatchResumeResult =
  | "watched"
  | "verification"
  | "failed";

export function openGuestPropertyWatchIntent(input: {
  mlsNumber: string;
  callbackPath: string;
  host: string;
  now: number;
  store: CaptureIntentStore;
  openAuth: (options: { mode?: "sign-in" | "sign-up"; callbackUrl: string }) => void;
}): { ok: true; intent: CaptureIntent } | { ok: false; reason: "invalid" } {
  return requireAuthForIntent({
    draft: {
      type: "PROPERTY_WATCH",
      mlsNumber: input.mlsNumber,
      callbackPath: input.callbackPath,
    },
    host: input.host,
    now: input.now,
    store: input.store,
    openAuth: input.openAuth,
    mode: "sign-in",
  });
}

type PropertyWatchPostResult =
  | { ok: true }
  | { ok: false; verification: boolean };

export async function resumePropertyWatchIntent(
  intent: CaptureIntent,
  post: (mlsNumber: string) => Promise<PropertyWatchPostResult> = postPropertyWatch,
): Promise<PropertyWatchResumeResult | "ignored"> {
  if (intent.type !== "PROPERTY_WATCH") return "ignored";
  const result = await post(intent.mlsNumber);
  if (result.ok) {
    notifyPropertyWatchesChanged();
    return "watched";
  }
  if (result.verification) return "verification";
  return "failed";
}

async function postPropertyWatch(
  mlsNumber: string,
): Promise<PropertyWatchPostResult> {
  const response = await fetch("/api/account/property-monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mlsNumber }),
    credentials: "same-origin",
  });
  if (response.ok) return { ok: true };
  return { ok: false, verification: await readsVerification(response) };
}

async function readsVerification(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const data: unknown = await response.json();
    return (
      !!data &&
      typeof data === "object" &&
      "requiresEmailVerification" in data &&
      data.requiresEmailVerification === true
    );
  } catch {
    return false;
  }
}

type PropertyWatchUi = {
  onWatched?: () => void;
  onVerification?: () => void;
  onFailed?: () => void;
};

const propertyWatchRetainers = new Set<PropertyWatchUi>();
let propertyWatchRegistered = false;

function propertyWatchUi(): PropertyWatchUi | null {
  const items = [...propertyWatchRetainers];
  return items[items.length - 1] ?? null;
}

function ensurePropertyWatchHandler(): void {
  if (propertyWatchRegistered) return;
  propertyWatchRegistered = true;
  registerCaptureIntentHandler("PROPERTY_WATCH", (intent) => {
    const ui = propertyWatchUi();
    void resumePropertyWatchIntent(intent).then((result) => {
      if (result === "watched") ui?.onWatched?.();
      if (result === "verification") ui?.onVerification?.();
      if (result === "failed") ui?.onFailed?.();
    });
  });
}

/** Register the one-time Property Watch completion. Refcounted per control. */
export function retainPropertyWatchIntentHandler(ui: PropertyWatchUi): () => void {
  ensurePropertyWatchHandler();
  propertyWatchRetainers.add(ui);
  return () => {
    propertyWatchRetainers.delete(ui);
  };
}
