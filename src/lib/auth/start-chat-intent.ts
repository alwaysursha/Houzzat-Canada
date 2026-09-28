import { CUSTOMER_CHAT_PAGE_HREF } from "@/lib/customer-chat/query";
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

/** Customer Chat lives on this path. The intent stores nothing else. */
export const START_CHAT_CALLBACK_PATH = CUSTOMER_CHAT_PAGE_HREF;

export function openGuestStartChatIntent(input: {
  host: string;
  now: number;
  store: CaptureIntentStore;
  openAuth: OpenAuth;
}):
  | { ok: true; intent: CaptureIntent }
  | { ok: false; reason: "invalid" } {
  return requireAuthForIntent({
    draft: {
      type: "START_CHAT",
      callbackPath: START_CHAT_CALLBACK_PATH,
    },
    host: input.host,
    now: input.now,
    store: input.store,
    openAuth: input.openAuth,
    mode: "sign-in",
  });
}

export type StartChatResumeResult = "opened" | "ignored";

/**
 * After authentication, open Chat. Does not send a message, create a Lead,
 * or create a Conversation.
 */
export function resumeStartChatIntent(
  intent: CaptureIntent,
  deps: {
    pathname?: string;
    navigate?: (path: string) => void;
  } = {},
): StartChatResumeResult {
  if (intent.type !== "START_CHAT") return "ignored";
  if (intent.callbackPath !== START_CHAT_CALLBACK_PATH) return "ignored";

  const pathname =
    deps.pathname ??
    (typeof window === "undefined" ? "" : window.location.pathname);
  if (
    pathname === START_CHAT_CALLBACK_PATH ||
    pathname.startsWith(`${START_CHAT_CALLBACK_PATH}/`)
  ) {
    return "opened";
  }

  const navigate =
    deps.navigate ??
    ((path: string) => {
      if (typeof window === "undefined") return;
      window.location.assign(path);
    });
  navigate(START_CHAT_CALLBACK_PATH);
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
