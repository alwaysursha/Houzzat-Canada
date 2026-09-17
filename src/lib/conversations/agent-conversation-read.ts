/**
 * Authenticated Agent open/read + mark-read for one Lead Conversation.
 *
 * AUTHORIZATION BOUNDARY
 * Callers authenticate first (requireAgentContextFromRequest). This module
 * then applies canAccessLead and uses the trusted Lead.workspaceId — never a
 * client-supplied workspace. It does not prove the HTTP caller is allowed;
 * the route must pass the authenticated AgentOrgContext.
 *
 * GET may lazily create the permanent Conversation. It must not create
 * Messages, LeadActivity, notifications, or mark the Agent cursor read.
 *
 * Admin/team viewers may read when canAccessLead allows. Only
 * Lead.assignedAgentId may mark the Agent cursor read.
 */
import type {
  Message,
  MessageChannel,
  MessageKind,
  MessageSenderKind,
  MessageSmsSource,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import {
  canAccessLead,
  type AgentOrgContext,
} from "@/lib/agent";
import {
  getOrCreateLeadConversation,
  type LeadConversationDb,
  type LeadConversationRecord,
} from "@/lib/conversations/lead-conversation";
import {
  getConversationUnreadState,
  markConversationReadByAgent,
  type AgentCutoff,
  type ConversationReadStateDb,
} from "@/lib/conversations/read-state";

export const AGENT_CONVERSATION_PAGE_SIZE = 40;
export const AGENT_CONVERSATION_PAGE_MAX = 80;

export const AGENT_CONVERSATION_LEAD_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
} as const;

export const AGENT_CONVERSATION_MESSAGE_SELECT = {
  id: true,
  channel: true,
  kind: true,
  senderKind: true,
  senderUserId: true,
  senderName: true,
  body: true,
  editedAt: true,
  deletedAt: true,
  replyToMessageId: true,
  createdAt: true,
  deliveredAt: true,
  smsSource: true,
  providerStatus: true,
  payload: true,
} as const;

export type AgentConversationMessageRow = Pick<
  Message,
  keyof typeof AGENT_CONVERSATION_MESSAGE_SELECT
>;

export type AgentConversationReadDb = LeadConversationDb &
  ConversationReadStateDb & {
    conversation: Pick<
      PrismaClient["conversation"],
      "findUnique" | "create" | "update"
    >;
    message: Pick<PrismaClient["message"], "findMany" | "findFirst">;
  };

export type AgentConversationPageParams = {
  limit: number;
  cursor: { createdAt: Date; id: string } | null;
};

export type AgentConversationMessage = {
  id: string;
  channel: MessageChannel;
  kind: MessageKind;
  senderKind: MessageSenderKind;
  senderUserId: string | null;
  senderName: string;
  body: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: string | null;
  createdAt: string;
  deliveredAt: string | null;
  smsSource: MessageSmsSource | null;
  providerStatus: string | null;
  payload: Prisma.JsonValue | null;
};

export type AgentConversationUnreadView = {
  count: number;
  dividerMessageId: string | null;
  cutoffMode: AgentCutoff["mode"];
  agentCursorValid: boolean;
};

export type AgentConversationReadPayload = {
  conversation: {
    id: string;
    leadId: string;
    status: LeadConversationRecord["status"];
    createdAt: string;
    lastMessageAt: string | null;
    created: boolean;
  };
  assignedAgentId: string | null;
  viewer: {
    userId: string;
    isAssignedAgent: boolean;
    canMarkRead: boolean;
  };
  unread: AgentConversationUnreadView;
  messages: AgentConversationMessage[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type MarkAgentConversationReadPayload = {
  conversation: {
    id: string;
    leadId: string;
    agentLastReadAt: string | null;
    agentLastReadByUserId: string | null;
  };
  unread: AgentConversationUnreadView;
};

export type MarkAgentConversationReadResult =
  | { ok: true; data: MarkAgentConversationReadPayload }
  | {
      ok: false;
      reason: "LEAD_NOT_FOUND" | "FORBIDDEN" | "CONVERSATION_NOT_FOUND";
    };

export type AccessibleAgentConversationLead = {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  assignedAgentId: string | null;
};

function encodeTranscriptCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function parseTranscriptCursor(
  raw: string,
): { createdAt: Date; id: string } | null {
  const trimmed = raw.trim();
  const pipe = trimmed.indexOf("|");
  if (pipe <= 0 || pipe === trimmed.length - 1) return null;
  const createdAt = new Date(trimmed.slice(0, pipe));
  const id = trimmed.slice(pipe + 1).trim();
  if (!id || Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

export function parseAgentConversationPageParams(
  url: URL,
):
  | { ok: true; value: AgentConversationPageParams }
  | { ok: false; reason: "INVALID_CURSOR" } {
  const cursorRaw = url.searchParams.get("cursor");
  let cursor: AgentConversationPageParams["cursor"] = null;
  if (cursorRaw && cursorRaw.trim()) {
    cursor = parseTranscriptCursor(cursorRaw);
    if (!cursor) return { ok: false, reason: "INVALID_CURSOR" };
  }

  const limitRaw = url.searchParams.get("limit");
  let limit = AGENT_CONVERSATION_PAGE_SIZE;
  if (limitRaw != null && limitRaw.trim()) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed)) {
      limit = parsed;
    }
  }
  limit = Math.min(Math.max(limit, 1), AGENT_CONVERSATION_PAGE_MAX);

  return { ok: true, value: { limit, cursor } };
}

export async function loadAccessibleAgentConversationLead(
  db: Pick<AgentConversationReadDb, "lead">,
  ctx: AgentOrgContext,
  leadId: string,
): Promise<AccessibleAgentConversationLead | null> {
  const id = leadId.trim();
  if (!id) return null;

  const lead = ctx.workspaceId
    ? await db.lead.findUnique({
        where: {
          workspaceId_id: { workspaceId: ctx.workspaceId, id },
        },
        select: AGENT_CONVERSATION_LEAD_ACCESS_SELECT,
      })
    : await db.lead.findUnique({
        where: { id },
        select: AGENT_CONVERSATION_LEAD_ACCESS_SELECT,
      });

  if (!lead?.workspaceId) return null;
  if (!canAccessLead(ctx, lead)) return null;
  return {
    id: lead.id,
    organizationId: lead.organizationId,
    workspaceId: lead.workspaceId,
    assignedAgentId: lead.assignedAgentId,
  };
}

function presentUnread(
  cutoffMode: AgentCutoff["mode"],
  agentCursorValid: boolean,
  count: number,
  dividerMessageId: string | null,
): AgentConversationUnreadView {
  return {
    count,
    dividerMessageId,
    cutoffMode,
    agentCursorValid,
  };
}

export function presentAgentConversationMessage(
  row: AgentConversationMessageRow,
): AgentConversationMessage {
  const deleted = Boolean(row.deletedAt);
  const payload =
    !deleted && row.kind === "SYSTEM_CARD" ? (row.payload ?? null) : null;
  return {
    id: row.id,
    channel: row.channel,
    kind: row.kind,
    senderKind: row.senderKind,
    senderUserId: row.senderUserId,
    senderName: row.senderName,
    body: deleted ? null : row.body,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    replyToMessageId: row.replyToMessageId,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    smsSource: row.smsSource,
    providerStatus: row.providerStatus,
    payload,
  };
}

async function loadTranscriptPage(
  db: AgentConversationReadDb,
  conversation: LeadConversationRecord,
  page: AgentConversationPageParams,
): Promise<{
  messages: AgentConversationMessage[];
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const cursorFilter = page.cursor
    ? {
        OR: [
          { createdAt: { lt: page.cursor.createdAt } },
          {
            createdAt: page.cursor.createdAt,
            id: { lt: page.cursor.id },
          },
        ],
      }
    : {};

  const rows = await db.message.findMany({
    where: {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      ...cursorFilter,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.limit + 1,
    select: AGENT_CONVERSATION_MESSAGE_SELECT,
  });

  const hasMore = rows.length > page.limit;
  const newestFirst = hasMore ? rows.slice(0, page.limit) : rows;
  const chronological = [...newestFirst].reverse();
  const oldest = chronological[0];
  return {
    messages: chronological.map(presentAgentConversationMessage),
    hasMore,
    nextCursor:
      hasMore && oldest
        ? encodeTranscriptCursor(oldest.createdAt, oldest.id)
        : null,
  };
}

async function loadUnreadView(
  db: AgentConversationReadDb,
  workspaceId: string,
  leadId: string,
): Promise<AgentConversationUnreadView> {
  const state = await getConversationUnreadState(db, { workspaceId, leadId });
  return presentUnread(
    state.agentCutoff.mode,
    state.agentCursorValid,
    state.agentUnreadCount,
    state.agentDividerMessageId,
  );
}

/**
 * Open one Lead Conversation for an authorized Agent/Admin.
 * Lazy-creates the Conversation. Never marks read. Never creates Messages.
 */
export async function openAgentLeadConversation(
  db: AgentConversationReadDb,
  ctx: AgentOrgContext,
  leadId: string,
  page: AgentConversationPageParams,
): Promise<AgentConversationReadPayload | null> {
  const lead = await loadAccessibleAgentConversationLead(db, ctx, leadId);
  if (!lead?.workspaceId) return null;

  const created = await getOrCreateLeadConversation(db, {
    workspaceId: lead.workspaceId,
    leadId: lead.id,
  });
  if (!created.ok) return null;

  const [transcript, unread] = await Promise.all([
    loadTranscriptPage(db, created.conversation, page),
    loadUnreadView(db, lead.workspaceId, lead.id),
  ]);

  const isAssignedAgent = lead.assignedAgentId === ctx.user.id;

  return {
    conversation: {
      id: created.conversation.id,
      leadId: created.conversation.leadId,
      status: created.conversation.status,
      createdAt: created.conversation.createdAt.toISOString(),
      lastMessageAt: created.conversation.lastMessageAt
        ? created.conversation.lastMessageAt.toISOString()
        : null,
      created: created.created,
    },
    assignedAgentId: lead.assignedAgentId,
    viewer: {
      userId: ctx.user.id,
      isAssignedAgent,
      canMarkRead: isAssignedAgent,
    },
    unread,
    messages: transcript.messages,
    page: {
      limit: page.limit,
      hasMore: transcript.hasMore,
      nextCursor: transcript.nextCursor,
    },
  };
}

/**
 * Current assignee only. Viewers who canAccessLead but are not the assignee
 * (Admin/former Agent) receive FORBIDDEN after access is proven.
 * Foreign/unauthorized viewers receive LEAD_NOT_FOUND so existence is not leaked.
 */
export async function markAgentLeadConversationRead(
  db: AgentConversationReadDb,
  ctx: AgentOrgContext,
  leadId: string,
): Promise<MarkAgentConversationReadResult> {
  const lead = await loadAccessibleAgentConversationLead(db, ctx, leadId);
  if (!lead?.workspaceId) {
    return { ok: false, reason: "LEAD_NOT_FOUND" };
  }
  if (lead.assignedAgentId !== ctx.user.id) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const marked = await markConversationReadByAgent(db, {
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    agentUserId: ctx.user.id,
  });
  if (!marked.ok) {
    if (marked.reason === "NOT_CURRENT_ASSIGNEE") {
      return { ok: false, reason: "FORBIDDEN" };
    }
    if (marked.reason === "CONVERSATION_NOT_FOUND") {
      return { ok: false, reason: "CONVERSATION_NOT_FOUND" };
    }
    return { ok: false, reason: "LEAD_NOT_FOUND" };
  }

  const unread = await loadUnreadView(db, lead.workspaceId, lead.id);
  return {
    ok: true,
    data: {
      conversation: {
        id: marked.conversation.id,
        leadId: marked.conversation.leadId,
        agentLastReadAt: marked.conversation.agentLastReadAt
          ? marked.conversation.agentLastReadAt.toISOString()
          : null,
        agentLastReadByUserId: marked.conversation.agentLastReadByUserId,
      },
      unread,
    },
  };
}
