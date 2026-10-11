/**
 * Customer Chat UI helpers. Client/server-safe. No Prisma.
 * Persistence lives in Customer Conversation APIs — this module does not
 * invent Message IDs or write Conversations.
 */
import {
  V2_CHAT_DELETED_TOMBSTONE,
  V2_CHAT_TEXT_MAX_LENGTH,
  v2ChatComposerCanSubmit,
  v2ChatComposerKeyAction,
  v2ChatPrependScrollTop,
} from "@/lib/agent/lead-profile-v2/chat-query";
import {
  applyContextPageState,
  mergeMessagesWithContext,
} from "@/lib/chat/message-context";
import type {
  CustomerChatGetPayload,
  CustomerChatLoadErrorKind,
  CustomerChatMessage,
  CustomerChatSendFailure,
  CustomerChatSendFailureKind,
} from "@/lib/customer-chat/types";
import { smsAutomationTranscriptLabel } from "@/lib/platform/sms-automations/catalog";

/** Lightweight marker check — avoids importing listing-share (server snapshot deps). */
function isListingShareCardPayload(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      (payload as { card?: unknown }).card === "LISTING_SHARE",
  );
}

export const CUSTOMER_CHAT_PAGE_HREF = "/account/chat";
export const CUSTOMER_CHAT_GET_ROUTE = "/api/account/conversation";
export const CUSTOMER_CHAT_SEND_ROUTE = "/api/account/conversation/messages";
export const CUSTOMER_CHAT_READ_ROUTE = "/api/account/conversation/read";
export const CUSTOMER_CHAT_SEARCH_ROUTE = "/api/account/conversation/search";
export const CUSTOMER_CHAT_TEXT_MAX_LENGTH = V2_CHAT_TEXT_MAX_LENGTH;
export const CUSTOMER_CHAT_DELETED_TOMBSTONE = V2_CHAT_DELETED_TOMBSTONE;

export function customerChatReactionRoute(messageId: string) {
  return `${CUSTOMER_CHAT_SEND_ROUTE}/${encodeURIComponent(messageId)}/reactions`;
}

export function customerChatContextRoute(messageId: string) {
  return `${CUSTOMER_CHAT_SEND_ROUTE}/${encodeURIComponent(messageId)}/context`;
}

export function customerChatSearchUrl(query: string, cursor?: string | null) {
  const params = new URLSearchParams();
  params.set("q", query);
  if (cursor) params.set("cursor", cursor);
  return `${CUSTOMER_CHAT_SEARCH_ROUTE}?${params.toString()}`;
}

export const customerChatComposerKeyAction = v2ChatComposerKeyAction;
export const customerChatComposerCanSubmit = v2ChatComposerCanSubmit;
export const customerChatPrependScrollTop = v2ChatPrependScrollTop;

export function customerChatGetUrl(cursor?: string | null) {
  if (!cursor) return CUSTOMER_CHAT_GET_ROUTE;
  const params = new URLSearchParams();
  params.set("cursor", cursor);
  return `${CUSTOMER_CHAT_GET_ROUTE}?${params.toString()}`;
}

export function customerChatSendBody(
  body: string,
  replyToMessageId?: string | null,
): { body: string; replyToMessageId?: string } {
  const payload: { body: string; replyToMessageId?: string } = { body };
  const reply = replyToMessageId?.trim();
  if (reply) payload.replyToMessageId = reply;
  return payload;
}

export function mergeCustomerChatMessages(
  prev: CustomerChatMessage[],
  next: CustomerChatMessage[],
  mode: "replace" | "prepend" | "append",
): CustomerChatMessage[] {
  if (mode === "replace") return next;
  const seen = new Set(prev.map((row) => row.id));
  const unique = next.filter((row) => !seen.has(row.id));
  if (mode === "prepend") return [...unique, ...prev];
  return [...prev, ...unique];
}

export function mergeCustomerChatContext(
  payload: CustomerChatGetPayload,
  context: {
    messages: CustomerChatMessage[];
    page: {
      hasMoreOlder: boolean;
      olderCursor: string | null;
    };
  },
): CustomerChatGetPayload {
  const messages = mergeMessagesWithContext(payload.messages, context.messages);
  const oldest = messages[0] ?? null;
  const contextOldest = context.messages[0] ?? null;
  const pageState = applyContextPageState({
    previousHasMore: payload.page.hasMore,
    previousNextCursor: payload.page.nextCursor,
    contextHasMoreOlder: context.page.hasMoreOlder,
    contextOlderCursor: context.page.olderCursor,
    mergedOldestId: oldest?.id ?? null,
    contextOldestId: contextOldest?.id ?? null,
  });
  return {
    ...payload,
    messages,
    page: {
      ...payload.page,
      hasMore: pageState.hasMore,
      nextCursor: pageState.nextCursor,
    },
  };
}

export function appendCustomerChatSentMessage(
  payload: CustomerChatGetPayload,
  conversation: CustomerChatGetPayload["conversation"],
  message: CustomerChatMessage,
): CustomerChatGetPayload {
  return {
    ...payload,
    conversation: conversation
      ? {
          ...conversation,
          lastMessageAt: message.createdAt,
        }
      : payload.conversation,
    messages: mergeCustomerChatMessages(payload.messages, [message], "append"),
  };
}

export function shouldSkipCustomerChatSubmit(input: {
  body: string;
  inFlight: boolean;
  canSend: boolean;
}): boolean {
  return !customerChatComposerCanSubmit({
    body: input.body,
    pending: input.inFlight,
    canSend: input.canSend,
  });
}

export function shouldSkipDuplicateCustomerChatOlder(input: {
  inFlight: boolean;
  lastCursor: string | null;
  cursor: string;
}): boolean {
  if (input.inFlight) return true;
  return input.lastCursor === input.cursor;
}

export function shouldMarkCustomerChatRead(input: {
  chatVisible: boolean;
  openId: string | null;
  alreadyMarkedId: string | null;
}): boolean {
  if (!input.chatVisible) return false;
  if (!input.openId) return false;
  return input.alreadyMarkedId !== input.openId;
}

export function shouldGroupCustomerChatMessage(
  previous: CustomerChatMessage | null,
  current: CustomerChatMessage,
): boolean {
  if (!previous) return false;
  if (previous.kind === "SYSTEM_CARD" || current.kind === "SYSTEM_CARD") {
    return false;
  }
  if (previous.senderKind !== current.senderKind) return false;
  if (previous.channel !== current.channel) return false;
  if (customerSmsAutomationBadge(previous.payload) || customerSmsAutomationBadge(current.payload)) {
    return false;
  }
  if (
    isListingShareCardPayload(previous.payload) ||
    isListingShareCardPayload(current.payload)
  ) {
    return false;
  }
  return previous.senderName === current.senderName;
}

export function customerUnreadDividerMessageId(
  messages: CustomerChatMessage[],
  customerLastReadAt: string | null,
  unreadCount: number,
): string | null {
  if (unreadCount <= 0 || !customerLastReadAt) return null;
  const cutoff = Date.parse(customerLastReadAt);
  if (Number.isNaN(cutoff)) return null;
  const first = messages.find((message) => {
    if (message.senderKind === "CUSTOMER") return false;
    return Date.parse(message.createdAt) > cutoff;
  });
  return first?.id ?? null;
}

export function customerChatTranscriptItems(
  messages: CustomerChatMessage[],
  dividerMessageId: string | null,
) {
  return messages.map((message, index) => ({
    message,
    grouped: shouldGroupCustomerChatMessage(
      messages[index - 1] ?? null,
      message,
    ),
    showDivider: dividerMessageId === message.id,
  }));
}

export function customerChatMessageBody(message: CustomerChatMessage): string {
  if (message.deletedAt) return CUSTOMER_CHAT_DELETED_TOMBSTONE;
  return message.body ?? "";
}

export function customerChatEmptyTitle(): string {
  return "Start a conversation";
}

export function customerChatEmptyCopy(): string {
  return "Send a message and your agent will get back to you here.";
}

export function customerChatBlockedCopy(): string {
  return "Chat isn’t available right now.";
}

export function customerChatUnavailableCopy(): string {
  return "Chat is temporarily unavailable. Please try again shortly.";
}

export function customerChatRateLimitedCopy(retryAfterSec: number | null): string {
  if (retryAfterSec != null && retryAfterSec > 0) {
    return `You’re sending messages a bit quickly. Please wait ${retryAfterSec} second${retryAfterSec === 1 ? "" : "s"} and try again.`;
  }
  return "You’re sending messages a bit quickly. Please wait a moment and try again.";
}

export function customerChatAuthCopy(): string {
  return "Sign in to chat with your agent.";
}

export function parseRetryAfterHeader(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const dateMs = Date.parse(header);
  if (Number.isNaN(dateMs)) return null;
  const sec = Math.ceil((dateMs - Date.now()) / 1000);
  return sec > 0 ? sec : null;
}

function errorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function errorFlag(body: unknown, key: string): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as Record<string, unknown>)[key] === true;
}

export function parseCustomerChatSendFailure(
  status: number,
  body: unknown,
  retryAfterHeader: string | null,
): CustomerChatSendFailure {
  const code = errorCode(body);
  if (status === 503 || code === "CHAT_AGENT_UNAVAILABLE") {
    return {
      kind: "unavailable",
      message: customerChatUnavailableCopy(),
      retryAfterSec: null,
    };
  }
  if (status === 429 || code === "RATE_LIMITED") {
    const retryAfterSec = parseRetryAfterHeader(retryAfterHeader);
    return {
      kind: "rate_limited",
      message: customerChatRateLimitedCopy(retryAfterSec),
      retryAfterSec,
    };
  }
  if (code === "CHAT_BLOCKED") {
    return {
      kind: "blocked",
      message: customerChatBlockedCopy(),
      retryAfterSec: null,
    };
  }
  if (status === 401 || errorFlag(body, "requiresAuth")) {
    return {
      kind: "auth",
      message: customerChatAuthCopy(),
      retryAfterSec: null,
    };
  }
  if (errorFlag(body, "requiresEmailVerification")) {
    return {
      kind: "verification",
      message: "Verify your email to send a message.",
      retryAfterSec: null,
    };
  }
  return {
    kind: "generic",
    message: "Couldn’t send your message. Please try again.",
    retryAfterSec: null,
  };
}

export function parseCustomerChatLoadError(
  status: number,
  body: unknown,
): { kind: CustomerChatLoadErrorKind; message: string } {
  if (status === 401 || errorFlag(body, "requiresAuth")) {
    return { kind: "auth", message: customerChatAuthCopy() };
  }
  if (status === 503 || errorCode(body) === "CHAT_AGENT_UNAVAILABLE") {
    return { kind: "unavailable", message: customerChatUnavailableCopy() };
  }
  return {
    kind: "generic",
    message: "Couldn’t load chat. Please try again.",
  };
}

export function customerSmsAutomationBadge(payload: unknown): string | null {
  return smsAutomationTranscriptLabel(payload);
}

export function isCustomerChatMine(senderKind: string): boolean {
  return senderKind === "CUSTOMER";
}

export function customerChatBubbleAlign(
  senderKind: string,
  kind: string,
): "right" | "left" | "center" {
  if (kind === "SYSTEM_CARD") return "center";
  return isCustomerChatMine(senderKind) ? "right" : "left";
}

export function customerChatSendFailureKind(
  failure: CustomerChatSendFailure | null,
): CustomerChatSendFailureKind | null {
  return failure?.kind ?? null;
}

export { V2_CHAT_TEXT_MAX_LENGTH };
