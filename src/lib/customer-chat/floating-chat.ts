/**
 * Pure helpers for the premium floating Customer Chat window.
 * No Prisma, no side effects beyond caller-supplied storage.
 */

import { CUSTOMER_CHAT_TEXT_MAX_LENGTH } from "@/lib/customer-chat/query";

export const CUSTOMER_CHAT_OPEN_EVENT = "houzzat:customer-chat-open";

/** Privacy-safe label when assigned agent name is unavailable. */
export const CUSTOMER_CHAT_FALLBACK_AGENT_NAME = "Houzzat";

export const CUSTOMER_CHAT_GENERIC_UNREAD_COPY =
  "You have a new message from Houzzat";

export type CustomerChatListingContext = {
  mlsNumber: string;
  addressLine: string;
  city: string;
};

export type CustomerChatAgentIdentity = {
  name: string | null;
  photoUrl: string | null;
};

export type CustomerChatWindowMode =
  | "closed"
  | "open"
  | "minimized"
  | "preview";

export type CustomerChatUnreadPreviewState = {
  batchKey: string;
  agentName: string | null;
  agentPhotoUrl: string | null;
  messagePreview: string;
  messageCreatedAt: string | null;
  unreadCount: number;
  latestUnreadAgentMessageId: string;
};

export type CustomerChatWindowPosition = {
  x: number;
  y: number;
};

export type CustomerChatOpenDetail = {
  listingContext?: CustomerChatListingContext | null;
  draft?: string | null;
  /** When true, expand even if previously minimized. */
  forceExpand?: boolean;
};

export type CustomerChatFloatingStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const FLOATING_WIDTH = 380;
const FLOATING_HEIGHT = 560;
const EDGE_PAD = 12;

export function customerChatFloatingStorageKeys(userId: string) {
  const safe = userId.trim() || "anon";
  return {
    position: `houzzat:customer-chat:pos:${safe}`,
    draft: `houzzat:customer-chat:draft:${safe}`,
    listing: `houzzat:customer-chat:listing:${safe}`,
    autoOpenBatch: `houzzat:customer-chat:auto-open-batch:${safe}`,
    dismissedBatch: `houzzat:customer-chat:dismissed-batch:${safe}`,
  } as const;
}

export function presentCustomerChatAgentName(
  agent: CustomerChatAgentIdentity | null | undefined,
): string {
  const name = agent?.name?.trim();
  return name || CUSTOMER_CHAT_FALLBACK_AGENT_NAME;
}

export function presentCustomerChatAgentInitials(
  agent: CustomerChatAgentIdentity | null | undefined,
): string {
  const name = agent?.name?.trim();
  if (!name) return "HZ";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

/** Coarse customer-facing availability. Missing/invalid → offline (never invent Online). */
export type CustomerChatAgentAvailability = "online" | "away" | "offline";

export function presentCustomerChatAgentAvailability(
  value: string | null | undefined,
): CustomerChatAgentAvailability {
  if (value === "online" || value === "away" || value === "offline") {
    return value;
  }
  return "offline";
}

export function customerChatAgentAvailabilityLabel(
  value: CustomerChatAgentAvailability,
): string {
  switch (value) {
    case "online":
      return "Online";
    case "away":
      return "Away";
    case "offline":
      return "Offline";
    default: {
      const _exhaustive: never = value;
      void _exhaustive;
      return "Offline";
    }
  }
}

export function formatCustomerChatListingBanner(
  listing: CustomerChatListingContext | null | undefined,
): string | null {
  if (!listing) return null;
  const mls = listing.mlsNumber.trim();
  if (!mls) return null;
  const address = listing.addressLine.trim();
  const city = listing.city.trim();
  const place = [address, city].filter(Boolean).join(", ");
  return place ? `${place} · MLS® ${mls}` : `MLS® ${mls}`;
}

export function normalizeCustomerChatListingContext(input: {
  mlsNumber?: string | null;
  addressLine?: string | null;
  city?: string | null;
}): CustomerChatListingContext | null {
  const mlsNumber = input.mlsNumber?.trim() ?? "";
  if (!mlsNumber) return null;
  return {
    mlsNumber,
    addressLine: input.addressLine?.trim() ?? "",
    city: input.city?.trim() ?? "",
  };
}

export function normalizeCustomerChatDraft(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = raw.replace(/\r\n/g, "\n");
  if (trimmed.length <= CUSTOMER_CHAT_TEXT_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, CUSTOMER_CHAT_TEXT_MAX_LENGTH);
}

export function defaultCustomerChatWindowPosition(viewport: {
  width: number;
  height: number;
}): CustomerChatWindowPosition {
  return clampCustomerChatWindowPosition(
    {
      x: viewport.width - FLOATING_WIDTH - 24,
      y: viewport.height - FLOATING_HEIGHT - 96,
    },
    viewport,
  );
}

export function clampCustomerChatWindowPosition(
  position: CustomerChatWindowPosition,
  viewport: { width: number; height: number },
  size: { width: number; height: number } = {
    width: FLOATING_WIDTH,
    height: FLOATING_HEIGHT,
  },
): CustomerChatWindowPosition {
  const maxX = Math.max(EDGE_PAD, viewport.width - size.width - EDGE_PAD);
  const maxY = Math.max(EDGE_PAD, viewport.height - size.height - EDGE_PAD);
  return {
    x: Math.min(maxX, Math.max(EDGE_PAD, position.x)),
    y: Math.min(maxY, Math.max(EDGE_PAD, position.y)),
  };
}

export function readCustomerChatWindowPosition(
  storage: CustomerChatFloatingStorage,
  userId: string,
  viewport: { width: number; height: number },
): CustomerChatWindowPosition {
  const key = customerChatFloatingStorageKeys(userId).position;
  const raw = storage.getItem(key);
  if (!raw) return defaultCustomerChatWindowPosition(viewport);
  try {
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return defaultCustomerChatWindowPosition(viewport);
    }
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
      return defaultCustomerChatWindowPosition(viewport);
    }
    return clampCustomerChatWindowPosition(
      { x: parsed.x, y: parsed.y },
      viewport,
    );
  } catch {
    return defaultCustomerChatWindowPosition(viewport);
  }
}

export function writeCustomerChatWindowPosition(
  storage: CustomerChatFloatingStorage,
  userId: string,
  position: CustomerChatWindowPosition,
): void {
  const key = customerChatFloatingStorageKeys(userId).position;
  storage.setItem(key, JSON.stringify(position));
}

export function readCustomerChatSessionDraft(
  storage: CustomerChatFloatingStorage,
  userId: string,
): string {
  return normalizeCustomerChatDraft(
    storage.getItem(customerChatFloatingStorageKeys(userId).draft),
  );
}

export function writeCustomerChatSessionDraft(
  storage: CustomerChatFloatingStorage,
  userId: string,
  draft: string,
): void {
  const key = customerChatFloatingStorageKeys(userId).draft;
  const next = normalizeCustomerChatDraft(draft);
  if (!next) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, next);
}

export function readCustomerChatSessionListing(
  storage: CustomerChatFloatingStorage,
  userId: string,
): CustomerChatListingContext | null {
  const raw = storage.getItem(customerChatFloatingStorageKeys(userId).listing);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      mlsNumber?: unknown;
      addressLine?: unknown;
      city?: unknown;
    };
    return normalizeCustomerChatListingContext({
      mlsNumber: typeof parsed.mlsNumber === "string" ? parsed.mlsNumber : null,
      addressLine:
        typeof parsed.addressLine === "string" ? parsed.addressLine : null,
      city: typeof parsed.city === "string" ? parsed.city : null,
    });
  } catch {
    return null;
  }
}

export function writeCustomerChatSessionListing(
  storage: CustomerChatFloatingStorage,
  userId: string,
  listing: CustomerChatListingContext | null,
): void {
  const key = customerChatFloatingStorageKeys(userId).listing;
  if (!listing) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(listing));
}

export function readCustomerChatBatchKey(
  storage: CustomerChatFloatingStorage,
  userId: string,
  kind: "autoOpenBatch" | "dismissedBatch",
): string | null {
  const raw = storage.getItem(customerChatFloatingStorageKeys(userId)[kind]);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

export function writeCustomerChatBatchKey(
  storage: CustomerChatFloatingStorage,
  userId: string,
  kind: "autoOpenBatch" | "dismissedBatch",
  batchKey: string | null,
): void {
  const key = customerChatFloatingStorageKeys(userId)[kind];
  if (!batchKey) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, batchKey);
}

export function clearCustomerChatSessionState(
  storage: CustomerChatFloatingStorage,
  userId: string,
): void {
  const keys = customerChatFloatingStorageKeys(userId);
  storage.removeItem(keys.draft);
  storage.removeItem(keys.listing);
  storage.removeItem(keys.position);
  storage.removeItem(keys.autoOpenBatch);
  storage.removeItem(keys.dismissedBatch);
}

/** Peek while the floating transcript is open would duplicate the thread poll. */
export function shouldPeekCustomerChatUnread(input: {
  floatingEnabled: boolean;
  mode: CustomerChatWindowMode;
}): boolean {
  if (!input.floatingEnabled) return false;
  if (input.mode === "open") return false;
  return true;
}

export function customerChatUnreadPreviewBody(input: {
  body: string | null | undefined;
  kind?: string | null;
  hasVoiceAttachment?: boolean;
  isListingShare?: boolean;
}): string {
  if (input.hasVoiceAttachment || input.body === "Voice note") {
    return "Sent you a voice message";
  }
  if (input.isListingShare || /shared a (listing|property)/i.test(input.body ?? "")) {
    return "Shared a property with you";
  }
  const normalized = (input.body ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return CUSTOMER_CHAT_GENERIC_UNREAD_COPY;
  if (normalized.length <= 160) return normalized;
  return `${normalized.slice(0, 157).trimEnd()}…`;
}

/**
 * Workspace branding portrait is only valid for the workspace primary agent.
 * Never attach branding.agentProfilePhotoUrl to a different assignee.
 */
export function customerChatAgentPhotoAllowed(input: {
  assignedAgentId: string | null | undefined;
  primaryAgentId: string | null | undefined;
}): boolean {
  const assigned = input.assignedAgentId?.trim() || null;
  const primary = input.primaryAgentId?.trim() || null;
  if (!assigned || !primary) return false;
  return assigned === primary;
}

/**
 * Stable key for one unread agent-message batch.
 * Changes when unread count or the newest agent message identity changes.
 */
export function customerChatUnreadAutoOpenBatchKey(input: {
  conversationId: string | null;
  unreadCount: number;
  latestUnreadAgentMessageId: string | null;
}): string | null {
  if (!input.conversationId) return null;
  if (input.unreadCount <= 0) return null;
  if (!input.latestUnreadAgentMessageId) return null;
  return `${input.conversationId}:${input.unreadCount}:${input.latestUnreadAgentMessageId}`;
}

export function findLatestUnreadAgentMessageId(input: {
  messages: Array<{
    id: string;
    senderKind: string;
    createdAt: string;
  }>;
  customerLastReadAt: string | null;
  unreadCount: number;
}): string | null {
  if (input.unreadCount <= 0) return null;
  const watermark = input.customerLastReadAt
    ? Date.parse(input.customerLastReadAt)
    : Number.NEGATIVE_INFINITY;
  let latest: { id: string; at: number } | null = null;
  for (const message of input.messages) {
    if (message.senderKind !== "AGENT" && message.senderKind !== "ADMIN") {
      continue;
    }
    const at = Date.parse(message.createdAt);
    if (!Number.isFinite(at) || at <= watermark) continue;
    if (!latest || at >= latest.at) {
      latest = { id: message.id, at };
    }
  }
  return latest?.id ?? null;
}

export function shouldAutoOpenCustomerChatForUnread(input: {
  authenticated: boolean;
  mode: CustomerChatWindowMode;
  batchKey: string | null;
  alreadyOpenedBatchKey: string | null;
  dismissedBatchKey: string | null;
  deferAutoOpen: boolean;
}): boolean {
  if (!input.authenticated) return false;
  if (!input.batchKey) return false;
  if (input.mode === "open" || input.mode === "preview") return false;
  if (input.deferAutoOpen) return false;
  if (input.alreadyOpenedBatchKey === input.batchKey) return false;
  if (input.dismissedBatchKey === input.batchKey) return false;
  return true;
}

/**
 * Do not interrupt typing or important forms (auth, checkout-like).
 * Background unread checks still run; auto-open waits.
 */
export function shouldDeferCustomerChatAutoOpen(input: {
  activeElement: EventTarget | null;
  pathname?: string | null;
}): boolean {
  const path = input.pathname ?? "";
  if (
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up") ||
    path.startsWith("/auth/")
  ) {
    return true;
  }

  const el = input.activeElement;
  if (!el || typeof HTMLElement === "undefined") return false;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === "function") {
    if (el.closest("[data-customer-chat-defer-auto-open]")) return true;
    const form = el.closest("form");
    if (form && typeof HTMLFormElement !== "undefined" && form instanceof HTMLFormElement) {
      const method = (form.getAttribute("method") || "get").toLowerCase();
      if (method === "post") return true;
    }
  }
  return false;
}

export function isCustomerChatMobileViewport(width: number): boolean {
  return width < 768;
}

export const CUSTOMER_CHAT_FLOATING_SIZE = {
  width: FLOATING_WIDTH,
  height: FLOATING_HEIGHT,
} as const;
