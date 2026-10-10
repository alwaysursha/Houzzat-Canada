/**
 * Shared rich-chat features (reactions, search) for customer + agent APIs.
 * Authorization is caller-supplied; this module never trusts client identity.
 */
import {
  allowMessageReaction,
  loadMessageReactionRows,
  summarizeMessageReactions,
  toggleMessageReaction,
  type MessageReactionDb,
  type MessageReactionSummary,
} from "@/lib/chat/message-reactions";
import {
  loadQuotedMessagesById,
  type ChatQuotedMessage,
  type MessageReplyLookupDb,
} from "@/lib/chat/message-reply";
import {
  normalizeConversationSearchQuery,
  parseConversationSearchCursor,
  parseConversationSearchLimit,
  searchConversationMessages,
  type ConversationSearchDb,
  type ConversationSearchPage,
} from "@/lib/chat/conversation-search";
import {
  loadConversationMessageContext,
  type ConversationContextDb,
} from "@/lib/chat/message-context";
import {
  loadVoiceAttachmentsByMessageIds,
  type VoiceAttachmentLookupDb,
} from "@/lib/chat/voice-notes/attachments";
import type { VoiceNoteAttachmentView } from "@/lib/chat/voice-notes/send";

export type ChatRichMessageExtras = {
  replyToMessageId: string | null;
  replyTo: ChatQuotedMessage | null;
  deliveredAt: string | null;
  reactions: MessageReactionSummary[];
  attachments: VoiceNoteAttachmentView[];
};

export type ChatRichEnrichDb = MessageReactionDb &
  MessageReplyLookupDb &
  VoiceAttachmentLookupDb;

export async function enrichChatMessages<
  T extends {
    id: string;
    replyToMessageId?: string | null;
    deliveredAt?: Date | string | null;
  },
>(
  db: ChatRichEnrichDb,
  input: {
    workspaceId: string;
    conversationId: string;
    viewerUserId: string;
    messages: T[];
  },
): Promise<Map<string, ChatRichMessageExtras>> {
  const map = new Map<string, ChatRichMessageExtras>();
  if (input.messages.length === 0) return map;

  const messageIds = input.messages.map((m) => m.id);
  const [reactionRows, quotes, attachments] = await Promise.all([
    loadMessageReactionRows(db, {
      workspaceId: input.workspaceId,
      messageIds,
    }),
    loadQuotedMessagesById(db, {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      replyToMessageIds: input.messages.map((m) => m.replyToMessageId),
    }),
    loadVoiceAttachmentsByMessageIds(db, {
      workspaceId: input.workspaceId,
      messageIds,
    }).catch(() => new Map<string, VoiceNoteAttachmentView[]>()),
  ]);

  for (const message of input.messages) {
    const replyToMessageId = message.replyToMessageId ?? null;
    const deliveredAt =
      message.deliveredAt instanceof Date
        ? message.deliveredAt.toISOString()
        : typeof message.deliveredAt === "string"
          ? message.deliveredAt
          : null;
    map.set(message.id, {
      replyToMessageId,
      replyTo: replyToMessageId
        ? quotes.get(replyToMessageId) ?? {
            id: replyToMessageId,
            senderName: "Unknown",
            body: null,
            deleted: true,
          }
        : null,
      deliveredAt,
      reactions: summarizeMessageReactions({
        rows: reactionRows,
        messageId: message.id,
        viewerUserId: input.viewerUserId,
      }),
      attachments: attachments.get(message.id) ?? [],
    });
  }
  return map;
}

export async function handleToggleConversationReaction(
  db: MessageReactionDb,
  input: {
    workspaceId: string;
    conversationId: string;
    messageId: string;
    userId: string;
    key: string;
  },
): Promise<
  | { ok: true; status: 200; body: { reactions: MessageReactionSummary[] } }
  | { ok: false; status: number; body: unknown }
> {
  const rate = allowMessageReaction({
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      body: {
        error: "Too many reactions.",
        code: "RATE_LIMITED",
        retryAfterSec: rate.retryAfterSec,
      },
    };
  }

  const result = await toggleMessageReaction(db, input);
  if (!result.ok) {
    if (result.reason === "INVALID_KEY") {
      return { ok: false, status: 400, body: { error: "Invalid reaction" } };
    }
    if (result.reason === "MESSAGE_NOT_FOUND") {
      return { ok: false, status: 404, body: { error: "Not found" } };
    }
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }
  return {
    ok: true,
    status: 200,
    body: { reactions: result.summaries },
  };
}

export async function handleConversationSearchRequest(
  db: ConversationSearchDb,
  input: {
    workspaceId: string;
    conversationId: string;
    url: URL;
  },
): Promise<
  | { ok: true; status: 200; body: ConversationSearchPage }
  | { ok: false; status: number; body: unknown }
> {
  const query = normalizeConversationSearchQuery(input.url.searchParams.get("q"));
  if (!query) {
    return { ok: false, status: 400, body: { error: "Invalid query" } };
  }
  const cursorRaw = input.url.searchParams.get("cursor");
  const cursor = parseConversationSearchCursor(cursorRaw);
  if (cursorRaw && !cursor) {
    return { ok: false, status: 400, body: { error: "Invalid cursor" } };
  }
  const limit = parseConversationSearchLimit(
    input.url.searchParams.get("limit"),
  );
  const page = await searchConversationMessages(db, {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    query,
    limit,
    cursor,
  });
  return { ok: true, status: 200, body: page };
}

export async function loadAuthorizedMessageContextRows<
  TRow extends { id: string; createdAt: Date },
>(
  db: ConversationContextDb,
  input: {
    workspaceId: string;
    conversationId: string;
    messageId: string;
    select: Record<string, boolean>;
  },
) {
  return loadConversationMessageContext<TRow>(db, input);
}
