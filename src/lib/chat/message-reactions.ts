/**
 * MessageReaction upsert/remove for authorized conversation members.
 * Caller must authorize membership and pass trusted workspace + user ids.
 */
import {
  isAllowedChatReactionKey,
  normalizeChatReactionKey,
  type ChatReactionKey,
} from "@/lib/chat/emoji-catalog";

export type MessageReactionRow = {
  messageId: string;
  userId: string;
  key: string;
};

export type MessageReactionSummary = {
  key: ChatReactionKey;
  count: number;
  reactedByMe: boolean;
};

export type MessageReactionDb = {
  message: {
    findFirst: (args: {
      where: {
        id: string;
        workspaceId: string;
        conversationId: string;
      };
      select: { id: true; workspaceId: true; conversationId: true };
    }) => Promise<{
      id: string;
      workspaceId: string;
      conversationId: string;
    } | null>;
  };
  messageReaction: {
    findUnique: (args: {
      where: { messageId_userId: { messageId: string; userId: string } };
      select: { id: true; key: true };
    }) => Promise<{ id: string; key: string } | null>;
    findMany: (args: {
      where: { workspaceId: string; messageId: { in: string[] } };
      select: { messageId: true; userId: true; key: true };
    }) => Promise<MessageReactionRow[]>;
    create: (args: {
      data: {
        workspaceId: string;
        messageId: string;
        userId: string;
        key: string;
      };
      select: { id: true; key: true };
    }) => Promise<{ id: string; key: string }>;
    update: (args: {
      where: { id: string };
      data: { key: string };
      select: { id: true; key: true };
    }) => Promise<{ id: string; key: string }>;
    delete: (args: {
      where: { id: string };
    }) => Promise<unknown>;
  };
};

export type ToggleMessageReactionResult =
  | {
      ok: true;
      action: "added" | "changed" | "removed" | "noop";
      summaries: MessageReactionSummary[];
    }
  | {
      ok: false;
      reason: "INVALID_KEY" | "MESSAGE_NOT_FOUND" | "INVALID_INPUT";
    };

const REACTION_LIMIT = 40;
const REACTION_WINDOW_MS = 60_000;
type Bucket = { count: number; resetAt: number };
const reactionBuckets = new Map<string, Bucket>();

export function allowMessageReaction(input: {
  userId: string;
  workspaceId: string;
  now?: number;
}): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const userId = input.userId.trim();
  const workspaceId = input.workspaceId.trim();
  if (!userId || !workspaceId) {
    return { allowed: false, retryAfterSec: 1 };
  }
  const now = input.now ?? Date.now();
  if (reactionBuckets.size > 2000) {
    for (const [key, bucket] of reactionBuckets) {
      if (bucket.resetAt <= now) reactionBuckets.delete(key);
    }
  }
  const key = `${userId}:${workspaceId}`;
  const bucket = reactionBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    reactionBuckets.set(key, { count: 1, resetAt: now + REACTION_WINDOW_MS });
    return { allowed: true };
  }
  if (bucket.count >= REACTION_LIMIT) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true };
}

export function clearMessageReactionRateLimitsForTests(): void {
  reactionBuckets.clear();
}

export function summarizeMessageReactions(input: {
  rows: MessageReactionRow[];
  messageId: string;
  viewerUserId: string;
}): MessageReactionSummary[] {
  const counts = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const row of input.rows) {
    if (row.messageId !== input.messageId) continue;
    if (!isAllowedChatReactionKey(row.key)) continue;
    const current = counts.get(row.key) ?? { count: 0, reactedByMe: false };
    current.count += 1;
    if (row.userId === input.viewerUserId) current.reactedByMe = true;
    counts.set(row.key, current);
  }
  return [...counts.entries()]
    .map(([key, value]) => ({
      key: key as ChatReactionKey,
      count: value.count,
      reactedByMe: value.reactedByMe,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export async function loadMessageReactionRows(
  db: MessageReactionDb,
  input: { workspaceId: string; messageIds: string[] },
): Promise<MessageReactionRow[]> {
  const ids = [...new Set(input.messageIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  return db.messageReaction.findMany({
    where: {
      workspaceId: input.workspaceId,
      messageId: { in: ids },
    },
    select: { messageId: true, userId: true, key: true },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Toggle the viewer's reaction on a message in a trusted conversation.
 * One reaction per user per message (unique messageId+userId).
 * Create races against the unique constraint are handled safely.
 * Updates/deletes always target the viewer's own (messageId,userId) row.
 */
export async function toggleMessageReaction(
  db: MessageReactionDb,
  input: {
    workspaceId: string;
    conversationId: string;
    messageId: string;
    userId: string;
    key: string;
  },
): Promise<ToggleMessageReactionResult> {
  const workspaceId = input.workspaceId.trim();
  const conversationId = input.conversationId.trim();
  const messageId = input.messageId.trim();
  const userId = input.userId.trim();
  const key = normalizeChatReactionKey(input.key);
  if (!workspaceId || !conversationId || !messageId || !userId) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  if (!key) return { ok: false, reason: "INVALID_KEY" };

  const message = await db.message.findFirst({
    where: { id: messageId, workspaceId, conversationId },
    select: { id: true, workspaceId: true, conversationId: true },
  });
  if (!message) return { ok: false, reason: "MESSAGE_NOT_FOUND" };

  const existing = await db.messageReaction.findUnique({
    where: { messageId_userId: { messageId, userId } },
    select: { id: true, key: true },
  });

  let action: "added" | "changed" | "removed" | "noop" = "noop";
  if (!existing) {
    try {
      await db.messageReaction.create({
        data: { workspaceId, messageId, userId, key },
        select: { id: true, key: true },
      });
      action = "added";
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // Concurrent create: re-read this user's row only, then change/remove.
      const raced = await db.messageReaction.findUnique({
        where: { messageId_userId: { messageId, userId } },
        select: { id: true, key: true },
      });
      if (!raced) {
        action = "noop";
      } else if (raced.key === key) {
        action = "noop";
      } else {
        await db.messageReaction.update({
          where: { id: raced.id },
          data: { key },
          select: { id: true, key: true },
        });
        action = "changed";
      }
    }
  } else if (existing.key === key) {
    await db.messageReaction.delete({ where: { id: existing.id } });
    action = "removed";
  } else {
    await db.messageReaction.update({
      where: { id: existing.id },
      data: { key },
      select: { id: true, key: true },
    });
    action = "changed";
  }

  const rows = await loadMessageReactionRows(db, {
    workspaceId,
    messageIds: [messageId],
  });
  return {
    ok: true,
    action,
    summaries: summarizeMessageReactions({
      rows,
      messageId,
      viewerUserId: userId,
    }),
  };
}
