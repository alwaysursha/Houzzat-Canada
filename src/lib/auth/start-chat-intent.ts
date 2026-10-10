import { CUSTOMER_CHAT_PAGE_HREF } from "@/lib/customer-chat/query";
import {
  CUSTOMER_CHAT_OPEN_EVENT,
  normalizeCustomerChatDraft,
  normalizeCustomerChatListingContext,
  type CustomerChatListingContext,
  type CustomerChatOpenDetail,
} from "@/lib/customer-chat/floating-chat";
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

/** Customer Chat lives on this path. Fallback when floating chat is unavailable. */
export const START_CHAT_CALLBACK_PATH = CUSTOMER_CHAT_PAGE_HREF;

export function openGuestStartChatIntent(input: {
  host: string;
  now: number;
  store: CaptureIntentStore;
  openAuth: OpenAuth;
  listingContext?: CustomerChatListingContext | null;
  draftMessage?: string | null;
}):
  | { ok: true; intent: CaptureIntent }
  | { ok: false; reason: "invalid" } {
  const listing = input.listingContext
    ? normalizeCustomerChatListingContext(input.listingContext)
    : null;
  const draftMessage = normalizeCustomerChatDraft(input.draftMessage ?? null);
  return requireAuthForIntent({
    draft: {
      type: "START_CHAT",
      callbackPath: START_CHAT_CALLBACK_PATH,
      mlsNumber: listing?.mlsNumber ?? null,
      addressLine: listing?.addressLine ?? null,
      city: listing?.city ?? null,
      draftMessage: draftMessage || null,
    },
    host: input.host,
    now: input.now,
    store: input.store,
    openAuth: input.openAuth,
    mode: "sign-in",
  });
}

export type StartChatResumeResult = "opened" | "ignored";

export function listingContextFromStartChatIntent(
  intent: CaptureIntent,
): CustomerChatListingContext | null {
  if (intent.type !== "START_CHAT") return null;
  return normalizeCustomerChatListingContext({
    mlsNumber: intent.mlsNumber,
    addressLine: intent.addressLine,
    city: intent.city,
  });
}

export function draftFromStartChatIntent(intent: CaptureIntent): string {
  if (intent.type !== "START_CHAT") return "";
  return normalizeCustomerChatDraft(intent.draftMessage);
}

/**
 * After authentication, open Chat with optional listing draft context.
 * Does not send a message, create a Lead, or create a Conversation.
 *
 * Prefers the floating chat window via openFloating / CUSTOMER_CHAT_OPEN_EVENT.
 * Navigates to /account/chat only when floating open is unavailable.
 */
export function resumeStartChatIntent(
  intent: CaptureIntent,
  deps: {
    pathname?: string;
    navigate?: (path: string) => void;
    openFloating?: (detail: CustomerChatOpenDetail) => boolean;
    dispatchOpenEvent?: (detail: CustomerChatOpenDetail) => void;
  } = {},
): StartChatResumeResult {
  if (intent.type !== "START_CHAT") return "ignored";
  if (intent.callbackPath !== START_CHAT_CALLBACK_PATH) return "ignored";

  const detail: CustomerChatOpenDetail = {
    listingContext: listingContextFromStartChatIntent(intent),
    draft: draftFromStartChatIntent(intent) || null,
    forceExpand: true,
  };

  if (deps.openFloating?.(detail)) {
    return "opened";
  }

  const dispatch =
    deps.dispatchOpenEvent ??
    ((payload: CustomerChatOpenDetail) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent(CUSTOMER_CHAT_OPEN_EVENT, { detail: payload }),
      );
    });
  dispatch(detail);

  const pathname =
    deps.pathname ??
    (typeof window === "undefined" ? "" : window.location.pathname);
  if (
    pathname === START_CHAT_CALLBACK_PATH ||
    pathname.startsWith(`${START_CHAT_CALLBACK_PATH}/`)
  ) {
    return "opened";
  }

  // Floating provider listens for CUSTOMER_CHAT_OPEN_EVENT site-wide.
  // Keep /account/chat navigation as an explicit fallback for callers that
  // inject navigate (tests) or when dispatch is a no-op (SSR).
  if (deps.navigate) {
    deps.navigate(START_CHAT_CALLBACK_PATH);
    return "opened";
  }

  if (typeof window === "undefined") {
    return "opened";
  }

  return "opened";
}

let startChatRegistered = false;

/** Consume START_CHAT once. The Chat buttons may unmount before sign-in finishes. */
export function ensureStartChatIntentHandler(): void {
  if (startChatRegistered) return;
  startChatRegistered = true;
  registerCaptureIntentHandler("START_CHAT", (intent) => {
    resumeStartChatIntent(intent);
  });
}
