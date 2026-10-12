/**
 * Consumer floating-chat overlay stack for Capacitor Back + browser history.
 * Mirrors staff-overlay-stack but stays separate (customer shell).
 */

export type CustomerChatOverlayEntry = {
  id: string;
  priority: number;
  close: () => void;
};

export const CUSTOMER_CHAT_OVERLAY_PRIORITY = {
  reactionMenu: 40,
  emojiPicker: 45,
  preview: 50,
  open: 60,
} as const;

let stack: CustomerChatOverlayEntry[] = [];

export function pushCustomerChatOverlay(
  entry: CustomerChatOverlayEntry,
): () => void {
  stack = [...stack.filter((e) => e.id !== entry.id), entry];
  let released = false;
  return () => {
    if (released) return;
    released = true;
    stack = stack.filter((e) => e.id !== entry.id);
  };
}

export function hasCustomerChatOverlay(): boolean {
  return stack.length > 0;
}

export function closeTopCustomerChatOverlay(): boolean {
  if (stack.length === 0) return false;
  const top = [...stack].sort((a, b) => b.priority - a.priority)[0];
  if (!top) return false;
  try {
    top.close();
  } catch (error) {
    console.error("[customer-chat-overlay] close failed", error);
  }
  return true;
}

export function __resetCustomerChatOverlayStackForTests() {
  stack = [];
}

export const CUSTOMER_CHAT_HISTORY_STATE_KEY = "houzzatCustomerChatOverlay";

export function isCustomerChatHistoryState(
  state: unknown,
): state is { [CUSTOMER_CHAT_HISTORY_STATE_KEY]: true } {
  return Boolean(
    state &&
      typeof state === "object" &&
      (state as Record<string, unknown>)[CUSTOMER_CHAT_HISTORY_STATE_KEY] ===
        true,
  );
}

/**
 * Listing-sheet Close uses history.back() while the chat history marker often
 * remains on the landing entry. Keep chat open in that case; only dismiss when
 * Back truly leaves the chat overlay entry (and no listing sheet is open).
 */
export function shouldCloseCustomerChatOnPopState(input: {
  eventState: unknown;
  historyState: unknown;
  listingSheetOpen: boolean;
}): boolean {
  if (input.listingSheetOpen) return false;
  if (isCustomerChatHistoryState(input.eventState)) return false;
  if (isCustomerChatHistoryState(input.historyState)) return false;
  return true;
}
