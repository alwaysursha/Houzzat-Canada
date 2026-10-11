/**
 * In-conversation message text search. Caller authorizes conversation access.
 */

export const CONVERSATION_SEARCH_PAGE_SIZE = 20;
export const CONVERSATION_SEARCH_PAGE_MAX = 40;
export const CONVERSATION_SEARCH_QUERY_MAX = 80;

export type ConversationSearchHit = {
  id: string;
  body: string;
  senderName: string;
  senderKind: string;
  createdAt: string;
};

export type ConversationSearchPage = {
  query: string;
  hits: ConversationSearchHit[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type ConversationSearchDb = {
  message: {
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, "asc" | "desc">>;
      take: number;
      select: {
        id: true;
        body: true;
        senderName: true;
        senderKind: true;
        createdAt: true;
      };
    }) => Promise<
      Array<{
        id: string;
        body: string | null;
        senderName: string;
        senderKind: string;
        createdAt: Date;
      }>
    >;
  };
};

function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function parseConversationSearchCursor(
  raw: string | null | undefined,
): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  const sep = raw.indexOf("|");
  if (sep <= 0) return null;
  const iso = raw.slice(0, sep);
  const id = raw.slice(sep + 1).trim();
  if (!id) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

export function normalizeConversationSearchQuery(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const q = raw.replace(/\s+/g, " ").trim();
  if (!q || q.length > CONVERSATION_SEARCH_QUERY_MAX) return null;
  return q;
}

export function parseConversationSearchLimit(
  raw: string | null | undefined,
): number {
  if (!raw) return CONVERSATION_SEARCH_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return CONVERSATION_SEARCH_PAGE_SIZE;
  return Math.min(n, CONVERSATION_SEARCH_PAGE_MAX);
}

export async function searchConversationMessages(
  db: ConversationSearchDb,
  input: {
    workspaceId: string;
    conversationId: string;
    query: string;
    limit: number;
    cursor: { createdAt: Date; id: string } | null;
  },
): Promise<ConversationSearchPage> {
  const query = normalizeConversationSearchQuery(input.query);
  if (!query) {
    return {
      query: "",
      hits: [],
      page: { limit: input.limit, hasMore: false, nextCursor: null },
    };
  }

  const cursorFilter = input.cursor
    ? {
        OR: [
          { createdAt: { lt: input.cursor.createdAt } },
          {
            createdAt: input.cursor.createdAt,
            id: { lt: input.cursor.id },
          },
        ],
      }
    : {};

  const rows = await db.message.findMany({
    where: {
      workspaceId: input.workspaceId.trim(),
      conversationId: input.conversationId.trim(),
      deletedAt: null,
      kind: "TEXT",
      body: { contains: query, mode: "insensitive" },
      ...cursorFilter,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      id: true,
      body: true,
      senderName: true,
      senderKind: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    query,
    hits: pageRows.map((row) => ({
      id: row.id,
      body: row.body ?? "",
      senderName: row.senderName,
      senderKind: row.senderKind,
      createdAt: row.createdAt.toISOString(),
    })),
    page: {
      limit: input.limit,
      hasMore,
      nextCursor:
        hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    },
  };
}
