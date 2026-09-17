/**
 * Canonical HouzzatPRO Lead Conversation data access.
 *
 * ONE workspace + ONE lead = ONE permanent Conversation.
 * Not owned by an Agent. Operational owner remains Lead.assignedAgentId.
 *
 * AUTHORIZATION BOUNDARY
 * These helpers are tenant-safe data lookup/create only.
 * Passing a workspaceId is NOT proof the caller may act.
 *
 * Callers MUST authorize first, then pass trusted ids:
 * - Agent web: requireAgentContextFromRequest + canAccessLead / v2CanAccessLead
 * - Agent mobile: authenticateMobileRequest; lead.workspaceId === token.wsId
 * - Consumer: consumer ownership of the Lead, then the same workspaceId + leadId
 *
 * Do not look up a Lead by global id and then trust it.
 * Do not create Conversations for leads whose workspaceId does not match.
 *
 * Creation is not tied to a human Chat message. Assignment, reassignment,
 * viewing confirmation, and inbound SMS may call getOrCreate later.
 *
 * Neon HTTP-safe: findUnique + create only. No $transaction / upsert.
 */
import type { Conversation, ConversationStatus, PrismaClient } from "@prisma/client";

export const LEAD_CONVERSATION_SELECT = {
  id: true,
  workspaceId: true,
  leadId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  customerLastReadAt: true,
  agentLastReadAt: true,
  agentLastReadByUserId: true,
} as const;

export type LeadConversationRecord = Pick<
  Conversation,
  keyof typeof LEAD_CONVERSATION_SELECT
>;

export type LeadConversationDb = {
  lead: Pick<PrismaClient["lead"], "findUnique">;
  conversation: Pick<PrismaClient["conversation"], "findUnique" | "create">;
};

export type LeadConversationIds = {
  workspaceId: string;
  leadId: string;
};

export type GetOrCreateLeadConversationResult =
  | {
      ok: true;
      conversation: LeadConversationRecord;
      created: boolean;
    }
  | {
      ok: false;
      reason: "INVALID_INPUT" | "LEAD_NOT_IN_WORKSPACE";
    };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function parseLeadConversationIds(
  input: LeadConversationIds,
): LeadConversationIds | null {
  const workspaceId = input.workspaceId.trim();
  const leadId = input.leadId.trim();
  if (!workspaceId || !leadId) return null;
  return { workspaceId, leadId };
}

async function findLeadInWorkspace(
  db: LeadConversationDb,
  ids: LeadConversationIds,
): Promise<{ id: string; workspaceId: string } | null> {
  const lead = await db.lead.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: ids.workspaceId,
        id: ids.leadId,
      },
    },
    select: { id: true, workspaceId: true },
  });
  if (!lead?.workspaceId || lead.workspaceId !== ids.workspaceId) {
    return null;
  }
  if (lead.id !== ids.leadId) return null;
  return { id: lead.id, workspaceId: lead.workspaceId };
}

async function findConversationRow(
  db: LeadConversationDb,
  ids: LeadConversationIds,
): Promise<LeadConversationRecord | null> {
  return db.conversation.findUnique({
    where: {
      workspaceId_leadId: {
        workspaceId: ids.workspaceId,
        leadId: ids.leadId,
      },
    },
    select: LEAD_CONVERSATION_SELECT,
  });
}

/**
 * Read-only. Returns null when no Conversation exists.
 * Never creates rows, messages, LeadActivity, or notifications.
 */
export async function findLeadConversation(
  db: LeadConversationDb,
  input: LeadConversationIds,
): Promise<LeadConversationRecord | null> {
  const ids = parseLeadConversationIds(input);
  if (!ids) return null;
  return findConversationRow(db, ids);
}

/**
 * Return the existing Conversation, or lazily create the permanent primary one.
 * Does not set Agent ownership. Does not create messages or LeadActivity.
 */
export async function getOrCreateLeadConversation(
  db: LeadConversationDb,
  input: LeadConversationIds,
): Promise<GetOrCreateLeadConversationResult> {
  const ids = parseLeadConversationIds(input);
  if (!ids) {
    return { ok: false, reason: "INVALID_INPUT" };
  }

  const lead = await findLeadInWorkspace(db, ids);
  if (!lead) {
    return { ok: false, reason: "LEAD_NOT_IN_WORKSPACE" };
  }

  const existing = await findConversationRow(db, ids);
  if (existing) {
    return { ok: true, conversation: existing, created: false };
  }

  try {
    const created = await db.conversation.create({
      data: {
        workspaceId: ids.workspaceId,
        leadId: ids.leadId,
        status: "OPEN" satisfies ConversationStatus,
      },
      select: LEAD_CONVERSATION_SELECT,
    });
    return { ok: true, conversation: created, created: true };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await findConversationRow(db, ids);
    if (raced) {
      return { ok: true, conversation: raced, created: false };
    }
    throw error;
  }
}
