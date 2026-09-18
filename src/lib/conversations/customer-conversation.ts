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
 * marks read.
 *
 * POST send is the only path that may create/route/assign a Lead via ensure.
 * Messages go through createConversationMessage. Rate limit runs after
 * trusted hostname Workspace resolution and before Message creation.
 *
 * This module does not send notifications, email, SMS, or consent events.
 */
import type {
  ConversationStatus,
  Message,
  MessageChannel,
  MessageKind,
  MessageSenderKind,
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
  agentChatSendRequestSchema,
  normalizeAgentChatText,
} from "@/lib/conversations/agent-conversation-send";
import {
  allowCustomerChatSend,
} from "@/lib/conversations/customer-chat-rate-limit";
import {
  ensureCustomerChatLead,
  frozenCustomerChatDisplayName,
  resolveCustomerChatLead,
  type CustomerChatLeadFailureReason,
  type CustomerChatLeadResolverDeps,
  type CustomerChatLeadResult,
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
import { parseJsonText } from "@/lib/http/json-body";
import { isConsumerRole } from "@/lib/roles";
import {
  resolveWorkspaceFromRequest,
  type HostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";

export const CUSTOMER_CONVERSATION_PAGE_SIZE = AGENT_CONVERSATION_PAGE_SIZE;
export const CUSTOMER_CONVERSATION_PAGE_MAX = AGENT_CONVERSATION_PAGE_MAX;
export const CUSTOMER_CHAT_TEXT_MAX_LENGTH = AGENT_CHAT_TEXT_MAX_LENGTH;
export const customerChatSendRequestSchema = agentChatSendRequestSchema;

export const CUSTOMER_CONVERSATION_MESSAGE_SELECT = {
  id: true,
  channel: true,
  kind: true,
  senderKind: true,
  senderName: true,
  body: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
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
  createdAt: string;
};

export type CustomerConversationSummary = {
  id: string;
  status: ConversationStatus;
  lastMessageAt: string | null;
};

export type CustomerConversationReadView = {
  customerLastReadAt: string | null;
  unreadCount: number;
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
  ConversationReadStateDb;

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
};

function encodeTranscriptCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function presentCustomerConversationMessage(
  row: CustomerConversationMessageRow,
): CustomerConversationMessage {
  const deleted = Boolean(row.deletedAt);
  return {
    id: row.id,
    channel: row.channel,
    kind: row.kind,
    senderKind: row.senderKind,
    senderName: row.senderName,
    body: deleted ? null : row.body,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function emptyGetPayload(limit: number): CustomerConversationGetPayload {
  return {
    conversation: null,
    messages: [],
    page: { limit, hasMore: false, nextCursor: null },
    canSend: true,
    blocked: false,
    read: { customerLastReadAt: null, unreadCount: 0 },
  };
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
  };
}

async function loadTranscriptPage(
  db: CustomerConversationDb,
  conversation: LeadConversationRecord,
  page: { limit: number; cursor: { createdAt: Date; id: string } | null },
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
  return {
    messages: chronological.map(presentCustomerConversationMessage),
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

  return loadExistingCustomerTranscript(deps.db, resolved, page.value);
}

async function loadExistingCustomerTranscript(
  db: CustomerConversationDb,
  resolved: CustomerChatLeadSuccess,
  page: { limit: number; cursor: { createdAt: Date; id: string } | null },
): Promise<CustomerConversationHttpResult> {
  const created = await getOrCreateLeadConversation(db, {
    workspaceId: resolved.workspaceId,
    leadId: resolved.leadId,
  });
  if (!created.ok) {
    return jsonResult(500, { error: "Failed to load" });
  }

  const blocked = created.conversation.status === "BLOCKED";
  const [transcript, unread] = await Promise.all([
    loadTranscriptPage(db, created.conversation, page),
    getConversationUnreadState(db, {
      workspaceId: resolved.workspaceId,
      leadId: resolved.leadId,
    }),
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
      unreadCount: unread.customerUnreadCount,
    },
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
  });

  if (!created.ok) {
    return jsonResult(400, { error: "Invalid payload" });
  }

  const payload: CustomerConversationSendPayload = {
    conversation: presentConversation(created.conversation),
    message: presentCustomerConversationMessage({
      id: created.message.id,
      channel: created.message.channel,
      kind: created.message.kind,
      senderKind: created.message.senderKind,
      senderName: created.message.senderName,
      body: created.message.body,
      editedAt: null,
      deletedAt: null,
      createdAt: created.message.createdAt,
    }),
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