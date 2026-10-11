/**
 * Authenticated Customer Chat Conversation APIs.
 *
 * AUTHORIZATION BOUNDARY
 * Workspace + Lead come from Ask #26 resolver only:
 *   GET/read → resolveCustomerChatLead (read-only)
 *   POST send → ensureCustomerChatLead
 * Client leadId / workspaceId / conversationId / sender identity are not
 * authority. Routes have no {leadId} or {conversationId} path params.
 *
 * GET may lazily create the permanent Conversation for an existing Lead
 * (same as Agent Chat). GET never creates a Lead, never routes, never
 * marks read. Transcript includes CHAT and SMS on the same Conversation.
 * Customer send remains CHAT-only.
 *
 * POST send is the only path that may create/route/assign a Lead via ensure.
 * Messages go through createConversationMessage. Rate limit runs after
 * trusted hostname Workspace resolution and before Message creation.
 *
 * After a newly persisted CUSTOMER/CHAT/TEXT Message, this module writes one
 * Conversation LeadActivity row (CHAT / inbound) keyed by messageId, then
 * schedules a best-effort assigned-Agent `chat_message` FCM. Message success
 * never depends on activity or push. Email, SMS, CustomerAlert, and consent
 * are not sent from here.
 */
import type {
  ConversationStatus,
  Message,
  MessageChannel,
  MessageKind,
  MessageSenderKind,
  Prisma,
} from "@prisma/client";
import {
  requireFullCustomerUser,
  type CustomerUser,
} from "@/lib/account";
import {
  AGENT_CONVERSATION_PAGE_MAX,
  AGENT_CONVERSATION_PAGE_SIZE,
  parseAgentConversationPageParams,
} from "@/lib/conversations/agent-conversation-read";
import {
  AGENT_CHAT_TEXT_MAX_LENGTH,
  normalizeAgentChatText,
} from "@/lib/conversations/agent-conversation-send";
import {
  allowCustomerChatSend,
} from "@/lib/conversations/customer-chat-rate-limit";
import {
  resolveAssignedAgentAvailability,
  type CustomerAgentAvailability,
} from "@/lib/chat/presence/state";
import { loadAgentPresenceState, type AgentPresenceDb } from "@/lib/chat/presence/update";
import { isTypingActive } from "@/lib/chat/typing/state";
import {
  clearConversationTypingOnSend,
  loadConversationTypingState,
  type ConversationTypingDb,
} from "@/lib/chat/typing/update";
import {
  ensureCustomerChatLead,
  frozenCustomerChatDisplayName,
  resolveCustomerChatLead,
  type CustomerChatLeadFailureReason,
  type CustomerChatLeadResolverDeps,
  type CustomerChatLeadSuccess,
} from "@/lib/conversations/customer-chat-lead";
import {
  createConversationMessage,
  type ConversationMessageDb,
} from "@/lib/conversations/create-conversation-message";
import {
  findLeadConversation,
  getOrCreateLeadConversation,
  type LeadConversationRecord,
} from "@/lib/conversations/lead-conversation";
import {
  getConversationUnreadState,
  markConversationReadByCustomer,
  type ConversationReadStateDb,
} from "@/lib/conversations/read-state";
import {
  recordConversationLeadActivity,
  type ConversationLeadActivityDb,
} from "@/lib/conversations/sms-lead-activity";
import {
  enrichChatMessages,
  handleConversationSearchRequest,
  handleToggleConversationReaction,
  loadAuthorizedMessageContextRows,
} from "@/lib/conversations/chat-rich-features";
import { presentListingSharePayload } from "@/lib/conversations/listing-share/payload";
import { presentSmsAutomationMessagePayload } from "@/lib/conversations/sms-automation-payload";
import { normalizeChatReactionKey } from "@/lib/chat/emoji-catalog";
import { customerChatAgentPhotoAllowed } from "@/lib/customer-chat/floating-chat";
import { parseJsonText } from "@/lib/http/json-body";
import { scheduleNotifyAssignedAgentOfCustomerChatMessage } from "@/lib/notifications/customer-chat-agent-push";
import { isConsumerRole } from "@/lib/roles";
import {
  resolveWorkspaceFromRequest,
  type HostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";
import { z } from "zod";

export const CUSTOMER_CONVERSATION_PAGE_SIZE = AGENT_CONVERSATION_PAGE_SIZE;
export const CUSTOMER_CONVERSATION_PAGE_MAX = AGENT_CONVERSATION_PAGE_MAX;
export const CUSTOMER_CHAT_TEXT_MAX_LENGTH = AGENT_CHAT_TEXT_MAX_LENGTH;
export const customerChatSendRequestSchema = z
  .object({
    body: z.string(),
    replyToMessageId: z.string().trim().min(1).max(64).optional().nullable(),
  })
  .strict();

export const CUSTOMER_CONVERSATION_MESSAGE_SELECT = {
  id: true,
  channel: true,
  kind: true,
  senderKind: true,
  senderName: true,
  body: true,
  editedAt: true,
  deletedAt: true,
  replyToMessageId: true,
  createdAt: true,
  deliveredAt: true,
  payload: true,
} as const;

export type CustomerConversationMessageRow = Pick<
  Message,
  keyof typeof CUSTOMER_CONVERSATION_MESSAGE_SELECT
>;

export type CustomerConversationMessage = {
  id: string;
  channel: MessageChannel;
  kind: MessageKind;
  senderKind: MessageSenderKind;
  senderName: string;
  body: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: string | null;
  replyTo: {
    id: string;
    senderName: string;
    body: string | null;
    deleted: boolean;
  } | null;
  deliveredAt: string | null;
  reactions: Array<{
    key: string;
    count: number;
    reactedByMe: boolean;
  }>;
  attachments: Array<{
    id: string;
    kind: "VOICE_NOTE";
    mimeType: string;
    byteSize: number;
    durationMs: number | null;
  }>;
  createdAt: string;
  payload: Prisma.JsonValue | null;
};

export type CustomerConversationSummary = {
  id: string;
  status: ConversationStatus;
  lastMessageAt: string | null;
};

export type CustomerConversationReadView = {
  customerLastReadAt: string | null;
  /** Peer (assigned agent) conversation cursor — for Read receipts on own messages. */
  agentLastReadAt: string | null;
  unreadCount: number;
};

export type CustomerConversationAgentIdentity = {
  name: string | null;
  photoUrl: string | null;
};

export type CustomerConversationGetPayload = {
  conversation: CustomerConversationSummary | null;
  messages: CustomerConversationMessage[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  canSend: boolean;
  blocked: boolean;
  read: CustomerConversationReadView;
  agent: CustomerConversationAgentIdentity | null;
  /** True when the assigned agent’s typing TTL is still active. */
  peerTyping: boolean;
  /**
   * Coarse assigned-agent availability only. Never timestamps / preference /
   * session details. Unassigned or ineligible → offline (never online).
   */
  agentAvailability: CustomerAgentAvailability;
};

export type CustomerConversationSendPayload = {
  conversation: CustomerConversationSummary;
  message: CustomerConversationMessage;
};

export type CustomerConversationMarkReadPayload = {
  ok: true;
  marked: boolean;
  conversation: {
    id: string;
    customerLastReadAt: string | null;
  } | null;
};

export type CustomerConversationHttpResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

export type CustomerConversationDb = ConversationMessageDb &
  ConversationReadStateDb &
  ConversationLeadActivityDb;

export type CustomerSendAccess =
  | { ok: true; user: CustomerUser }
  | { ok: false; status: number; body: unknown };

export type CustomerConversationApiDeps = {
  db: CustomerConversationDb;
  hostDeps?: HostResolutionDeps;
  resolverDeps?: Partial<CustomerChatLeadResolverDeps>;
  resolveCustomerChatLead?: typeof resolveCustomerChatLead;
  ensureCustomerChatLead?: typeof ensureCustomerChatLead;
  resolveWorkspaceFromRequest?: typeof resolveWorkspaceFromRequest;
  allowCustomerChatSend?: typeof allowCustomerChatSend;
  requireSendAccess?: () => Promise<CustomerSendAccess>;
  scheduleAssignedAgentChatPush?: typeof scheduleNotifyAssignedAgentOfCustomerChatMessage;
  resolveAssignedAgentIdentity?: (
    input: {
      workspaceId: string;
      assignedAgentId: string | null;
    },
  ) => Promise<CustomerConversationAgentIdentity | null>;
};

function encodeTranscriptCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function presentCustomerConversationMessage(
  row: CustomerConversationMessageRow,
  extras?: {
    replyTo?: CustomerConversationMessage["replyTo"];
    reactions?: CustomerConversationMessage["reactions"];
    attachments?: CustomerConversationMessage["attachments"];
  },
): CustomerConversationMessage {
  const deleted = Boolean(row.deletedAt);
  let payload: CustomerConversationMessage["payload"] = null;
  if (!deleted && row.kind === "TEXT" && row.channel === "SMS") {
    payload = presentSmsAutomationMessagePayload(row.payload);
  } else if (!deleted && row.kind === "TEXT" && row.channel === "CHAT") {
    const share = presentListingSharePayload(row.payload);
    payload = share ? (share as unknown as CustomerConversationMessage["payload"]) : null;
  }
  return {
    id: row.id,
    channel: row.channel,
    kind: row.kind,
    senderKind: row.senderKind,
    senderName: row.senderName,
    body: deleted ? null : row.body,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    replyToMessageId: row.replyToMessageId,
    replyTo: extras?.replyTo ?? null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    reactions: extras?.reactions ?? [],
    attachments: deleted ? [] : extras?.attachments ?? [],
    createdAt: row.createdAt.toISOString(),
    payload,
  };
}

function emptyGetPayload(limit: number): CustomerConversationGetPayload {
  return {
    conversation: null,
    messages: [],
    page: { limit, hasMore: false, nextCursor: null },
    canSend: true,
    blocked: false,
    read: {
      customerLastReadAt: null,
      agentLastReadAt: null,
      unreadCount: 0,
    },
    agent: null,
    peerTyping: false,
    agentAvailability: "offline",
  };
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Assigned-agent header identity for the customer's lead assignee only.
 * Name: assignee User.name (plus workspace professional registered name when
 * the assignee is the primary agent). Photo: workspace branding
 * agentProfilePhotoUrl only when assignee === primaryAgentId — never User.image,
 * never brokerageLogoUrl, never a branding portrait for a different assignee.
 */
export async function resolveAssignedCustomerChatAgentIdentity(input: {
  workspaceId: string;
  assignedAgentId: string | null;
  db: {
    user: {
      findUnique: (args: {
        where: { id: string };
        select: { name: true };
      }) => Promise<{ name: string | null } | null>;
    };
    workspace: {
      findUnique: (args: {
        where: { id: string };
        select: {
          primaryAgentId: true;
          branding: { select: { agentProfilePhotoUrl: true } };
          professionalIdentity: {
            select: { agentRegisteredName: true };
          };
        };
      }) => Promise<{
        primaryAgentId: string | null;
        branding: { agentProfilePhotoUrl: string | null } | null;
        professionalIdentity: { agentRegisteredName: string | null } | null;
      } | null>;
    };
  };
}): Promise<CustomerConversationAgentIdentity | null> {
  const agentId = input.assignedAgentId?.trim() || null;
  if (!agentId) return null;

  const [user, workspace] = await Promise.all([
    input.db.user.findUnique({
      where: { id: agentId },
      select: { name: true },
    }),
    input.db.workspace.findUnique({
      where: { id: input.workspaceId },
      select: {
        primaryAgentId: true,
        branding: { select: { agentProfilePhotoUrl: true } },
        professionalIdentity: {
          select: { agentRegisteredName: true },
        },
      },
    }),
  ]);

  if (!user) return null;

  const photoAllowed = customerChatAgentPhotoAllowed({
    assignedAgentId: agentId,
    primaryAgentId: workspace?.primaryAgentId,
  });
  const name = firstNonEmpty(
    photoAllowed
      ? workspace?.professionalIdentity?.agentRegisteredName
      : null,
    user.name,
  );
  const photoUrl = photoAllowed
    ? firstNonEmpty(workspace?.branding?.agentProfilePhotoUrl)
    : null;

  if (!name && !photoUrl) {
    return { name: null, photoUrl: null };
  }
  return { name, photoUrl };
}

function presentConversation(
  conversation: LeadConversationRecord,
): CustomerConversationSummary {
  return {
    id: conversation.id,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt
      ? conversation.lastMessageAt.toISOString()
      : null,
  };
}

function hintsFromSearchParams(
  url: URL,
): Record<string, unknown> {
  const hints: Record<string, unknown> = {};
  url.searchParams.forEach((value, key) => {
    hints[key] = value;
  });
  return hints;
}

function jsonResult(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): CustomerConversationHttpResult {
  return { status, body, headers };
}

function mapResolverFailure(
  reason: CustomerChatLeadFailureReason,
): CustomerConversationHttpResult {
  switch (reason) {
    case "UNAUTHENTICATED":
      return jsonResult(401, {
        error: "Sign in required.",
        requiresAuth: true,
      });
    case "STAFF_FORBIDDEN":
    case "WORKSPACE_UNAVAILABLE":
    case "PLATFORM_SURFACE":
      return jsonResult(404, { error: "Not found" });
    case "CUSTOMER_DISABLED":
      return jsonResult(403, { error: "Forbidden" });
    case "NO_ELIGIBLE_AGENT":
    case "ROUTING_UNAVAILABLE":
      return jsonResult(503, {
        error: "Chat is unavailable right now.",
        code: "CHAT_AGENT_UNAVAILABLE",
      });
    case "LEAD_NOT_FOUND":
      return jsonResult(404, { error: "Not found" });
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

async function defaultRequireSendAccess(): Promise<CustomerSendAccess> {
  const access = await requireFullCustomerUser();
  if (access.denied) {
    let body: unknown = { error: "Sign in required.", requiresAuth: true };
    try {
      body = await access.denied.clone().json();
    } catch {
      // keep default
    }
    return { ok: false, status: access.denied.status, body };
  }
  return { ok: true, user: access.user };
}

function mergeApiDeps(
  deps: CustomerConversationApiDeps,
): Required<
  Pick<
    CustomerConversationApiDeps,
    | "resolveCustomerChatLead"
    | "ensureCustomerChatLead"
    | "resolveWorkspaceFromRequest"
    | "allowCustomerChatSend"
    | "requireSendAccess"
    | "scheduleAssignedAgentChatPush"
  >
> &
  CustomerConversationApiDeps {
  return {
    ...deps,
    resolveCustomerChatLead:
      deps.resolveCustomerChatLead ?? resolveCustomerChatLead,
    ensureCustomerChatLead:
      deps.ensureCustomerChatLead ?? ensureCustomerChatLead,
    resolveWorkspaceFromRequest:
      deps.resolveWorkspaceFromRequest ?? resolveWorkspaceFromRequest,
    allowCustomerChatSend: deps.allowCustomerChatSend ?? allowCustomerChatSend,
    requireSendAccess: deps.requireSendAccess ?? defaultRequireSendAccess,
    scheduleAssignedAgentChatPush:
      deps.scheduleAssignedAgentChatPush ??
      scheduleNotifyAssignedAgentOfCustomerChatMessage,
  };
}

async function loadTranscriptPage(
  db: CustomerConversationDb,
  conversation: LeadConversationRecord,
  page: { limit: number; cursor: { createdAt: Date; id: string } | null },
  viewerUserId: string,
): Promise<{
  messages: CustomerConversationMessage[];
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
    select: CUSTOMER_CONVERSATION_MESSAGE_SELECT,
  });

  const hasMore = rows.length > page.limit;
  const newestFirst = hasMore ? rows.slice(0, page.limit) : rows;
  const chronological = [...newestFirst].reverse();
  const oldest = chronological[0];
  const extras = await enrichChatMessages(
    db as unknown as Parameters<typeof enrichChatMessages>[0],
    {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      viewerUserId,
      messages: chronological,
    },
  ).catch(() => new Map());
  return {
    messages: chronological.map((row) => {
      const rich = extras.get(row.id);
      return presentCustomerConversationMessage(row, {
        replyTo: rich?.replyTo ?? null,
        reactions: rich?.reactions ?? [],
        attachments: rich?.attachments ?? [],
      });
    }),
    hasMore,
    nextCursor:
      hasMore && oldest
        ? encodeTranscriptCursor(oldest.createdAt, oldest.id)
        : null,
  };
}

export async function handleCustomerConversationGet(
  request: Request,
  deps: CustomerConversationApiDeps,
): Promise<CustomerConversationHttpResult> {
  const api = mergeApiDeps(deps);
  const url = new URL(request.url);
  const page = parseAgentConversationPageParams(url);
  if (!page.ok) {
    return jsonResult(400, { error: "Invalid cursor" });
  }

  const resolved = await api.resolveCustomerChatLead({
    request,
    untrustedClientHints: hintsFromSearchParams(url),
    hostDeps: deps.hostDeps,
    deps: deps.resolverDeps,
  });

  if (!resolved.ok) {
    if (resolved.reason === "LEAD_NOT_FOUND") {
      return jsonResult(200, emptyGetPayload(page.value.limit));
    }
    return mapResolverFailure(resolved.reason);
  }

  return loadExistingCustomerTranscript(deps, resolved, page.value);
}

async function loadExistingCustomerTranscript(
  deps: CustomerConversationApiDeps,
  resolved: CustomerChatLeadSuccess,
  page: { limit: number; cursor: { createdAt: Date; id: string } | null },
): Promise<CustomerConversationHttpResult> {
  const db = deps.db;
  const created = await getOrCreateLeadConversation(db, {
    workspaceId: resolved.workspaceId,
    leadId: resolved.leadId,
  });
  if (!created.ok) {
    return jsonResult(500, { error: "Failed to load" });
  }

  const blocked = created.conversation.status === "BLOCKED";
  const resolveAgent =
    deps.resolveAssignedAgentIdentity ??
    ((input: {
      workspaceId: string;
      assignedAgentId: string | null;
    }) =>
      resolveAssignedCustomerChatAgentIdentity({
        ...input,
        db: db as unknown as Parameters<
          typeof resolveAssignedCustomerChatAgentIdentity
        >[0]["db"],
      }));

  const canResolvePresence =
    Boolean(resolved.assignedAgentId) && resolved.assignedAgentEligible;

  const [transcript, unread, agent, typing, presence] = await Promise.all([
    loadTranscriptPage(
      db,
      created.conversation,
      page,
      resolved.customerUserId,
    ),
    getConversationUnreadState(db, {
      workspaceId: resolved.workspaceId,
      leadId: resolved.leadId,
    }),
    resolveAgent({
      workspaceId: resolved.workspaceId,
      assignedAgentId: resolved.assignedAgentId,
    }).catch(() => null),
    loadConversationTypingState(db as unknown as ConversationTypingDb, {
      workspaceId: resolved.workspaceId,
      conversationId: created.conversation.id,
    }).catch(() => null),
    canResolvePresence && resolved.assignedAgentId
      ? loadAgentPresenceState(
          db as unknown as AgentPresenceDb,
          resolved.assignedAgentId,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  const payload: CustomerConversationGetPayload = {
    conversation: presentConversation(created.conversation),
    messages: transcript.messages,
    page: {
      limit: page.limit,
      hasMore: transcript.hasMore,
      nextCursor: transcript.nextCursor,
    },
    canSend: !blocked,
    blocked,
    read: {
      customerLastReadAt: created.conversation.customerLastReadAt
        ? created.conversation.customerLastReadAt.toISOString()
        : null,
      agentLastReadAt: created.conversation.agentLastReadAt
        ? created.conversation.agentLastReadAt.toISOString()
        : null,
      unreadCount: unread.customerUnreadCount,
    },
    agent,
    peerTyping: isTypingActive(typing?.agentTypingUntil ?? null),
    agentAvailability: resolveAssignedAgentAvailability({
      assignedAgentId: resolved.assignedAgentId,
      assignedAgentEligible: resolved.assignedAgentEligible,
      presence,
    }),
  };
  return jsonResult(200, payload);
}

export async function handleCustomerConversationSend(
  request: Request,
  deps: CustomerConversationApiDeps,
): Promise<CustomerConversationHttpResult> {
  const api = mergeApiDeps(deps);

  const parsedJson = parseJsonText(await request.text());
  if (parsedJson.parse !== "ok") {
    return jsonResult(400, { error: "Invalid payload" });
  }
  const parsed = customerChatSendRequestSchema.safeParse(parsedJson.data);
  if (!parsed.success) {
    return jsonResult(400, { error: "Invalid payload" });
  }
  const text = normalizeAgentChatText(parsed.data.body);
  if (!text) {
    return jsonResult(400, { error: "Invalid payload" });
  }

  const access = await api.requireSendAccess();
  if (!access.ok) {
    return jsonResult(access.status, access.body);
  }
  if (!isConsumerRole(access.user.role)) {
    return jsonResult(404, { error: "Not found" });
  }

  const host = await api.resolveWorkspaceFromRequest(
    request,
    deps.hostDeps,
  );
  if (!host.ok) {
    return jsonResult(404, { error: "Not found" });
  }

  const rate = api.allowCustomerChatSend({
    customerUserId: access.user.id,
    workspaceId: host.workspaceId,
  });
  if (!rate.allowed) {
    return jsonResult(
      429,
      {
        error: "Too many messages.",
        code: "RATE_LIMITED",
      },
      { "Retry-After": String(rate.retryAfterSec) },
    );
  }

  const ensured = await api.ensureCustomerChatLead({
    request,
    untrustedClientHints:
      parsedJson.data && typeof parsedJson.data === "object"
        ? (parsedJson.data as Record<string, unknown>)
        : null,
    hostDeps: deps.hostDeps,
    deps: deps.resolverDeps,
  });

  if (!ensured.ok) {
    if (ensured.reason === "LEAD_NOT_FOUND") {
      return jsonResult(503, {
        error: "Chat is unavailable right now.",
        code: "CHAT_AGENT_UNAVAILABLE",
      });
    }
    return mapResolverFailure(ensured.reason);
  }

  if (!ensured.assignedAgentId) {
    return jsonResult(503, {
      error: "Chat is unavailable right now.",
      code: "CHAT_AGENT_UNAVAILABLE",
    });
  }

  const existing = await findLeadConversation(deps.db, {
    workspaceId: ensured.workspaceId,
    leadId: ensured.leadId,
  });
  if (existing?.status === "BLOCKED") {
    return jsonResult(403, {
      error: "Chat is unavailable.",
      code: "CHAT_BLOCKED",
    });
  }

  const senderName = frozenCustomerChatDisplayName({
    name: access.user.name,
    email: access.user.email,
  });
  const created = await createConversationMessage(deps.db, {
    workspaceId: ensured.workspaceId,
    leadId: ensured.leadId,
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "CUSTOMER",
    senderUserId: access.user.id,
    createdByUserId: access.user.id,
    senderName,
    body: text,
    replyToMessageId: parsed.data.replyToMessageId ?? null,
  });

  if (!created.ok) {
    if (created.reason === "INVALID_REPLY") {
      return jsonResult(400, { error: "Invalid reply target" });
    }
    return jsonResult(400, { error: "Invalid payload" });
  }

  await clearConversationTypingOnSend(
    deps.db as unknown as ConversationTypingDb,
    {
      workspaceId: ensured.workspaceId,
      conversationId: created.conversation.id,
      side: "customer",
    },
  ).catch(() => undefined);

  try {
    await recordConversationLeadActivity(deps.db, {
      leadId: ensured.leadId,
      workspaceId: ensured.workspaceId,
      messageId: created.message.id,
      body: text,
      channel: "CHAT",
      direction: "inbound",
      userId: access.user.id,
    });
  } catch {
    // Conversation persist already succeeded.
  }

  try {
    api.scheduleAssignedAgentChatPush({
      leadId: ensured.leadId,
      trustedWorkspaceId: ensured.workspaceId,
      created: created.created,
      message: {
        id: created.message.id,
        channel: created.message.channel,
        kind: created.message.kind,
        senderKind: created.message.senderKind,
        senderName: created.message.senderName,
        body: created.message.body,
      },
    });
  } catch (error) {
    console.error("[staff-notify] chat_message schedule failed", {
      messageId: created.message.id,
      leadId: ensured.leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const rich = await enrichChatMessages(
    deps.db as unknown as Parameters<typeof enrichChatMessages>[0],
    {
      workspaceId: ensured.workspaceId,
      conversationId: created.conversation.id,
      viewerUserId: access.user.id,
      messages: [
        {
          id: created.message.id,
          replyToMessageId: created.message.replyToMessageId,
          deliveredAt: created.message.deliveredAt,
        },
      ],
    },
  ).catch(() => new Map());
  const extras = rich.get(created.message.id);

  const payload: CustomerConversationSendPayload = {
    conversation: presentConversation(created.conversation),
    message: presentCustomerConversationMessage(
      {
        id: created.message.id,
        channel: created.message.channel,
        kind: created.message.kind,
        senderKind: created.message.senderKind,
        senderName: created.message.senderName,
        body: created.message.body,
        editedAt: null,
        deletedAt: null,
        replyToMessageId: created.message.replyToMessageId,
        createdAt: created.message.createdAt,
        deliveredAt: created.message.deliveredAt,
        payload: created.message.payload,
      },
      {
        replyTo: extras?.replyTo ?? null,
        reactions: extras?.reactions ?? [],
        attachments: extras?.attachments ?? [],
      },
    ),
  };
  return jsonResult(200, payload);
}

export async function handleCustomerConversationRead(
  request: Request,
  deps: CustomerConversationApiDeps,
): Promise<CustomerConversationHttpResult> {
  const api = mergeApiDeps(deps);
  let hints: Record<string, unknown> | null = null;
  const raw = await request.text();
  if (raw.trim()) {
    const parsedJson = parseJsonText(raw);
    if (parsedJson.parse === "invalid") {
      return jsonResult(400, { error: "Invalid payload" });
    }
    if (
      parsedJson.parse === "ok" &&
      parsedJson.data &&
      typeof parsedJson.data === "object"
    ) {
      hints = parsedJson.data as Record<string, unknown>;
    }
  }

  const resolved = await api.resolveCustomerChatLead({
    request,
    untrustedClientHints: hints,
    hostDeps: deps.hostDeps,
    deps: deps.resolverDeps,
  });

  if (!resolved.ok) {
    if (resolved.reason === "LEAD_NOT_FOUND") {
      const noop: CustomerConversationMarkReadPayload = {
        ok: true,
        marked: false,
        conversation: null,
      };
      return jsonResult(200, noop);
    }
    return mapResolverFailure(resolved.reason);
  }

  const existing = await findLeadConversation(deps.db, {
    workspaceId: resolved.workspaceId,
    leadId: resolved.leadId,
  });
  if (!existing) {
    const noop: CustomerConversationMarkReadPayload = {
      ok: true,
      marked: false,
      conversation: null,
    };
    return jsonResult(200, noop);
  }

  const marked = await markConversationReadByCustomer(deps.db, {
    workspaceId: resolved.workspaceId,
    leadId: resolved.leadId,
  });
  if (!marked.ok) {
    const noop: CustomerConversationMarkReadPayload = {
      ok: true,
      marked: false,
      conversation: {
        id: existing.id,
        customerLastReadAt: existing.customerLastReadAt
          ? existing.customerLastReadAt.toISOString()
          : null,
      },
    };
    return jsonResult(200, noop);
  }

  const payload: CustomerConversationMarkReadPayload = {
    ok: true,
    marked: true,
    conversation: {
      id: marked.conversation.id,
      customerLastReadAt: marked.conversation.customerLastReadAt
        ? marked.conversation.customerLastReadAt.toISOString()
        : null,
    },
  };
  return jsonResult(200, payload);
}

export async function handleCustomerConversationReaction(
  request: Request,
  messageId: string,
  deps: CustomerConversationApiDeps,
): Promise<CustomerConversationHttpResult> {
  const api = mergeApiDeps(deps);
  const access = await api.requireSendAccess();
  if (!access.ok) {
    return jsonResult(access.status, access.body);
  }
  if (!isConsumerRole(access.user.role)) {
    return jsonResult(404, { error: "Not found" });
  }

  const parsedJson = parseJsonText(await request.text());
  if (parsedJson.parse !== "ok") {
    return jsonResult(400, { error: "Invalid payload" });
  }
  const keyRaw =
    parsedJson.data &&
    typeof parsedJson.data === "object" &&
    !Array.isArray(parsedJson.data) &&
    typeof (parsedJson.data as { key?: unknown }).key === "string"
      ? (parsedJson.data as { key: string }).key
      : "";
  if (!normalizeChatReactionKey(keyRaw)) {
    return jsonResult(400, { error: "Invalid reaction" });
  }

  const resolved = await api.resolveCustomerChatLead({
    request,
    untrustedClientHints: null,
    hostDeps: deps.hostDeps,
    deps: deps.resolverDeps,
  });
  if (!resolved.ok) {
    return mapResolverFailure(resolved.reason);
  }

  const conversation = await findLeadConversation(deps.db, {
    workspaceId: resolved.workspaceId,
    leadId: resolved.leadId,
  });
  if (!conversation) {
    return jsonResult(404, { error: "Not found" });
  }

  const result = await handleToggleConversationReaction(
    deps.db as unknown as Parameters<typeof handleToggleConversationReaction>[0],
    {
      workspaceId: resolved.workspaceId,
      conversationId: conversation.id,
      messageId,
      userId: access.user.id,
      key: keyRaw,
    },
  );
  if (!result.ok) {
    return jsonResult(result.status, result.body);
  }
  return jsonResult(result.status, result.body);
}

export async function handleCustomerConversationSearch(
  request: Request,
  deps: CustomerConversationApiDeps,
): Promise<CustomerConversationHttpResult> {
  const api = mergeApiDeps(deps);
  const access = await api.requireSendAccess();
  if (!access.ok) {
    return jsonResult(access.status, access.body);
  }
  if (!isConsumerRole(access.user.role)) {
    return jsonResult(404, { error: "Not found" });
  }

  const resolved = await api.resolveCustomerChatLead({
    request,
    untrustedClientHints: null,
    hostDeps: deps.hostDeps,
    deps: deps.resolverDeps,
  });
  if (!resolved.ok) {
    if (resolved.reason === "LEAD_NOT_FOUND") {
      return jsonResult(200, {
        query: "",
        hits: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      });
    }
    return mapResolverFailure(resolved.reason);
  }

  const conversation = await findLeadConversation(deps.db, {
    workspaceId: resolved.workspaceId,
    leadId: resolved.leadId,
  });
  if (!conversation) {
    return jsonResult(200, {
      query: "",
      hits: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    });
  }

  const result = await handleConversationSearchRequest(
    deps.db as unknown as Parameters<typeof handleConversationSearchRequest>[0],
    {
      workspaceId: resolved.workspaceId,
      conversationId: conversation.id,
      url: new URL(request.url),
    },
  );
  if (!result.ok) {
    return jsonResult(result.status, result.body);
  }
  return jsonResult(result.status, result.body);
}

export async function handleCustomerConversationMessageContext(
  request: Request,
  messageId: string,
  deps: CustomerConversationApiDeps,
): Promise<CustomerConversationHttpResult> {
  const api = mergeApiDeps(deps);
  const access = await api.requireSendAccess();
  if (!access.ok) {
    return jsonResult(access.status, access.body);
  }
  if (!isConsumerRole(access.user.role)) {
    return jsonResult(404, { error: "Not found" });
  }

  const resolved = await api.resolveCustomerChatLead({
    request,
    untrustedClientHints: null,
    hostDeps: deps.hostDeps,
    deps: deps.resolverDeps,
  });
  if (!resolved.ok) {
    return mapResolverFailure(resolved.reason);
  }

  const conversation = await findLeadConversation(deps.db, {
    workspaceId: resolved.workspaceId,
    leadId: resolved.leadId,
  });
  if (!conversation) {
    return jsonResult(404, { error: "Not found" });
  }

  const context = await loadAuthorizedMessageContextRows<CustomerConversationMessageRow>(
    deps.db as unknown as Parameters<typeof loadAuthorizedMessageContextRows>[0],
    {
      workspaceId: resolved.workspaceId,
      conversationId: conversation.id,
      messageId,
      select: CUSTOMER_CONVERSATION_MESSAGE_SELECT,
    },
  );
  if (!context) {
    return jsonResult(404, { error: "Not found" });
  }

  const extras = await enrichChatMessages(
    deps.db as unknown as Parameters<typeof enrichChatMessages>[0],
    {
      workspaceId: resolved.workspaceId,
      conversationId: conversation.id,
      viewerUserId: access.user.id,
      messages: context.messages,
    },
  ).catch(() => new Map());

  return jsonResult(200, {
    anchorMessageId: context.anchorMessageId,
    messages: context.messages.map((row) => {
      const rich = extras.get(row.id);
      return presentCustomerConversationMessage(row, {
        replyTo: rich?.replyTo ?? null,
        reactions: rich?.reactions ?? [],
        attachments: rich?.attachments ?? [],
      });
    }),
    page: context.page,
  });
}