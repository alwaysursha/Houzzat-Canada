/**
 * Bounded message-context window for jump-to-message (search / quote).
 * Caller authorizes workspace + conversation membership.
 */

export const CONVERSATION_CONTEXT_BEFORE = 20;
export const CONVERSATION_CONTEXT_AFTER = 20;
export const CONVERSATION_CONTEXT_SIDE_MAX = 40;

export type ConversationContextAnchor = {
  id: string;
  createdAt: Date;
};

export type ConversationContextPage<T> = {
  anchorMessageId: string;
  messages: T[];
  page: {
    hasMoreOlder: boolean;
    hasMoreNewer: boolean;
    olderCursor: string | null;
  };
};

/** Minimal message lookup surface — kept loose for Prisma select variance. */
export type ConversationContextDb = {
  message: {
    findFirst: (args: {
      where: {
        id: string;
        workspaceId: string;
        conversationId: string;
      };
      select: Record<string, boolean>;
    }) => Promise<ConversationContextAnchor | null>;
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, "asc" | "desc">>;
      take: number;
      select: Record<string, boolean>;
    }) => Promise<ConversationContextAnchor[]>;
  };
};

function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

function olderThanFilter(anchor: ConversationContextAnchor) {
  return {
    OR: [
      { createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ],
  };
}

function newerThanFilter(anchor: ConversationContextAnchor) {
  return {
    OR: [
      { createdAt: { gt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { gt: anchor.id } },
    ],
  };
}

export function clampContextSide(raw: number | undefined, fallback: number): number {
  if (!Number.isFinite(raw) || raw == null || raw < 1) return fallback;
  return Math.min(Math.floor(raw), CONVERSATION_CONTEXT_SIDE_MAX);
}

/**
 * Load a bounded chronological window around an authorized conversation message.
 */
export async function loadConversationMessageContext<TRow extends ConversationContextAnchor>(
  db: ConversationContextDb,
  input: {
    workspaceId: string;
    conversationId: string;
    messageId: string;
    select: Record<string, boolean>;
    before?: number;
    after?: number;
  },
): Promise<ConversationContextPage<TRow> | null> {
  const workspaceId = input.workspaceId.trim();
  const conversationId = input.conversationId.trim();
  const messageId = input.messageId.trim();
  if (!workspaceId || !conversationId || !messageId) return null;

  const before = clampContextSide(input.before, CONVERSATION_CONTEXT_BEFORE);
  const after = clampContextSide(input.after, CONVERSATION_CONTEXT_AFTER);

  const anchor = (await db.message.findFirst({
    where: { id: messageId, workspaceId, conversationId },
    select: input.select,
  })) as TRow | null;
  if (!anchor) return null;

  const [olderDesc, newerAsc] = await Promise.all([
    db.message.findMany({
      where: {
        workspaceId,
        conversationId,
        ...olderThanFilter(anchor),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: before + 1,
      select: input.select,
    }) as Promise<TRow[]>,
    db.message.findMany({
      where: {
        workspaceId,
        conversationId,
        ...newerThanFilter(anchor),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: after + 1,
      select: input.select,
    }) as Promise<TRow[]>,
  ]);

  const hasMoreOlder = olderDesc.length > before;
  const hasMoreNewer = newerAsc.length > after;
  const older = (hasMoreOlder ? olderDesc.slice(0, before) : olderDesc).reverse();
  const newer = hasMoreNewer ? newerAsc.slice(0, after) : newerAsc;
  const messages = [...older, anchor, ...newer];
  const oldest = messages[0];

  return {
    anchorMessageId: anchor.id,
    messages,
    page: {
      hasMoreOlder,
      hasMoreNewer,
      olderCursor:
        hasMoreOlder && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
    },
  };
}

/** Merge context rows into an existing chronological transcript (dedupe by id). */
export function mergeMessagesWithContext<
  T extends { id: string; createdAt: string },
>(
  existing: T[],
  context: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const row of existing) byId.set(row.id, row);
  for (const row of context) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function applyContextPageState(input: {
  previousHasMore: boolean;
  previousNextCursor: string | null;
  contextHasMoreOlder: boolean;
  contextOlderCursor: string | null;
  mergedOldestId: string | null;
  contextOldestId: string | null;
}): { hasMore: boolean; nextCursor: string | null } {
  if (!input.contextHasMoreOlder) {
    if (
      input.previousHasMore &&
      input.previousNextCursor &&
      input.mergedOldestId &&
      input.contextOldestId &&
      input.mergedOldestId !== input.contextOldestId
    ) {
      return {
        hasMore: true,
        nextCursor: input.previousNextCursor,
      };
    }
    return {
      hasMore: input.previousHasMore,
      nextCursor: input.previousNextCursor,
    };
  }
  return {
    hasMore: true,
    nextCursor: input.contextOlderCursor ?? input.previousNextCursor,
  };
}
