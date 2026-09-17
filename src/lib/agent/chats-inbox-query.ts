/** Client-safe HouzzatPRO Chats Inbox helpers. No Prisma. */
import type { LeadProfileV2ChatMessage } from "@/lib/agent/lead-profile-v2/types";
import { openLeadProfileHref } from "@/lib/agent/lead-profile-query";

export const CHATS_INBOX_API_ROUTE = "/api/agent/conversations";
export const CHATS_INBOX_PAGE_HREF = "/agent/chats";
export const CHATS_INBOX_SEARCH_DEBOUNCE_MS = 300;

export type ChatsInboxFilter = "all" | "unread";

export type ChatsInboxLatestMessage = {
  id: string;
  channel: string;
  kind: string;
  senderKind: string;
  senderName: string;
  preview: string;
  createdAt: string;
};

export type ChatsInboxRow = {
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
  latestMessage: ChatsInboxLatestMessage | null;
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

export type ChatsInboxListResult = {
  conversations: ChatsInboxRow[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export function chatsInboxListUrl(input: {
  q?: string | null;
  filter?: ChatsInboxFilter | null;
  cursor?: string | null;
  limit?: number | null;
}): string {
  const params = new URLSearchParams();
  const q = input.q?.trim();
  if (q) params.set("q", q);
  if (input.filter && input.filter !== "all") params.set("filter", input.filter);
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit != null) params.set("limit", String(input.limit));
  const qs = params.toString();
  return `${CHATS_INBOX_API_ROUTE}${qs ? `?${qs}` : ""}`;
}

export function chatsPageHref(leadId?: string | null): string {
  if (!leadId) return CHATS_INBOX_PAGE_HREF;
  const q = new URLSearchParams();
  q.set("lead", leadId);
  return `${CHATS_INBOX_PAGE_HREF}?${q.toString()}`;
}

export function readChatsLeadParam(
  search: string | URLSearchParams | null,
): string | null {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const lead = params?.get("lead")?.trim() ?? "";
  return lead || null;
}

export function shouldAutoSelectInboxLead(): false {
  return false;
}

export function mergeInboxRows(
  prev: ChatsInboxRow[],
  next: ChatsInboxRow[],
): ChatsInboxRow[] {
  const seen = new Set(prev.map((row) => row.conversationId));
  const extra = next.filter((row) => !seen.has(row.conversationId));
  return [...prev, ...extra];
}

export function applyInboxMarkRead(row: ChatsInboxRow): ChatsInboxRow {
  return {
    ...row,
    unread: {
      ...row.unread,
      count: 0,
    },
  };
}

export function applyInboxSentMessage(
  row: ChatsInboxRow,
  message: Pick<
    LeadProfileV2ChatMessage,
    "id" | "channel" | "kind" | "senderKind" | "senderName" | "body" | "createdAt"
  >,
): ChatsInboxRow {
  const preview =
    message.body && message.body.trim() ? message.body.trim() : row.latestMessage?.preview ?? "";
  return {
    ...row,
    lastMessageAt: message.createdAt,
    latestMessage: {
      id: message.id,
      channel: message.channel,
      kind: message.kind,
      senderKind: message.senderKind,
      senderName: message.senderName,
      preview: preview.slice(0, 120),
      createdAt: message.createdAt,
    },
    unread: {
      ...row.unread,
      count: 0,
    },
  };
}

export function moveInboxRowToTop(
  rows: ChatsInboxRow[],
  leadId: string,
  update: (row: ChatsInboxRow) => ChatsInboxRow,
): ChatsInboxRow[] {
  const index = rows.findIndex((row) => row.leadId === leadId);
  if (index < 0) return rows;
  const next = update(rows[index]!);
  return [next, ...rows.filter((_, i) => i !== index)];
}

export function inboxInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "L";
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function formatInboxTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString("en-CA", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const ageMs = now.getTime() - date.getTime();
  if (ageMs >= 0 && ageMs < 6 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString("en-CA", { weekday: "short" });
  }
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

export function chatsViewLeadHref(leadId: string): string {
  return openLeadProfileHref(leadId);
}

export function inboxEmptyCopy(input: {
  filter: ChatsInboxFilter;
  q: string | null;
}): string {
  if (input.q) return "No matching chats.";
  if (input.filter === "unread") return "No unread chats.";
  return "No conversations yet.";
}
