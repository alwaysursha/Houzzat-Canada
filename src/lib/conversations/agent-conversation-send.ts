/**
 * Authenticated Agent send of one Houzzat CHAT TEXT message.
 *
 * AUTHORIZATION BOUNDARY
 * Callers authenticate first (requireAgentContextFromRequest). This module
 * reuses loadAccessibleAgentConversationLead + canAccessLead, then requires
 * Lead.assignedAgentId === authenticated user.id. Admin/team viewers, former
 * Agents, pond/unassigned Leads, and foreign Workspaces cannot send.
 *
 * Sender identity is server-derived from Agent context (User.name with
 * email fallback). Client cannot supply senderKind, senderUserId, senderName,
 * or Twilio fields. Optional `channel` is accepted only by the HTTP route
 * dispatcher; this module always persists CHAT.
 *
 * Persistence goes through createConversationMessage, then one Conversation
 * LeadActivity row (CHAT / outbound) keyed by messageId. This module does not
 * write Message rows, notifications, email/SMS, or consent events, and does
 * not mark the Agent cursor read.
 *
 * Chat send is not idempotent: there is no existing Agent mutation
 * idempotency-key store suitable for Chat. Double-click/retry creates two
 * TEXT messages. Do not reuse Twilio SIDs. UI should disable send while
 * in flight.
 */
import { z } from "zod";
import type { AgentOrgContext, AgentUser } from "@/lib/agent";
import {
  loadAccessibleAgentConversationLead,
  presentAgentConversationMessage,
  type AgentConversationMessage,
  type AgentConversationMessageRow,
} from "@/lib/conversations/agent-conversation-read";
import {
  createConversationMessage,
  type ConversationMessageDb,
  type ConversationMessageRecord,
} from "@/lib/conversations/create-conversation-message";
import {
  recordConversationLeadActivity,
  type ConversationLeadActivityDb,
} from "@/lib/conversations/sms-lead-activity";

export const AGENT_CHAT_TEXT_MAX_LENGTH = 4000;

export const agentChatSendRequestSchema = z
  .object({
    body: z.string(),
  })
  .strict();

export const agentConversationSendRequestSchema = z
  .object({
    body: z.string(),
    channel: z.enum(["CHAT", "SMS"]).optional(),
  })
  .strict();

export type AgentConversationSendDb = ConversationMessageDb &
  ConversationLeadActivityDb;

export type AgentChatSendPayload = {
  conversation: {
    id: string;
    leadId: string;
    lastMessageAt: string | null;
    created: boolean;
  };
  message: AgentConversationMessage;
};

export type SendAgentLeadChatMessageResult =
  | { ok: true; data: AgentChatSendPayload }
  | {
      ok: false;
      reason: "LEAD_NOT_FOUND" | "FORBIDDEN" | "INVALID_BODY";
    };

export function frozenAgentSenderName(
  user: Pick<AgentUser, "name" | "email">,
): string {
  const name = user.name?.trim();
  if (name) return name;
  return user.email.trim();
}

export function normalizeAgentChatText(raw: string): string | null {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return null;
  if (normalized.length > AGENT_CHAT_TEXT_MAX_LENGTH) return null;
  return normalized;
}

export function presentSentMessage(
  message: ConversationMessageRecord,
): AgentConversationMessage {
  const row: AgentConversationMessageRow = {
    id: message.id,
    channel: message.channel,
    kind: message.kind,
    senderKind: message.senderKind,
    senderUserId: message.senderUserId,
    senderName: message.senderName,
    body: message.body,
    editedAt: null,
    deletedAt: null,
    replyToMessageId: null,
    createdAt: message.createdAt,
    deliveredAt: message.deliveredAt,
    smsSource: message.smsSource,
    providerStatus: message.providerStatus,
    payload: message.payload,
  };
  return presentAgentConversationMessage(row);
}

export async function sendAgentLeadChatMessage(
  db: AgentConversationSendDb,
  ctx: AgentOrgContext,
  leadId: string,
  body: string,
): Promise<SendAgentLeadChatMessageResult> {
  const text = normalizeAgentChatText(body);
  if (!text) {
    return { ok: false, reason: "INVALID_BODY" };
  }

  const senderName = frozenAgentSenderName(ctx.user);
  if (!senderName) {
    return { ok: false, reason: "INVALID_BODY" };
  }

  const lead = await loadAccessibleAgentConversationLead(db, ctx, leadId);
  if (!lead?.workspaceId) {
    return { ok: false, reason: "LEAD_NOT_FOUND" };
  }
  if (!lead.assignedAgentId || lead.assignedAgentId !== ctx.user.id) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const created = await createConversationMessage(db, {
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "AGENT",
    senderUserId: ctx.user.id,
    createdByUserId: ctx.user.id,
    senderName,
    body: text,
  });

  if (!created.ok) {
    if (
      created.reason === "LEAD_NOT_IN_WORKSPACE" ||
      created.reason === "INVALID_INPUT"
    ) {
      return { ok: false, reason: "LEAD_NOT_FOUND" };
    }
    return { ok: false, reason: "INVALID_BODY" };
  }

  try {
    await recordConversationLeadActivity(db, {
      leadId: lead.id,
      workspaceId: lead.workspaceId,
      messageId: created.message.id,
      body: text,
      channel: "CHAT",
      direction: "outbound",
      userId: ctx.user.id,
    });
  } catch {
    // Conversation persist already succeeded.
  }

  return {
    ok: true,
    data: {
      conversation: {
        id: created.conversation.id,
        leadId: created.conversation.leadId,
        lastMessageAt: created.conversation.lastMessageAt
          ? created.conversation.lastMessageAt.toISOString()
          : null,
        created: created.conversationCreated,
      },
      message: presentSentMessage(created.message),
    },
  };
}
