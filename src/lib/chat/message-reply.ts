/**
 * Quoted-reply helpers. Reply targets must belong to the same conversation.
 */

export type ChatQuotedMessage = {
  id: string;
  senderName: string;
  body: string | null;
  deleted: boolean;
};

export type MessageReplyLookupDb = {
  message: {
    findFirst: (args: {
      where: {
        id: string;
        workspaceId: string;
        conversationId: string;
      };
      select: {
        id: true;
        senderName: true;
        body: true;
        deletedAt: true;
      };
    }) => Promise<{
      id: string;
      senderName: string;
      body: string | null;
      deletedAt: Date | null;
    } | null>;
    findMany: (args: {
      where: {
        workspaceId: string;
        conversationId: string;
        id: { in: string[] };
      };
      select: {
        id: true;
        senderName: true;
        body: true;
        deletedAt: true;
      };
    }) => Promise<
      Array<{
        id: string;
        senderName: string;
        body: string | null;
        deletedAt: Date | null;
      }>
    >;
  };
};

export function presentChatQuotedMessage(row: {
  id: string;
  senderName: string;
  body: string | null;
  deletedAt: Date | null;
}): ChatQuotedMessage {
  const deleted = Boolean(row.deletedAt);
  return {
    id: row.id,
    senderName: row.senderName,
    body: deleted ? null : row.body,
    deleted,
  };
}

export async function resolveReplyToMessageId(
  db: MessageReplyLookupDb,
  input: {
    workspaceId: string;
    conversationId: string;
    replyToMessageId: string | null | undefined;
  },
): Promise<
  | { ok: true; replyToMessageId: string | null }
  | { ok: false; reason: "REPLY_NOT_FOUND" }
> {
  const replyToMessageId = input.replyToMessageId?.trim() || null;
  if (!replyToMessageId) return { ok: true, replyToMessageId: null };

  const found = await db.message.findFirst({
    where: {
      id: replyToMessageId,
      workspaceId: input.workspaceId.trim(),
      conversationId: input.conversationId.trim(),
    },
    select: {
      id: true,
      senderName: true,
      body: true,
      deletedAt: true,
    },
  });
  if (!found) return { ok: false, reason: "REPLY_NOT_FOUND" };
  return { ok: true, replyToMessageId: found.id };
}

export async function loadQuotedMessagesById(
  db: MessageReplyLookupDb,
  input: {
    workspaceId: string;
    conversationId: string;
    replyToMessageIds: Array<string | null | undefined>;
  },
): Promise<Map<string, ChatQuotedMessage>> {
  const ids = [
    ...new Set(
      input.replyToMessageIds
        .map((id) => id?.trim() || "")
        .filter(Boolean),
    ),
  ];
  const map = new Map<string, ChatQuotedMessage>();
  if (ids.length === 0) return map;
  const rows = await db.message.findMany({
    where: {
      workspaceId: input.workspaceId.trim(),
      conversationId: input.conversationId.trim(),
      id: { in: ids },
    },
    select: {
      id: true,
      senderName: true,
      body: true,
      deletedAt: true,
    },
  });
  for (const row of rows) {
    map.set(row.id, presentChatQuotedMessage(row));
  }
  return map;
}

export function chatQuotePreviewBody(quote: ChatQuotedMessage): string {
  if (quote.deleted) return "Original message unavailable";
  const body = quote.body?.trim() || "";
  if (!body) return "Message";
  if (body.length <= 140) return body;
  return `${body.slice(0, 137)}…`;
}
