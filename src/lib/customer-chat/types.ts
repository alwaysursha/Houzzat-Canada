/** Client-safe Customer Conversation DTOs. Mirror the API; no Prisma. */

export type CustomerChatSenderKind =
  | "CUSTOMER"
  | "AGENT"
  | "ADMIN"
  | "SYSTEM_CARD"
  | string;

export type CustomerChatMessageKind = "TEXT" | "SYSTEM_CARD" | string;

export type CustomerChatMessage = {
  id: string;
  channel: string;
  kind: CustomerChatMessageKind;
  senderKind: CustomerChatSenderKind;
  senderName: string;
  body: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  payload: unknown;
};

export type CustomerChatConversation = {
  id: string;
  status: string;
  lastMessageAt: string | null;
};

export type CustomerChatReadView = {
  customerLastReadAt: string | null;
  unreadCount: number;
};

/** Assigned agent presentation for the customer chat header. Never invents status. */
export type CustomerChatAgentIdentity = {
  name: string | null;
  photoUrl: string | null;
};

export type CustomerChatGetPayload = {
  conversation: CustomerChatConversation | null;
  messages: CustomerChatMessage[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  canSend: boolean;
  blocked: boolean;
  read: CustomerChatReadView;
  agent: CustomerChatAgentIdentity | null;
};

export type CustomerChatSendPayload = {
  conversation: CustomerChatConversation;
  message: CustomerChatMessage;
};

export type CustomerChatMarkReadPayload = {
  ok: true;
  marked: boolean;
  conversation: {
    id: string;
    customerLastReadAt: string | null;
  } | null;
};

export type CustomerChatSendFailureKind =
  | "unavailable"
  | "rate_limited"
  | "blocked"
  | "verification"
  | "auth"
  | "generic";

export type CustomerChatSendFailure = {
  kind: CustomerChatSendFailureKind;
  message: string;
  retryAfterSec: number | null;
};

export type CustomerChatLoadErrorKind =
  | "auth"
  | "unavailable"
  | "generic";
