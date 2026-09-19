/**
 * Canonical HouzzatPRO Conversation read/unread state.
 *
 * AUTHORIZATION BOUNDARY
 * Tenant-safe cursor math only. Does not prove the caller may act.
 * Agent APIs must confirm the viewer is Lead.assignedAgentId before
 * markConversationReadByAgent. Customer APIs must prove Lead ownership
 * before markConversationReadByCustomer. Admin must NOT call Agent mark-read.
 *
 * Agent cursor is valid only when:
 *   Conversation.agentLastReadByUserId === Lead.assignedAgentId
 * Do not infer ownership from Message.senderUserId.
 *
 * Cursors mean "viewed in Houzzat Conversation UI". They are not SMS
 * carrier read receipts and must not change Twilio provider fields.
 *
 * Missing-assignment-card fallback (mismatch, no ASSIGNED/REASSIGNED card):
 * 1. Latest LeadActivity of type assigned | reassigned | claimed for this
 *    Lead (tenant-safe: Lead already loaded via workspaceId+id). Exclusive
 *    after that createdAt. Type is structured; assignee in body/meta is
 *    not reliable, so bodies are not parsed. Unrelated CRM edits
 *    (status/notes) use other activity types and cannot move this watermark.
 *    Not Lead.updatedAt.
 * 2. If no such activity exists: conservative_unanchored — all incoming
 *    messages unread. Missing a customer message is worse than extra unread.
 *    Not Lead.updatedAt, lastMessageAt, now(), or epoch.
 *
 * Neon HTTP-safe: findUnique / findMany / findFirst / update only.
 */
import type { Message, PrismaClient } from "@prisma/client";
import {
  LEAD_CONVERSATION_SELECT,
  type LeadConversationRecord,
} from "@/lib/conversations/lead-conversation";

export const ASSIGNMENT_CARD_TYPES = ["ASSIGNED", "REASSIGNED"] as const;

/** Structured CRM assignment-class events. Assignee text in body/meta is not used. */
export const ASSIGNMENT_ACTIVITY_TYPES = [
  "assigned",
  "reassigned",
  "claimed",
] as const;

export const CONVERSATION_READ_MESSAGE_SELECT = {
  id: true,
  createdAt: true,
  senderKind: true,
  senderUserId: true,
  deletedAt: true,
  kind: true,
  payload: true,
  providerStatus: true,
  deliveredAt: true,
  twilioMessageSid: true,
  channel: true,
} as const;

export type ConversationReadMessage = Pick<
  Message,
  keyof typeof CONVERSATION_READ_MESSAGE_SELECT
>;

export type ConversationReadStateDb = {
  lead: Pick<PrismaClient["lead"], "findUnique">;
  conversation: Pick<PrismaClient["conversation"], "findUnique" | "update">;
  message: Pick<PrismaClient["message"], "findMany" | "findFirst">;
  leadActivity: Pick<PrismaClient["leadActivity"], "findFirst">;
};

export type ConversationReadIds = {
  workspaceId: string;
  leadId: string;
};

export type AgentCutoff =
  | { mode: "matching"; exclusiveAfter: Date }
  | { mode: "assignment_card"; inclusiveFrom: Date; cardMessageId: string }
  | {
      mode: "assignment_activity";
      exclusiveAfter: Date;
      activityId: string;
    }
  | { mode: "conservative_unanchored" }
  | { mode: "none" };

export type ConversationUnreadState = {
  conversation: LeadConversationRecord | null;
  assignedAgentId: string | null;
  agentCursorValid: boolean;
  agentCutoff: AgentCutoff;
  agentUnreadCount: number;
  agentDividerMessageId: string | null;
  customerUnreadCount: number;
  customerDividerMessageId: string | null;
};

export type MarkConversationReadResult =
  | { ok: true; conversation: LeadConversationRecord }
  | {
      ok: false;
      reason:
        | "INVALID_INPUT"
        | "LEAD_NOT_IN_WORKSPACE"
        | "CONVERSATION_NOT_FOUND"
        | "NOT_CURRENT_ASSIGNEE";
    };

function parseIds(input: ConversationReadIds): ConversationReadIds | null {
  const workspaceId = input.workspaceId.trim();
  const leadId = input.leadId.trim();
  if (!workspaceId || !leadId) return null;
  return { workspaceId, leadId };
}

function payloadCard(payload: Message["payload"]): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const card = (payload as { card?: unknown }).card;
  return typeof card === "string" && card.trim() ? card.trim() : null;
}

export function isAssignmentCard(message: ConversationReadMessage): boolean {
  if (message.kind !== "SYSTEM_CARD") return false;
  const card = payloadCard(message.payload);
  return (
    card !== null &&
    (ASSIGNMENT_CARD_TYPES as readonly string[]).includes(card)
  );
}

export function isAgentCursorValid(
  conversation: Pick<
    LeadConversationRecord,
    "agentLastReadByUserId"
  >,
  assignedAgentId: string | null,
): boolean {
  return Boolean(
    assignedAgentId && conversation.agentLastReadByUserId === assignedAgentId,
  );
}

export function isIncomingForAgent(
  message: ConversationReadMessage,
  assignedAgentId: string,
): boolean {
  if (
    message.senderKind === "AGENT" &&
    message.senderUserId === assignedAgentId
  ) {
    return false;
  }
  return true;
}

function isIncomingForCustomer(message: ConversationReadMessage): boolean {
  if (message.channel === "SMS") return false;
  return message.senderKind !== "CUSTOMER";
}

function isAfterExclusive(createdAt: Date, exclusiveAfter: Date): boolean {
  return createdAt.getTime() > exclusiveAfter.getTime();
}

function isOnOrAfter(createdAt: Date, inclusiveFrom: Date): boolean {
  return createdAt.getTime() >= inclusiveFrom.getTime();
}

export function resolveAgentCutoff(
  conversation: LeadConversationRecord,
  assignedAgentId: string | null,
  messages: ConversationReadMessage[],
  latestAssignmentActivity: { id: string; createdAt: Date } | null,
): AgentCutoff {
  if (!assignedAgentId) return { mode: "none" };

  if (isAgentCursorValid(conversation, assignedAgentId)) {
    if (conversation.agentLastReadAt) {
      return {
        mode: "matching",
        exclusiveAfter: conversation.agentLastReadAt,
      };
    }
    return { mode: "none" };
  }

  let latestCard: ConversationReadMessage | null = null;
  for (const message of messages) {
    if (!isAssignmentCard(message)) continue;
    if (!latestCard || message.createdAt > latestCard.createdAt) {
      latestCard = message;
    }
  }
  if (latestCard) {
    return {
      mode: "assignment_card",
      inclusiveFrom: latestCard.createdAt,
      cardMessageId: latestCard.id,
    };
  }

  if (latestAssignmentActivity) {
    return {
      mode: "assignment_activity",
      exclusiveAfter: latestAssignmentActivity.createdAt,
      activityId: latestAssignmentActivity.id,
    };
  }

  return { mode: "conservative_unanchored" };
}

export function isInAgentUnreadWindow(
  message: ConversationReadMessage,
  cutoff: AgentCutoff,
): boolean {
  switch (cutoff.mode) {
    case "matching":
      return isAfterExclusive(message.createdAt, cutoff.exclusiveAfter);
    case "assignment_card":
      return isOnOrAfter(message.createdAt, cutoff.inclusiveFrom);
    case "assignment_activity":
      return isAfterExclusive(message.createdAt, cutoff.exclusiveAfter);
    case "conservative_unanchored":
      return true;
    case "none":
      return true;
  }
}

export function summarizeUnread(
  messages: ConversationReadMessage[],
  isIncoming: (message: ConversationReadMessage) => boolean,
  inWindow: (message: ConversationReadMessage) => boolean,
): { count: number; dividerMessageId: string | null } {
  let count = 0;
  let dividerMessageId: string | null = null;
  for (const message of messages) {
    if (!inWindow(message) || !isIncoming(message)) continue;
    if (!dividerMessageId) dividerMessageId = message.id;
    if (!message.deletedAt) count += 1;
  }
  return { count, dividerMessageId };
}

/** Same Agent unread count as getConversationUnreadState, for batched Inbox use. */
export function countIncomingAgentUnread(
  messages: ConversationReadMessage[],
  assignedAgentId: string,
  cutoff: AgentCutoff,
): number {
  return summarizeUnread(
    messages,
    (message) => isIncomingForAgent(message, assignedAgentId),
    (message) => isInAgentUnreadWindow(message, cutoff),
  ).count;
}

async function loadLeadAndConversation(
  db: ConversationReadStateDb,
  ids: ConversationReadIds,
): Promise<{
  lead: { assignedAgentId: string | null } | null;
  conversation: LeadConversationRecord | null;
}> {
  const lead = await db.lead.findUnique({
    where: {
      workspaceId_id: { workspaceId: ids.workspaceId, id: ids.leadId },
    },
    select: { assignedAgentId: true, workspaceId: true },
  });
  if (!lead?.workspaceId || lead.workspaceId !== ids.workspaceId) {
    return { lead: null, conversation: null };
  }

  const conversation = await db.conversation.findUnique({
    where: {
      workspaceId_leadId: {
        workspaceId: ids.workspaceId,
        leadId: ids.leadId,
      },
    },
    select: LEAD_CONVERSATION_SELECT,
  });

  return {
    lead: { assignedAgentId: lead.assignedAgentId },
    conversation,
  };
}

async function loadLatestAssignmentActivity(
  db: ConversationReadStateDb,
  leadId: string,
): Promise<{ id: string; createdAt: Date } | null> {
  return db.leadActivity.findFirst({
    where: {
      leadId,
      type: { in: [...ASSIGNMENT_ACTIVITY_TYPES] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
}

async function loadMessages(
  db: ConversationReadStateDb,
  conversation: LeadConversationRecord,
): Promise<ConversationReadMessage[]> {
  return db.message.findMany({
    where: {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
    },
    orderBy: { createdAt: "asc" },
    select: CONVERSATION_READ_MESSAGE_SELECT,
  });
}

/**
 * Read-only unread/divider state. Never creates Conversation or Message rows.
 */
export async function getConversationUnreadState(
  db: ConversationReadStateDb,
  input: ConversationReadIds,
): Promise<ConversationUnreadState> {
  const empty: ConversationUnreadState = {
    conversation: null,
    assignedAgentId: null,
    agentCursorValid: false,
    agentCutoff: { mode: "none" },
    agentUnreadCount: 0,
    agentDividerMessageId: null,
    customerUnreadCount: 0,
    customerDividerMessageId: null,
  };

  const ids = parseIds(input);
  if (!ids) return empty;

  const loaded = await loadLeadAndConversation(db, ids);
  if (!loaded.lead) return empty;
  if (!loaded.conversation) {
    return { ...empty, assignedAgentId: loaded.lead.assignedAgentId };
  }

  const conversation = loaded.conversation;
  const assignedAgentId = loaded.lead.assignedAgentId;
  const messages = await loadMessages(db, conversation);
  const needsAssignmentFallback =
    Boolean(assignedAgentId) &&
    !isAgentCursorValid(conversation, assignedAgentId) &&
    !messages.some(isAssignmentCard);
  const latestAssignmentActivity = needsAssignmentFallback
    ? await loadLatestAssignmentActivity(db, ids.leadId)
    : null;
  const agentCutoff = resolveAgentCutoff(
    conversation,
    assignedAgentId,
    messages,
    latestAssignmentActivity,
  );
  const agentCursorValid = isAgentCursorValid(conversation, assignedAgentId);

  const agent = assignedAgentId
    ? summarizeUnread(
        messages,
        (message) => isIncomingForAgent(message, assignedAgentId),
        (message) => isInAgentUnreadWindow(message, agentCutoff),
      )
    : { count: 0, dividerMessageId: null };

  const customerCutoff = conversation.customerLastReadAt;
  const customer = summarizeUnread(
    messages,
    isIncomingForCustomer,
    (message) =>
      customerCutoff
        ? isAfterExclusive(message.createdAt, customerCutoff)
        : true,
  );

  return {
    conversation,
    assignedAgentId,
    agentCursorValid,
    agentCutoff,
    agentUnreadCount: agent.count,
    agentDividerMessageId: agent.dividerMessageId,
    customerUnreadCount: customer.count,
    customerDividerMessageId: customer.dividerMessageId,
  };
}

async function latestMessageCreatedAt(
  db: ConversationReadStateDb,
  conversation: LeadConversationRecord,
): Promise<Date> {
  const latest = await db.message.findFirst({
    where: {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return latest?.createdAt ?? conversation.createdAt;
}

async function latestChatMessageCreatedAt(
  db: ConversationReadStateDb,
  conversation: LeadConversationRecord,
): Promise<Date> {
  const latest = await db.message.findFirst({
    where: {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      channel: "CHAT",
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return latest?.createdAt ?? conversation.createdAt;
}

/**
 * Current assignee only. Stores that Agent's identity on the cursor.
 * Uses latest persisted message createdAt (including tombstones).
 */
export async function markConversationReadByAgent(
  db: ConversationReadStateDb,
  input: ConversationReadIds & { agentUserId: string },
): Promise<MarkConversationReadResult> {
  const ids = parseIds(input);
  const agentUserId = input.agentUserId.trim();
  if (!ids || !agentUserId) return { ok: false, reason: "INVALID_INPUT" };

  const loaded = await loadLeadAndConversation(db, ids);
  if (!loaded.lead) return { ok: false, reason: "LEAD_NOT_IN_WORKSPACE" };
  if (!loaded.conversation) {
    return { ok: false, reason: "CONVERSATION_NOT_FOUND" };
  }
  if (loaded.lead.assignedAgentId !== agentUserId) {
    return { ok: false, reason: "NOT_CURRENT_ASSIGNEE" };
  }

  const readAt = await latestMessageCreatedAt(db, loaded.conversation);
  const conversation = await db.conversation.update({
    where: {
      workspaceId_id: {
        workspaceId: loaded.conversation.workspaceId,
        id: loaded.conversation.id,
      },
    },
    data: {
      agentLastReadAt: readAt,
      agentLastReadByUserId: agentUserId,
    },
    select: LEAD_CONVERSATION_SELECT,
  });

  return { ok: true, conversation };
}

/**
 * Tenant-safe customer cursor update. Caller must authorize Lead ownership.
 */
export async function markConversationReadByCustomer(
  db: ConversationReadStateDb,
  input: ConversationReadIds,
): Promise<MarkConversationReadResult> {
  const ids = parseIds(input);
  if (!ids) return { ok: false, reason: "INVALID_INPUT" };

  const loaded = await loadLeadAndConversation(db, ids);
  if (!loaded.lead) return { ok: false, reason: "LEAD_NOT_IN_WORKSPACE" };
  if (!loaded.conversation) {
    return { ok: false, reason: "CONVERSATION_NOT_FOUND" };
  }

  const readAt = await latestChatMessageCreatedAt(db, loaded.conversation);
  const conversation = await db.conversation.update({
    where: {
      workspaceId_id: {
        workspaceId: loaded.conversation.workspaceId,
        id: loaded.conversation.id,
      },
    },
    data: {
      customerLastReadAt: readAt,
    },
    select: LEAD_CONVERSATION_SELECT,
  });

  return { ok: true, conversation };
}
