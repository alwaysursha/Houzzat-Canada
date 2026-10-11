/**
 * Conversation typing state writes. Callers authorize first.
 * Uses updateMany with conditional where-clauses for concurrency safety.
 */

import { TYPING_REFRESH_REMAINING_MS } from "@/lib/chat/typing/constants";
import {
  maxClearableTypingUntil,
  nextTypingUntil,
  shouldSkipActiveTypingRefresh,
} from "@/lib/chat/typing/state";

export type ConversationTypingSide = "customer" | "agent";

export type ConversationTypingRow = {
  customerTypingUntil: Date | null;
  agentTypingUntil: Date | null;
};

export type ConversationTypingDb = {
  conversation: {
    findUnique: (args: {
      where: {
        workspaceId_id: { workspaceId: string; id: string };
      };
      select: {
        customerTypingUntil: true;
        agentTypingUntil: true;
      };
    }) => Promise<ConversationTypingRow | null>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

function fieldForSide(side: ConversationTypingSide):
  | "customerTypingUntil"
  | "agentTypingUntil" {
  return side === "customer" ? "customerTypingUntil" : "agentTypingUntil";
}

export async function loadConversationTypingState(
  db: ConversationTypingDb,
  input: { workspaceId: string; conversationId: string },
): Promise<ConversationTypingRow | null> {
  return db.conversation.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: input.workspaceId,
        id: input.conversationId,
      },
    },
    select: {
      customerTypingUntil: true,
      agentTypingUntil: true,
    },
  });
}

export async function setConversationTypingState(
  db: ConversationTypingDb,
  input: {
    workspaceId: string;
    conversationId: string;
    side: ConversationTypingSide;
    active: boolean;
    now?: Date;
  },
): Promise<{ updated: boolean; skipped: boolean }> {
  const now = input.now ?? new Date();
  const field = fieldForSide(input.side);
  const current = await loadConversationTypingState(db, {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
  });
  if (!current) {
    return { updated: false, skipped: false };
  }

  if (input.active) {
    const currentUntil = current[field];
    if (shouldSkipActiveTypingRefresh(currentUntil, now)) {
      return { updated: false, skipped: true };
    }
    const until = nextTypingUntil(now);
    const freshCutoff = new Date(now.getTime() + TYPING_REFRESH_REMAINING_MS);
    const result = await db.conversation.updateMany({
      where: {
        workspaceId: input.workspaceId,
        id: input.conversationId,
        OR: [{ [field]: null }, { [field]: { lte: freshCutoff } }],
      },
      data: { [field]: until },
    });
    return { updated: result.count > 0, skipped: result.count === 0 };
  }

  const maxClearable = maxClearableTypingUntil(now);
  const result = await db.conversation.updateMany({
    where: {
      workspaceId: input.workspaceId,
      id: input.conversationId,
      [field]: { not: null, lte: maxClearable },
    },
    data: { [field]: null },
  });
  return { updated: result.count > 0, skipped: result.count === 0 };
}

/** Force-clear sender typing after a successful message send. */
export async function clearConversationTypingOnSend(
  db: ConversationTypingDb,
  input: {
    workspaceId: string;
    conversationId: string;
    side: ConversationTypingSide;
  },
): Promise<void> {
  const field = fieldForSide(input.side);
  await db.conversation.updateMany({
    where: {
      workspaceId: input.workspaceId,
      id: input.conversationId,
      [field]: { not: null },
    },
    data: { [field]: null },
  });
}
