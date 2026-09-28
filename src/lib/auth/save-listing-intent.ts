import { responseRequiresEmailVerification } from "@/lib/account/customer-access-error";
import { notifySavedListingsChanged } from "@/lib/account/saved-listings-sync";
import {
  requireAuthForIntent,
  type CaptureIntent,
  type CaptureIntentStore,
} from "@/lib/auth/capture-intent";
import { registerCaptureIntentHandler } from "@/lib/auth/capture-intent-dispatch";

type OpenAuth = (options: {
  mode?: "sign-in" | "sign-up";
  callbackUrl: string;
}) => void;

/**
 * Anonymous Save. Opens the existing auth modal and keeps SAVE_LISTING pending.
 * Signed-in saves do not call this.
 */
export function openGuestSaveListingIntent(input: {
  mlsNumber: string;
  callbackPath: string;
  host: string;
  now: number;
  store: CaptureIntentStore;
  openAuth: OpenAuth;
}):
  | { ok: true; intent: CaptureIntent }
  | { ok: false; reason: "invalid" } {
  return requireAuthForIntent({
    draft: {
      type: "SAVE_LISTING",
      callbackPath: input.callbackPath,
      mlsNumber: input.mlsNumber,
    },
    host: input.host,
    now: input.now,
    store: input.store,
    openAuth: input.openAuth,
    mode: "sign-in",
  });
}

type SaveListingPostResult =
  | { ok: true }
  | { ok: false; verification: boolean };

async function postSavedListing(mlsNumber: string): Promise<SaveListingPostResult> {
  const res = await fetch("/api/saved-listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ mlsNumber }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, verification: await responseRequiresEmailVerification(res) };
}

/**
 * Resume SAVE_LISTING through the existing saved-listings endpoint.
 * Upsert is idempotent, so an already-saved listing completes successfully.
 * Failure returns without writing the intent back.
 * A verification rejection is reported once and is not retried.
 */
export async function resumeSavedListingIntent(
  intent: CaptureIntent,
  deps: {
    save?: (mlsNumber: string) => Promise<
      { ok: true } | { ok: false; verification?: boolean }
    >;
    onSaved?: () => void;
  } = {},
): Promise<"saved" | "verification" | "failed" | "ignored"> {
  if (intent.type !== "SAVE_LISTING") return "ignored";
  const save = deps.save ?? postSavedListing;
  const onSaved = deps.onSaved ?? notifySavedListingsChanged;
  try {
    const result = await save(intent.mlsNumber);
    if (!result.ok) {
      if (result.verification) return "verification";
      return "failed";
    }
    onSaved();
    return "saved";
  } catch {
    return "failed";
  }
}

let retains = 0;
let stopHandler: (() => void) | null = null;
let announceSaved: (() => void) | null = null;
let announceVerification: (() => void) | null = null;

/**
 * Keep SAVE_LISTING registered while a save control is mounted.
 * The first control registers; the last one unregisters.
 */
export function retainSaveListingIntentHandler(
  onSaved: () => void,
  onVerification?: () => void,
): () => void {
  announceSaved = onSaved;
  announceVerification = onVerification ?? null;
  retains += 1;
  if (retains === 1) {
    stopHandler = registerCaptureIntentHandler("SAVE_LISTING", (intent) => {
      void resumeSavedListingIntent(intent).then((result) => {
        if (result === "saved") announceSaved?.();
        else if (result === "verification") announceVerification?.();
      });
    });
  }
  return () => {
    retains -= 1;
    if (retains === 0) {
      stopHandler?.();
      stopHandler = null;
      announceSaved = null;
      announceVerification = null;
    }
  };
}
