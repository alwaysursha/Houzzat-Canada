/** Unwrap helpers for mobile v2 Conversation chat APIs (not LeadEmailLog). */

export type MobileChatsInboxRow = {
  conversationId: string;
  leadId: string;
  status: string;
  lastMessageAt: string;
  lead: {
    displayName: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    pipelineStatus: string;
  };
  assignment: {
    assignedAgentId: string | null;
    isAssignedToViewer: boolean;
  };
  latestMessage: {
    id: string;
    channel: string;
    kind: string;
    senderKind: string;
    senderName: string;
    preview: string;
    createdAt: string;
  } | null;
  unread: {
    count: number;
    cutoffMode: string;
    agentCursorValid: boolean;
  };
  viewer: {
    canSend: boolean;
    canMarkRead: boolean;
  };
};

export type MobileChatsInboxList = {
  conversations: MobileChatsInboxRow[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type MobileChatMessage = {
  id: string;
  channel: string;
  kind: string;
  senderKind: string;
  senderUserId: string | null;
  senderName: string;
  body: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: string | null;
  createdAt: string;
  deliveredAt: string | null;
  smsSource: string | null;
  providerStatus: string | null;
  payload: unknown;
};

export type MobileChatPanel = {
  conversation: {
    id: string;
    leadId: string;
    status: string;
    createdAt: string;
    lastMessageAt: string | null;
    created: boolean;
  };
  assignedAgentId: string | null;
  viewer: {
    userId: string;
    isAssignedAgent: boolean;
    canMarkRead: boolean;
  };
  unread: {
    count: number;
    dividerMessageId: string | null;
    cutoffMode: string;
    agentCursorValid: boolean;
  };
  messages: MobileChatMessage[];
  smsSend?: {
    enabled: boolean;
    reason: string | null;
  };
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Accepts either `{ ok, data }` envelope or bare inbox list body. */
export function unwrapChatsInboxList(payload: unknown): MobileChatsInboxList | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data =
    root.ok === true && root.data != null ? asRecord(root.data) : root;
  if (!data) return null;
  if (!Array.isArray(data.conversations)) return null;
  const page = asRecord(data.page);
  return {
    conversations: data.conversations as MobileChatsInboxRow[],
    page: {
      limit: typeof page?.limit === "number" ? page.limit : 30,
      hasMore: Boolean(page?.hasMore),
      nextCursor:
        typeof page?.nextCursor === "string" ? page.nextCursor : null,
    },
  };
}

export function unwrapChatPanel(payload: unknown): MobileChatPanel | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data =
    root.ok === true && root.data != null ? asRecord(root.data) : root;
  if (!data) return null;
  if (!asRecord(data.conversation) || !Array.isArray(data.messages)) {
    return null;
  }
  return data as unknown as MobileChatPanel;
}

export function unwrapChatSentMessage(
  payload: unknown,
): MobileChatMessage | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data =
    root.ok === true && root.data != null ? asRecord(root.data) : root;
  if (!data) return null;
  // send APIs may return { message } or the message itself
  const message = asRecord(data.message) ?? data;
  if (typeof message.id !== "string") return null;
  return message as unknown as MobileChatMessage;
}

export function buildChatsInboxQuery(input: {
  q?: string;
  filter?: "all" | "unread";
  cursor?: string | null;
}): string {
  const params = new URLSearchParams();
  const q = input.q?.trim();
  if (q) params.set("q", q);
  if (input.filter && input.filter !== "all") params.set("filter", input.filter);
  if (input.cursor) params.set("cursor", input.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function chatsInboxInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "L";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function formatChatsInboxTime(iso: string, now = new Date()): string {
  try {
    const d = new Date(iso);
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate()
    ) {
      return "Yesterday";
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
