import { notifyAreaWatchesChanged } from "@/lib/account/watch-sync";
import {
  requireAuthForIntent,
  type AreaWatchSegment,
  type AreaWatchTransaction,
  type CaptureIntent,
  type CaptureIntentStore,
} from "@/lib/auth/capture-intent";
import { registerCaptureIntentHandler } from "@/lib/auth/capture-intent-dispatch";

export type AreaWatchResumeResult = "watched" | "verification" | "failed";

export type AreaWatchCriteria = {
  city: string;
  community: string | null;
  transactionType: AreaWatchTransaction;
  segment: AreaWatchSegment;
};

export function openGuestAreaWatchIntent(input: AreaWatchCriteria & {
  callbackPath: string;
  host: string;
  now: number;
  store: CaptureIntentStore;
  openAuth: (options: { mode?: "sign-in" | "sign-up"; callbackUrl: string }) => void;
}): { ok: true; intent: CaptureIntent } | { ok: false; reason: "invalid" } {
  return requireAuthForIntent({
    draft: {
      type: "AREA_WATCH",
      callbackPath: input.callbackPath,
      city: input.city,
      community: input.community,
      transactionType: input.transactionType,
      segment: input.segment,
    },
    host: input.host,
    now: input.now,
    store: input.store,
    openAuth: input.openAuth,
    mode: "sign-in",
  });
}

type AreaWatchPostResult = { ok: true } | { ok: false; verification: boolean };

export async function resumeAreaWatchIntent(
  intent: Extract<CaptureIntent, { type: "AREA_WATCH" }>,
  post: (criteria: AreaWatchCriteria) => Promise<AreaWatchPostResult> = postAreaWatch,
): Promise<AreaWatchResumeResult> {
  const result = await post({
    city: intent.city,
    community: intent.community,
    transactionType: intent.transactionType,
    segment: intent.segment,
  });
  if (result.ok) {
    notifyAreaWatchesChanged();
    return "watched";
  }
  if (result.verification) return "verification";
  return "failed";
}

async function postAreaWatch(
  criteria: AreaWatchCriteria,
): Promise<AreaWatchPostResult> {
  const response = await fetch("/api/account/area-monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city: criteria.city,
      community: criteria.community,
      transactionType: criteria.transactionType,
      segment: criteria.segment,
      notifyNew: true,
      notifySold: true,
    }),
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

type AreaWatchUi = {
  onWatched?: () => void;
  onVerification?: () => void;
  onFailed?: () => void;
};

const areaWatchRetainers = new Set<AreaWatchUi>();
let areaWatchRegistered = false;

function areaWatchUi(): AreaWatchUi | null {
  const items = [...areaWatchRetainers];
  return items[items.length - 1] ?? null;
}

function ensureAreaWatchHandler(): void {
  if (areaWatchRegistered) return;
  areaWatchRegistered = true;
  registerCaptureIntentHandler("AREA_WATCH", (intent) => {
    if (intent.type !== "AREA_WATCH") return;
    const ui = areaWatchUi();
    void resumeAreaWatchIntent(intent).then((result) => {
      if (result === "watched") ui?.onWatched?.();
      if (result === "verification") ui?.onVerification?.();
      if (result === "failed") ui?.onFailed?.();
    });
  });
}

/** Register the one-time Area Watch completion. Refcounted per control. */
export function retainAreaWatchIntentHandler(ui: AreaWatchUi): () => void {
  ensureAreaWatchHandler();
  areaWatchRetainers.add(ui);
  return () => {
    areaWatchRetainers.delete(ui);
  };
}
