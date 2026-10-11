/**
 * Agent unread-reminder eligibility + atomic claim (Chat V1 / M4R).
 *
 * Streak identity = (first unread CUSTOMER message id in the assignee unread
 * window, current Lead.assignedAgentId). Not lastMessageAt / latest message /
 * unread count. Presence is ignored. Claim-before-send; no push here.
 *
 * Narrow Db surface so this compiles before prisma generate for M4Q columns.
 * Cron / push delivery are intentionally out of scope.
 */

import { CUSTOMER_CHAT_PUSH_TYPE } from "@/lib/notifications/customer-chat-agent-push";
import { isPushTypeEnabled } from "@/lib/notifications/catalog";
import {
  ASSIGNMENT_ACTIVITY_TYPES,
  CONVERSATION_READ_MESSAGE_SELECT,
  isAgentCursorValid,
  isAssignmentCard,
  isInAgentUnreadWindow,
  resolveAgentCutoff,
  type AgentCutoff,
  type ConversationReadMessage,
} from "@/lib/conversations/read-state";
import type { LeadConversationRecord } from "@/lib/conversations/lead-conversation";

/** One follow-up after the first unread customer message ages past this delay. */
export const AGENT_UNREAD_REMINDER_DELAY_MS = 15 * 60 * 1000;

export type AgentUnreadReminderSkipReason =
  | "INVALID_INPUT"
  | "CONVERSATION_NOT_FOUND"
  | "LEAD_NOT_FOUND"
  | "WORKSPACE_MISMATCH"
  | "WORKSPACE_INACTIVE"
  | "CONVERSATION_BLOCKED"
  | "UNASSIGNED"
  | "AGENT_INELIGIBLE"
  | "NO_UNREAD_CUSTOMER"
  | "TOO_RECENT"
  | "ALREADY_CLAIMED"
  | "PREFERENCE_OFF"
  | "CLAIM_LOST"
  | "ASSIGNMENT_CHANGED"
  | "CURSOR_CHANGED";

export type AgentUnreadReminderStreak = {
  streakMessageId: string;
  streakCreatedAt: Date;
  unreadCustomerCount: number;
  assignedAgentId: string;
};

export type AgentUnreadReminderClaim = {
  workspaceId: string;
  conversationId: string;
  leadId: string;
  assignedAgentId: string;
  streakMessageId: string;
  streakCreatedAt: Date;
  remindedAt: Date;
};

export type EvaluateAgentUnreadReminderResult =
  | { ok: true; streak: AgentUnreadReminderStreak }
  | { ok: false; reason: AgentUnreadReminderSkipReason };

export type ClaimAgentUnreadReminderResult =
  | { ok: true; claim: AgentUnreadReminderClaim }
  | { ok: false; reason: AgentUnreadReminderSkipReason };

export type AgentUnreadReminderConversationRow = {
  id: string;
  workspaceId: string;
  leadId: string;
  status: "OPEN" | "BLOCKED" | string;
  agentLastReadAt: Date | null;
  agentLastReadByUserId: string | null;
  agentUnreadReminderMessageId: string | null;
  agentUnreadReminderAgentId: string | null;
  agentUnreadRemindedAt: Date | null;
  lastMessageAt: Date | null;
  createdAt: Date;
};

export type AgentUnreadReminderLeadRow = {
  id: string;
  workspaceId: string | null;
  assignedAgentId: string | null;
};

export type AgentUnreadReminderLockedRow = AgentUnreadReminderConversationRow & {
  assignedAgentId: string | null;
};

export type AgentUnreadReminderTx = {
  conversation: {
    findUnique: (args: Record<string, unknown>) => Promise<AgentUnreadReminderConversationRow | null>;
  };
  lead: {
    findUnique: (args: Record<string, unknown>) => Promise<AgentUnreadReminderLeadRow | null>;
  };
  message: {
    findMany: (args: Record<string, unknown>) => Promise<ConversationReadMessage[]>;
    findFirst: (args: Record<string, unknown>) => Promise<ConversationReadMessage | null>;
  };
  leadActivity: {
    findFirst: (
      args: Record<string, unknown>,
    ) => Promise<{ id: string; createdAt: Date } | null>;
  };
  user: {
    findUnique: (args: Record<string, unknown>) => Promise<{
      id: string;
      disabledAt: Date | null;
      pushNotificationPrefs: unknown;
    } | null>;
  };
  workspace: {
    findUnique: (args: Record<string, unknown>) => Promise<{
      id: string;
      status: string;
    } | null>;
  };
  workspaceMember: {
    findFirst: (args: Record<string, unknown>) => Promise<{ id: string } | null>;
  };
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
  $queryRaw: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
};

export type AgentUnreadReminderDb = AgentUnreadReminderTx & {
  $transaction: <T>(fn: (tx: AgentUnreadReminderTx) => Promise<T>) => Promise<T>;
};

export type ClaimAgentUnreadReminderInput = {
  /** Trusted server workspace id — never from the client. */
  workspaceId: string;
  /** Trusted conversation id scoped to workspaceId. */
  conversationId: string;
  /** Injected clock for tests; production uses server `new Date()`. */
  now?: Date;
};

function parseIds(input: {
  workspaceId: string;
  conversationId: string;
}): { workspaceId: string; conversationId: string } | null {
  const workspaceId = input.workspaceId.trim();
  const conversationId = input.conversationId.trim();
  if (!workspaceId || !conversationId) return null;
  return { workspaceId, conversationId };
}

function toLeadConversationRecord(
  row: Pick<
    AgentUnreadReminderConversationRow,
    | "id"
    | "workspaceId"
    | "leadId"
    | "status"
    | "createdAt"
    | "agentLastReadAt"
    | "agentLastReadByUserId"
    | "lastMessageAt"
  >,
): LeadConversationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    leadId: row.leadId,
    status: row.status as LeadConversationRecord["status"],
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
    customerLastReadAt: null,
    agentLastReadAt: row.agentLastReadAt,
    agentLastReadByUserId: row.agentLastReadByUserId,
  };
}

/**
 * Soft prefilter for a future cron batch. Not authoritative — claim rechecks.
 * Uses existing Conversation (workspaceId, lastMessageAt) index shape.
 */
export function isLikelyAgentUnreadReminderCandidate(
  row: Pick<
    AgentUnreadReminderConversationRow,
    "status" | "lastMessageAt" | "agentUnreadReminderMessageId" | "agentUnreadReminderAgentId"
  >,
  now: Date,
): boolean {
  if (row.status !== "OPEN") return false;
  if (!row.lastMessageAt) return false;
  if (now.getTime() - row.lastMessageAt.getTime() < AGENT_UNREAD_REMINDER_DELAY_MS) {
    return false;
  }
  return true;
}

export function isAgentUnreadReminderStreakClaimed(
  conversation: Pick<
    AgentUnreadReminderConversationRow,
    "agentUnreadReminderMessageId" | "agentUnreadReminderAgentId"
  >,
  streak: Pick<AgentUnreadReminderStreak, "streakMessageId" | "assignedAgentId">,
): boolean {
  return (
    conversation.agentUnreadReminderMessageId === streak.streakMessageId &&
    conversation.agentUnreadReminderAgentId === streak.assignedAgentId
  );
}

/**
 * First CUSTOMER message in the current assignee unread window.
 * Additional later customer messages do not change streak identity.
 */
export function resolveAgentCustomerUnreadStreak(
  messages: ConversationReadMessage[],
  assignedAgentId: string,
  cutoff: AgentCutoff,
): Omit<AgentUnreadReminderStreak, "assignedAgentId"> | null {
  let streakMessageId: string | null = null;
  let streakCreatedAt: Date | null = null;
  let unreadCustomerCount = 0;

  for (const message of messages) {
    if (message.senderKind !== "CUSTOMER") continue;
    if (!isInAgentUnreadWindow(message, cutoff)) continue;
    if (!streakMessageId) {
      streakMessageId = message.id;
      streakCreatedAt = message.createdAt;
    }
    if (!message.deletedAt) unreadCustomerCount += 1;
  }

  if (!streakMessageId || !streakCreatedAt || unreadCustomerCount < 1) {
    return null;
  }
  return { streakMessageId, streakCreatedAt, unreadCustomerCount };
}

export function evaluateAgentUnreadReminderEligibility(input: {
  conversation: AgentUnreadReminderConversationRow | null;
  lead: AgentUnreadReminderLeadRow | null;
  trustedWorkspaceId: string;
  workspaceStatus: string | null;
  agentDisabledAt: Date | null | undefined;
  agentIsActiveMember: boolean;
  pushNotificationPrefs: unknown;
  messages: ConversationReadMessage[];
  latestAssignmentActivity: { id: string; createdAt: Date } | null;
  now: Date;
}): EvaluateAgentUnreadReminderResult {
  const conversation = input.conversation;
  if (!conversation) return { ok: false, reason: "CONVERSATION_NOT_FOUND" };
  if (conversation.workspaceId !== input.trustedWorkspaceId) {
    return { ok: false, reason: "WORKSPACE_MISMATCH" };
  }
  if (conversation.status === "BLOCKED") {
    return { ok: false, reason: "CONVERSATION_BLOCKED" };
  }
  if (conversation.status !== "OPEN") {
    return { ok: false, reason: "CONVERSATION_BLOCKED" };
  }

  const lead = input.lead;
  if (!lead) return { ok: false, reason: "LEAD_NOT_FOUND" };
  if (!lead.workspaceId || lead.workspaceId !== input.trustedWorkspaceId) {
    return { ok: false, reason: "WORKSPACE_MISMATCH" };
  }
  if (lead.id !== conversation.leadId) {
    return { ok: false, reason: "WORKSPACE_MISMATCH" };
  }
  if (input.workspaceStatus !== "ACTIVE") {
    return { ok: false, reason: "WORKSPACE_INACTIVE" };
  }

  const assignedAgentId = lead.assignedAgentId?.trim() || null;
  if (!assignedAgentId) return { ok: false, reason: "UNASSIGNED" };
  if (input.agentDisabledAt) return { ok: false, reason: "AGENT_INELIGIBLE" };
  if (!input.agentIsActiveMember) return { ok: false, reason: "AGENT_INELIGIBLE" };

  if (!isPushTypeEnabled(input.pushNotificationPrefs, CUSTOMER_CHAT_PUSH_TYPE)) {
    return { ok: false, reason: "PREFERENCE_OFF" };
  }

  const leadConversation = toLeadConversationRecord(conversation);
  const agentCutoff = resolveAgentCutoff(
    leadConversation,
    assignedAgentId,
    input.messages,
    input.latestAssignmentActivity,
  );
  // Cursor validity is already folded into resolveAgentCutoff; keep the helper
  // referenced so reassignment semantics stay aligned with read-state.
  void isAgentCursorValid(leadConversation, assignedAgentId);

  const streakBody = resolveAgentCustomerUnreadStreak(
    input.messages,
    assignedAgentId,
    agentCutoff,
  );
  if (!streakBody) return { ok: false, reason: "NO_UNREAD_CUSTOMER" };

  const streak: AgentUnreadReminderStreak = {
    ...streakBody,
    assignedAgentId,
  };

  if (isAgentUnreadReminderStreakClaimed(conversation, streak)) {
    return { ok: false, reason: "ALREADY_CLAIMED" };
  }

  const ageMs = input.now.getTime() - streak.streakCreatedAt.getTime();
  if (ageMs < AGENT_UNREAD_REMINDER_DELAY_MS) {
    return { ok: false, reason: "TOO_RECENT" };
  }

  return { ok: true, streak };
}

async function loadMessagesForConversation(
  tx: AgentUnreadReminderTx,
  conversation: Pick<AgentUnreadReminderConversationRow, "workspaceId" | "id">,
): Promise<ConversationReadMessage[]> {
  return tx.message.findMany({
    where: {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
    },
    orderBy: { createdAt: "asc" },
    select: CONVERSATION_READ_MESSAGE_SELECT,
  });
}

async function loadLatestAssignmentActivity(
  tx: AgentUnreadReminderTx,
  leadId: string,
): Promise<{ id: string; createdAt: Date } | null> {
  return tx.leadActivity.findFirst({
    where: {
      leadId,
      type: { in: [...ASSIGNMENT_ACTIVITY_TYPES] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
}

async function lockConversationAndLead(
  tx: AgentUnreadReminderTx,
  workspaceId: string,
  conversationId: string,
): Promise<AgentUnreadReminderLockedRow | null> {
  const lockKey = `agent-unread-reminder:${workspaceId}:${conversationId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const rows = await tx.$queryRaw<AgentUnreadReminderLockedRow[]>`
    SELECT
      c."id" AS "id",
      c."workspaceId" AS "workspaceId",
      c."leadId" AS "leadId",
      c."status"::text AS "status",
      c."agentLastReadAt" AS "agentLastReadAt",
      c."agentLastReadByUserId" AS "agentLastReadByUserId",
      c."agentUnreadReminderMessageId" AS "agentUnreadReminderMessageId",
      c."agentUnreadReminderAgentId" AS "agentUnreadReminderAgentId",
      c."agentUnreadRemindedAt" AS "agentUnreadRemindedAt",
      c."lastMessageAt" AS "lastMessageAt",
      c."createdAt" AS "createdAt",
      l."assignedAgentId" AS "assignedAgentId"
    FROM "Conversation" c
    INNER JOIN "Lead" l
      ON l."id" = c."leadId"
     AND l."workspaceId" = c."workspaceId"
    WHERE c."workspaceId" = ${workspaceId}
      AND c."id" = ${conversationId}
    FOR UPDATE OF c, l
  `;
  return rows[0] ?? null;
}

async function tryClaimReminderRow(
  tx: AgentUnreadReminderTx,
  input: {
    workspaceId: string;
    conversationId: string;
    leadId: string;
    assignedAgentId: string;
    streakMessageId: string;
    agentLastReadAt: Date | null;
    agentLastReadByUserId: string | null;
    remindedAt: Date;
  },
): Promise<boolean> {
  const updated = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "Conversation" AS c
    SET
      "agentUnreadReminderMessageId" = ${input.streakMessageId},
      "agentUnreadReminderAgentId" = ${input.assignedAgentId},
      "agentUnreadRemindedAt" = ${input.remindedAt}
    FROM "Lead" AS l
    WHERE c."workspaceId" = ${input.workspaceId}
      AND c."id" = ${input.conversationId}
      AND c."status" = 'OPEN'
      AND l."workspaceId" = c."workspaceId"
      AND l."id" = c."leadId"
      AND l."id" = ${input.leadId}
      AND l."assignedAgentId" = ${input.assignedAgentId}
      AND c."agentLastReadAt" IS NOT DISTINCT FROM ${input.agentLastReadAt}
      AND c."agentLastReadByUserId" IS NOT DISTINCT FROM ${input.agentLastReadByUserId}
      AND (
        c."agentUnreadReminderMessageId" IS DISTINCT FROM ${input.streakMessageId}
        OR c."agentUnreadReminderAgentId" IS DISTINCT FROM ${input.assignedAgentId}
      )
    RETURNING c."id" AS "id"
  `;
  return updated.length === 1;
}

/**
 * Atomically claim one agent unread reminder for a conversation.
 * Re-evaluates eligibility under an advisory lock + FOR UPDATE on
 * Conversation and Lead. Does not send push.
 */
export async function claimAgentUnreadReminder(
  db: AgentUnreadReminderDb,
  input: ClaimAgentUnreadReminderInput,
): Promise<ClaimAgentUnreadReminderResult> {
  const ids = parseIds(input);
  if (!ids) return { ok: false, reason: "INVALID_INPUT" };
  const now = input.now ?? new Date();

  return db.$transaction(async (tx) => {
    const locked = await lockConversationAndLead(
      tx,
      ids.workspaceId,
      ids.conversationId,
    );
    if (!locked) return { ok: false as const, reason: "CONVERSATION_NOT_FOUND" as const };
    if (locked.workspaceId !== ids.workspaceId) {
      return { ok: false as const, reason: "WORKSPACE_MISMATCH" as const };
    }

    const workspace = await tx.workspace.findUnique({
      where: { id: ids.workspaceId },
      select: { id: true, status: true },
    });
    const assignedAgentId = locked.assignedAgentId?.trim() || null;
    const agent = assignedAgentId
      ? await tx.user.findUnique({
          where: { id: assignedAgentId },
          select: {
            id: true,
            disabledAt: true,
            pushNotificationPrefs: true,
          },
        })
      : null;
    const member =
      assignedAgentId != null
        ? await tx.workspaceMember.findFirst({
            where: {
              workspaceId: ids.workspaceId,
              userId: assignedAgentId,
              status: "ACTIVE",
            },
            select: { id: true },
          })
        : null;

    const messages = await loadMessagesForConversation(tx, locked);
    const needsAssignmentFallback =
      Boolean(assignedAgentId) &&
      !isAgentCursorValid(
        { agentLastReadByUserId: locked.agentLastReadByUserId },
        assignedAgentId,
      ) &&
      !messages.some(isAssignmentCard);
    const latestAssignmentActivity = needsAssignmentFallback
      ? await loadLatestAssignmentActivity(tx, locked.leadId)
      : null;

    const cursorSnapshot = {
      agentLastReadAt: locked.agentLastReadAt,
      agentLastReadByUserId: locked.agentLastReadByUserId,
      assignedAgentId,
    };

    const evaluated = evaluateAgentUnreadReminderEligibility({
      conversation: locked,
      lead: {
        id: locked.leadId,
        workspaceId: locked.workspaceId,
        assignedAgentId: locked.assignedAgentId,
      },
      trustedWorkspaceId: ids.workspaceId,
      workspaceStatus: workspace?.status ?? null,
      agentDisabledAt: agent?.disabledAt,
      agentIsActiveMember: Boolean(member),
      pushNotificationPrefs: agent?.pushNotificationPrefs,
      messages,
      latestAssignmentActivity,
      now,
    });
    if (!evaluated.ok) return evaluated;

    // Detect mid-flight assignment / cursor drift before write (defense in depth).
    if (cursorSnapshot.assignedAgentId !== evaluated.streak.assignedAgentId) {
      return { ok: false as const, reason: "ASSIGNMENT_CHANGED" as const };
    }

    const claimed = await tryClaimReminderRow(tx, {
      workspaceId: ids.workspaceId,
      conversationId: ids.conversationId,
      leadId: locked.leadId,
      assignedAgentId: evaluated.streak.assignedAgentId,
      streakMessageId: evaluated.streak.streakMessageId,
      agentLastReadAt: cursorSnapshot.agentLastReadAt,
      agentLastReadByUserId: cursorSnapshot.agentLastReadByUserId,
      remindedAt: now,
    });
    if (!claimed) {
      // Distinguish likely causes for callers/tests; both mean do not push.
      const refreshed = await tx.conversation.findUnique({
        where: {
          workspaceId_id: {
            workspaceId: ids.workspaceId,
            id: ids.conversationId,
          },
        },
      });
      const leadNow = await tx.lead.findUnique({
        where: {
          workspaceId_id: {
            workspaceId: ids.workspaceId,
            id: locked.leadId,
          },
        },
      });
      if (
        leadNow?.assignedAgentId &&
        leadNow.assignedAgentId !== evaluated.streak.assignedAgentId
      ) {
        return { ok: false as const, reason: "ASSIGNMENT_CHANGED" as const };
      }
      if (
        refreshed &&
        (refreshed.agentLastReadAt?.getTime() !==
          cursorSnapshot.agentLastReadAt?.getTime() ||
          refreshed.agentLastReadByUserId !==
            cursorSnapshot.agentLastReadByUserId)
      ) {
        return { ok: false as const, reason: "CURSOR_CHANGED" as const };
      }
      if (
        refreshed &&
        isAgentUnreadReminderStreakClaimed(refreshed, evaluated.streak)
      ) {
        return { ok: false as const, reason: "ALREADY_CLAIMED" as const };
      }
      return { ok: false as const, reason: "CLAIM_LOST" as const };
    }

    return {
      ok: true as const,
      claim: {
        workspaceId: ids.workspaceId,
        conversationId: ids.conversationId,
        leadId: locked.leadId,
        assignedAgentId: evaluated.streak.assignedAgentId,
        streakMessageId: evaluated.streak.streakMessageId,
        streakCreatedAt: evaluated.streak.streakCreatedAt,
        remindedAt: now,
      },
    };
  });
}
