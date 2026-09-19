/**
 * Canonical HouzzatPRO Agent Chat Inbox list (assigned-to-me).
 *
 * AUTHORIZATION BOUNDARY
 * Callers authenticate first. This module scopes by trusted
 * ctx.workspaceId + ctx.user.id. It never reads client-supplied workspace
 * ids. V1 does not include unassigned pond Leads or team Conversations.
 * canSeeTeamLeads does not expand V1 to team Conversations.
 *
 * READ ONLY. Does not create Conversations/Messages, mark read, bump
 * lastMessageAt, write Lead/LeadActivity, or send notifications/email/SMS.
 *
 * filter=unread: load assigned-to-me non-empty headers (not team, not the
 * whole Workspace, not transcripts), batch-count unread, then keyset-page
 * the unread subset. Never take the first N of `all` and JS-filter.
 */
import type {
  ConversationStatus,
  LeadStatus,
  MessageChannel,
  MessageKind,
  MessageSenderKind,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import {
  V2_CHAT_DELETED_TOMBSTONE,
  v2ChatSystemCardLabel,
} from "@/lib/agent/lead-profile-v2/chat-query";
import type { LeadConversationRecord } from "@/lib/conversations/lead-conversation";
import {
  ASSIGNMENT_ACTIVITY_TYPES,
  ASSIGNMENT_CARD_TYPES,
  countIncomingAgentUnread,
  isAgentCursorValid,
  isAssignmentCard,
  resolveAgentCutoff,
  type AgentCutoff,
  type ConversationReadMessage,
} from "@/lib/conversations/read-state";

export const AGENT_INBOX_PAGE_SIZE = 40;
export const AGENT_INBOX_PAGE_MAX = 80;
export const AGENT_INBOX_PREVIEW_MAX = 120;
const INBOX_IN_CHUNK = 200;

export type AgentInboxListFilter = "all" | "unread";

export type AgentInboxCursor = {
  lastMessageAt: Date;
  id: string;
};

export type AgentInboxListParams = {
  q: string | null;
  filter: AgentInboxListFilter;
  limit: number;
  cursor: AgentInboxCursor | null;
};

export type AgentInboxLatestMessage = {
  id: string;
  channel: MessageChannel;
  kind: MessageKind;
  senderKind: MessageSenderKind;
  senderName: string;
  preview: string;
  createdAt: string;
};

export type AgentInboxListRow = {
  conversationId: string;
  leadId: string;
  status: ConversationStatus;
  lastMessageAt: string;
  lead: {
    displayName: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    pipelineStatus: LeadStatus;
  };
  assignment: {
    assignedAgentId: string | null;
    isAssignedToViewer: boolean;
  };
  latestMessage: AgentInboxLatestMessage | null;
  unread: {
    count: number;
    cutoffMode: AgentCutoff["mode"];
    agentCursorValid: boolean;
  };
  viewer: {
    canSend: boolean;
    canMarkRead: boolean;
  };
};

export type AgentInboxListResult = {
  conversations: AgentInboxListRow[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type AgentInboxHeader = {
  id: string;
  workspaceId: string;
  leadId: string;
  status: ConversationStatus;
  lastMessageAt: Date;
  agentLastReadAt: Date | null;
  agentLastReadByUserId: string | null;
  assignedAgentId: string | null;
  pipelineStatus: LeadStatus;
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    image: string | null;
  } | null;
};

export type AgentInboxLatestMessageRow = {
  id: string;
  conversationId: string;
  channel: MessageChannel;
  kind: MessageKind;
  senderKind: MessageSenderKind;
  senderName: string;
  body: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  payload: Prisma.JsonValue | null;
};

export type AgentInboxUnreadCutoffItem = {
  conversationId: string;
  assignedAgentId: string;
  cutoff: AgentCutoff;
};

export type AgentInboxListDb = {
  findInboxHeaders(input: {
    workspaceId: string;
    assignedAgentId: string;
    q: string | null;
    page?: { cursor: AgentInboxCursor | null; take: number };
  }): Promise<AgentInboxHeader[]>;
  findLatestMessages(input: {
    workspaceId: string;
    conversationIds: string[];
  }): Promise<AgentInboxLatestMessageRow[]>;
  findLatestAssignmentCards(input: {
    workspaceId: string;
    conversationIds: string[];
  }): Promise<Map<string, ConversationReadMessage>>;
  findLatestAssignmentActivities(input: {
    leadIds: string[];
  }): Promise<Map<string, { id: string; createdAt: Date }>>;
  countUnread(input: {
    workspaceId: string;
    items: AgentInboxUnreadCutoffItem[];
  }): Promise<Map<string, number>>;
};

export type ParseAgentInboxListParamsResult =
  | { ok: true; value: AgentInboxListParams }
  | { ok: false; reason: "INVALID_CURSOR" | "INVALID_FILTER" };

export type AgentInboxListHttpBody =
  | AgentInboxListResult
  | { error: string };

export type AgentInboxListHttpResult = {
  status: 200 | 400 | 401;
  body: AgentInboxListHttpBody;
};

function emptyResult(limit: number): AgentInboxListResult {
  return {
    conversations: [],
    page: { limit, hasMore: false, nextCursor: null },
  };
}

export function encodeAgentInboxCursor(lastMessageAt: Date, id: string): string {
  return `${lastMessageAt.toISOString()}|${id}`;
}

export function parseAgentInboxCursor(
  raw: string,
): AgentInboxCursor | null {
  const trimmed = raw.trim();
  const pipe = trimmed.indexOf("|");
  if (pipe <= 0 || pipe === trimmed.length - 1) return null;
  const lastMessageAt = new Date(trimmed.slice(0, pipe));
  const id = trimmed.slice(pipe + 1).trim();
  if (!id || Number.isNaN(lastMessageAt.getTime())) return null;
  return { lastMessageAt, id };
}

export function parseAgentInboxListParams(input: {
  q?: string | null;
  filter?: string | null;
  limit?: string | number | null;
  cursor?: string | null;
}): ParseAgentInboxListParamsResult {
  const filterRaw = input.filter?.trim() ?? "";
  let filter: AgentInboxListFilter = "all";
  if (filterRaw && filterRaw !== "all") {
    if (filterRaw !== "unread") {
      return { ok: false, reason: "INVALID_FILTER" };
    }
    filter = "unread";
  }

  const cursorRaw = input.cursor?.trim() ?? "";
  let cursor: AgentInboxCursor | null = null;
  if (cursorRaw) {
    cursor = parseAgentInboxCursor(cursorRaw);
    if (!cursor) return { ok: false, reason: "INVALID_CURSOR" };
  }

  let limit = AGENT_INBOX_PAGE_SIZE;
  if (input.limit != null && String(input.limit).trim()) {
    const parsed = Number.parseInt(String(input.limit), 10);
    if (Number.isFinite(parsed)) limit = parsed;
  }
  limit = Math.min(Math.max(limit, 1), AGENT_INBOX_PAGE_MAX);

  const q = input.q?.trim() ? input.q.trim() : null;
  return { ok: true, value: { q, filter, limit, cursor } };
}

export function inboxLatestMessagePreview(message: {
  kind: string;
  body: string | null;
  deletedAt: Date | string | null;
  payload: unknown;
}): string {
  if (message.deletedAt) return V2_CHAT_DELETED_TOMBSTONE;
  if (message.kind === "SYSTEM_CARD") {
    return v2ChatSystemCardLabel(message.payload);
  }
  const text = (message.body ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= AGENT_INBOX_PREVIEW_MAX) return text;
  return text.slice(0, AGENT_INBOX_PREVIEW_MAX);
}

export function inboxDisplayName(customer: {
  name: string | null;
  email: string | null;
} | null): string {
  const name = customer?.name?.trim();
  if (name) return name;
  const email = customer?.email?.trim();
  if (email) return email;
  return "Lead";
}

function compareInboxHeaders(a: AgentInboxHeader, b: AgentInboxHeader): number {
  const byTime = b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function isAfterInboxCursor(
  header: AgentInboxHeader,
  cursor: AgentInboxCursor,
): boolean {
  const t = header.lastMessageAt.getTime();
  const cursorT = cursor.lastMessageAt.getTime();
  if (t < cursorT) return true;
  if (t > cursorT) return false;
  return header.id < cursor.id;
}

function headerToConversation(
  header: AgentInboxHeader,
): LeadConversationRecord {
  return {
    id: header.id,
    workspaceId: header.workspaceId,
    leadId: header.leadId,
    status: header.status,
    createdAt: header.lastMessageAt,
    updatedAt: header.lastMessageAt,
    lastMessageAt: header.lastMessageAt,
    customerLastReadAt: null,
    agentLastReadAt: header.agentLastReadAt,
    agentLastReadByUserId: header.agentLastReadByUserId,
  };
}

export function resolveInboxAgentCutoff(
  header: AgentInboxHeader,
  latestAssignmentCard: ConversationReadMessage | null,
  latestAssignmentActivity: { id: string; createdAt: Date } | null,
): AgentCutoff {
  return resolveAgentCutoff(
    headerToConversation(header),
    header.assignedAgentId,
    latestAssignmentCard ? [latestAssignmentCard] : [],
    latestAssignmentActivity,
  );
}

async function loadUnreadViews(
  db: AgentInboxListDb,
  workspaceId: string,
  headers: AgentInboxHeader[],
): Promise<
  Map<
    string,
    { count: number; cutoffMode: AgentCutoff["mode"]; agentCursorValid: boolean }
  >
> {
  const views = new Map<
    string,
    { count: number; cutoffMode: AgentCutoff["mode"]; agentCursorValid: boolean }
  >();
  if (headers.length === 0) return views;

  const invalid = headers.filter(
    (header) =>
      Boolean(header.assignedAgentId) &&
      !isAgentCursorValid(
        {
          agentLastReadByUserId: header.agentLastReadByUserId,
        },
        header.assignedAgentId,
      ),
  );

  const cards =
    invalid.length > 0
      ? await db.findLatestAssignmentCards({
          workspaceId,
          conversationIds: invalid.map((row) => row.id),
        })
      : new Map<string, ConversationReadMessage>();
  const activities =
    invalid.length > 0
      ? await db.findLatestAssignmentActivities({
          leadIds: invalid.map((row) => row.leadId),
        })
      : new Map<string, { id: string; createdAt: Date }>();

  const items: AgentInboxUnreadCutoffItem[] = [];
  const meta = new Map<
    string,
    { cutoffMode: AgentCutoff["mode"]; agentCursorValid: boolean }
  >();

  for (const header of headers) {
    const agentCursorValid = isAgentCursorValid(
      { agentLastReadByUserId: header.agentLastReadByUserId },
      header.assignedAgentId,
    );
    const cutoff = resolveInboxAgentCutoff(
      header,
      cards.get(header.id) ?? null,
      activities.get(header.leadId) ?? null,
    );
    meta.set(header.id, {
      cutoffMode: cutoff.mode,
      agentCursorValid,
    });
    if (!header.assignedAgentId) {
      views.set(header.id, {
        count: 0,
        cutoffMode: cutoff.mode,
        agentCursorValid,
      });
      continue;
    }
    items.push({
      conversationId: header.id,
      assignedAgentId: header.assignedAgentId,
      cutoff,
    });
  }

  const counts =
    items.length > 0
      ? await db.countUnread({ workspaceId, items })
      : new Map<string, number>();

  for (const header of headers) {
    const info = meta.get(header.id);
    if (!info) continue;
    views.set(header.id, {
      count: counts.get(header.id) ?? 0,
      cutoffMode: info.cutoffMode,
      agentCursorValid: info.agentCursorValid,
    });
  }
  return views;
}

function presentRow(
  header: AgentInboxHeader,
  viewerUserId: string,
  latest: AgentInboxLatestMessageRow | null,
  unread: {
    count: number;
    cutoffMode: AgentCutoff["mode"];
    agentCursorValid: boolean;
  },
): AgentInboxListRow {
  const isAssignedToViewer = header.assignedAgentId === viewerUserId;
  return {
    conversationId: header.id,
    leadId: header.leadId,
    status: header.status,
    lastMessageAt: header.lastMessageAt.toISOString(),
    lead: {
      displayName: inboxDisplayName(header.customer),
      email: header.customer?.email?.trim() || null,
      phone: header.customer?.phone?.trim() || null,
      avatarUrl: header.customer?.image?.trim() || null,
      pipelineStatus: header.pipelineStatus,
    },
    assignment: {
      assignedAgentId: header.assignedAgentId,
      isAssignedToViewer,
    },
    latestMessage: latest
      ? {
          id: latest.id,
          channel: latest.channel,
          kind: latest.kind,
          senderKind: latest.senderKind,
          senderName: latest.senderName,
          preview: inboxLatestMessagePreview(latest),
          createdAt: latest.createdAt.toISOString(),
        }
      : null,
    unread,
    viewer: {
      canSend: isAssignedToViewer,
      canMarkRead: isAssignedToViewer,
    },
  };
}

/**
 * Assigned-to-me Chat Inbox page. Read-only. No lazy create / mark-read.
 */
export async function listAgentInboxConversations(
  db: AgentInboxListDb,
  ctx: Pick<AgentOrgContext, "user" | "workspaceId">,
  params: AgentInboxListParams,
): Promise<AgentInboxListResult> {
  const workspaceId = ctx.workspaceId?.trim() ?? "";
  const assignedAgentId = ctx.user.id.trim();
  if (!workspaceId || !assignedAgentId) {
    return emptyResult(params.limit);
  }

  if (params.filter === "all") {
    const headers = await db.findInboxHeaders({
      workspaceId,
      assignedAgentId,
      q: params.q,
      page: { cursor: params.cursor, take: params.limit + 1 },
    });
    const hasMore = headers.length > params.limit;
    const page = headers.slice(0, params.limit);
    const [unread, latestRows] = await Promise.all([
      loadUnreadViews(db, workspaceId, page),
      page.length
        ? db.findLatestMessages({
            workspaceId,
            conversationIds: page.map((row) => row.id),
          })
        : Promise.resolve([] as AgentInboxLatestMessageRow[]),
    ]);
    const latestById = new Map(
      latestRows.map((row) => [row.conversationId, row]),
    );
    const conversations = page.map((header) =>
      presentRow(
        header,
        assignedAgentId,
        latestById.get(header.id) ?? null,
        unread.get(header.id) ?? {
          count: 0,
          cutoffMode: "none",
          agentCursorValid: false,
        },
      ),
    );
    const last = page[page.length - 1];
    return {
      conversations,
      page: {
        limit: params.limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeAgentInboxCursor(last.lastMessageAt, last.id)
            : null,
      },
    };
  }

  const headers = await db.findInboxHeaders({
    workspaceId,
    assignedAgentId,
    q: params.q,
  });
  const unread = await loadUnreadViews(db, workspaceId, headers);
  const unreadHeaders = headers
    .filter((header) => (unread.get(header.id)?.count ?? 0) > 0)
    .sort(compareInboxHeaders);
  const afterCursor = params.cursor
    ? unreadHeaders.filter((header) =>
        isAfterInboxCursor(header, params.cursor!),
      )
    : unreadHeaders;
  const hasMore = afterCursor.length > params.limit;
  const page = afterCursor.slice(0, params.limit);
  const latestRows = page.length
    ? await db.findLatestMessages({
        workspaceId,
        conversationIds: page.map((row) => row.id),
      })
    : [];
  const latestById = new Map(latestRows.map((row) => [row.conversationId, row]));
  const conversations = page.map((header) =>
    presentRow(
      header,
      assignedAgentId,
      latestById.get(header.id) ?? null,
      unread.get(header.id) ?? {
        count: 0,
        cutoffMode: "none",
        agentCursorValid: false,
      },
    ),
  );
  const last = page[page.length - 1];
  return {
    conversations,
    page: {
      limit: params.limit,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeAgentInboxCursor(last.lastMessageAt, last.id)
          : null,
    },
  };
}

/**
 * Authenticated GET adapter. Auth is proven by the caller.
 * Parses only q/filter/limit/cursor. Ignores client workspace/agent ids.
 * Calls listAgentInboxConversations once. Read-only.
 */
export async function getAgentInboxListResponse(
  db: AgentInboxListDb,
  ctx: Pick<AgentOrgContext, "user" | "workspaceId"> | null,
  url: URL,
): Promise<AgentInboxListHttpResult> {
  if (!ctx) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const parsed = parseAgentInboxListParams({
    q: url.searchParams.get("q"),
    filter: url.searchParams.get("filter"),
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
  });
  if (!parsed.ok) {
    return {
      status: 400,
      body: {
        error:
          parsed.reason === "INVALID_CURSOR"
            ? "Invalid cursor"
            : "Invalid filter",
      },
    };
  }

  const data = await listAgentInboxConversations(db, ctx, parsed.value);
  return { status: 200, body: data };
}

function chunkIds(ids: string[]): string[][] {
  const unique = [...new Set(ids.filter((id) => id.trim()))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += INBOX_IN_CHUNK) {
    chunks.push(unique.slice(i, i + INBOX_IN_CHUNK));
  }
  return chunks;
}

function cutoffTimestamp(cutoff: AgentCutoff): Date | null {
  switch (cutoff.mode) {
    case "matching":
      return cutoff.exclusiveAfter;
    case "assignment_card":
      return cutoff.inclusiveFrom;
    case "assignment_activity":
      return cutoff.exclusiveAfter;
    case "conservative_unanchored":
    case "none":
      return null;
  }
}

/**
 * Prisma adapter for production (next ask: GET /api/agent/conversations).
 * Latest Message: one DISTINCT ON query per id chunk.
 * Unread: grouped COUNT with canonical cutoff predicates — not transcripts.
 */
export function createPrismaAgentInboxListDb(
  prisma: PrismaClient,
): AgentInboxListDb {
  return {
    async findInboxHeaders(input) {
      const q = input.q?.trim() || null;
      const search = q
        ? {
            customer: {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q, mode: "insensitive" as const } },
              ],
            },
          }
        : {};
      const cursorWhere = input.page?.cursor
        ? {
            OR: [
              { lastMessageAt: { lt: input.page.cursor.lastMessageAt } },
              {
                lastMessageAt: input.page.cursor.lastMessageAt,
                id: { lt: input.page.cursor.id },
              },
            ],
          }
        : {};

      const rows = await prisma.conversation.findMany({
        where: {
          workspaceId: input.workspaceId,
          lastMessageAt: { not: null },
          lead: {
            assignedAgentId: input.assignedAgentId,
            ...search,
          },
          ...cursorWhere,
        },
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        take: input.page?.take,
        select: {
          id: true,
          workspaceId: true,
          leadId: true,
          status: true,
          lastMessageAt: true,
          agentLastReadAt: true,
          agentLastReadByUserId: true,
          lead: {
            select: {
              assignedAgentId: true,
              status: true,
              customer: {
                select: {
                  name: true,
                  email: true,
                  phone: true,
                  image: true,
                },
              },
            },
          },
        },
      });

      const headers: AgentInboxHeader[] = [];
      for (const row of rows) {
        if (!row.lastMessageAt) continue;
        headers.push({
          id: row.id,
          workspaceId: row.workspaceId,
          leadId: row.leadId,
          status: row.status,
          lastMessageAt: row.lastMessageAt,
          agentLastReadAt: row.agentLastReadAt,
          agentLastReadByUserId: row.agentLastReadByUserId,
          assignedAgentId: row.lead.assignedAgentId,
          pipelineStatus: row.lead.status,
          customer: row.lead.customer,
        });
      }
      return headers;
    },

    async findLatestMessages(input) {
      const out: AgentInboxLatestMessageRow[] = [];
      for (const ids of chunkIds(input.conversationIds)) {
        const rows = await prisma.$queryRaw<AgentInboxLatestMessageRow[]>`
          SELECT DISTINCT ON (m."conversationId")
            m.id,
            m."conversationId",
            m.channel,
            m.kind,
            m."senderKind",
            m."senderName",
            m.body,
            m."deletedAt",
            m."createdAt",
            m.payload
          FROM "Message" m
          WHERE m."workspaceId" = ${input.workspaceId}
            AND m."conversationId" IN (${PrismaNs.join(ids)})
          ORDER BY m."conversationId", m."createdAt" DESC, m.id DESC
        `;
        out.push(...rows);
      }
      return out;
    },

    async findLatestAssignmentCards(input) {
      const map = new Map<string, ConversationReadMessage>();
      const cardTypes = [...ASSIGNMENT_CARD_TYPES];
      for (const ids of chunkIds(input.conversationIds)) {
        const rows = await prisma.$queryRaw<
          Array<
            ConversationReadMessage & {
              conversationId: string;
            }
          >
        >`
          SELECT DISTINCT ON (m."conversationId")
            m.id,
            m."conversationId",
            m."createdAt",
            m."senderKind",
            m."senderUserId",
            m."deletedAt",
            m.kind,
            m.payload,
            m."providerStatus",
            m."deliveredAt",
            m."twilioMessageSid",
            m.channel
          FROM "Message" m
          WHERE m."workspaceId" = ${input.workspaceId}
            AND m."conversationId" IN (${PrismaNs.join(ids)})
            AND m.kind = 'SYSTEM_CARD'
            AND m.payload->>'card' IN (${PrismaNs.join(cardTypes)})
          ORDER BY m."conversationId", m."createdAt" DESC, m.id DESC
        `;
        for (const row of rows) {
          if (!isAssignmentCard(row)) continue;
          map.set(row.conversationId, {
            id: row.id,
            createdAt: row.createdAt,
            senderKind: row.senderKind,
            senderUserId: row.senderUserId,
            deletedAt: row.deletedAt,
            kind: row.kind,
            payload: row.payload,
            providerStatus: row.providerStatus,
            deliveredAt: row.deliveredAt,
            twilioMessageSid: row.twilioMessageSid,
            channel: row.channel,
          });
        }
      }
      return map;
    },

    async findLatestAssignmentActivities(input) {
      const map = new Map<string, { id: string; createdAt: Date }>();
      const types = [...ASSIGNMENT_ACTIVITY_TYPES];
      for (const ids of chunkIds(input.leadIds)) {
        const rows = await prisma.$queryRaw<
          Array<{ id: string; leadId: string; createdAt: Date }>
        >`
          SELECT DISTINCT ON (a."leadId")
            a.id,
            a."leadId",
            a."createdAt"
          FROM "LeadActivity" a
          WHERE a."leadId" IN (${PrismaNs.join(ids)})
            AND a.type IN (${PrismaNs.join(types)})
          ORDER BY a."leadId", a."createdAt" DESC, a.id DESC
        `;
        for (const row of rows) {
          map.set(row.leadId, { id: row.id, createdAt: row.createdAt });
        }
      }
      return map;
    },

    async countUnread(input) {
      const map = new Map<string, number>();
      for (let i = 0; i < input.items.length; i += INBOX_IN_CHUNK) {
        const chunk = input.items.slice(i, i + INBOX_IN_CHUNK);
        if (chunk.length === 0) continue;
        const values = chunk.map((item) => {
          const ts = cutoffTimestamp(item.cutoff);
          return PrismaNs.sql`(
            ${item.conversationId}::text,
            ${item.assignedAgentId}::text,
            ${item.cutoff.mode}::text,
            ${ts}::timestamptz
          )`;
        });
        const rows = await prisma.$queryRaw<
          Array<{ conversationId: string; count: number }>
        >`
          WITH cutoffs(
            "conversationId",
            "assignedAgentId",
            mode,
            ts
          ) AS (
            VALUES ${PrismaNs.join(values)}
          )
          SELECT
            m."conversationId",
            COUNT(*)::int AS count
          FROM "Message" m
          JOIN cutoffs c ON c."conversationId" = m."conversationId"
          WHERE m."workspaceId" = ${input.workspaceId}
            AND m."deletedAt" IS NULL
            AND NOT (
              m."senderKind" = 'AGENT'
              AND m."senderUserId" = c."assignedAgentId"
            )
            AND (
              c.mode IN ('conservative_unanchored', 'none')
              OR (
                c.mode = 'assignment_card'
                AND c.ts IS NOT NULL
                AND m."createdAt" >= c.ts
              )
              OR (
                c.mode IN ('matching', 'assignment_activity')
                AND c.ts IS NOT NULL
                AND m."createdAt" > c.ts
              )
            )
          GROUP BY m."conversationId"
        `;
        for (const row of rows) {
          map.set(row.conversationId, Number(row.count));
        }
      }
      return map;
    },
  };
}

/**
 * In-memory unread counter used by selftests. Same predicates as Prisma SQL.
 * One pass over the provided message rows — callers must not invoke this
 * once per Conversation.
 */
export function countUnreadFromMessageRows(
  messages: Array<ConversationReadMessage & { conversationId: string }>,
  items: AgentInboxUnreadCutoffItem[],
): Map<string, number> {
  const byConversation = new Map<string, ConversationReadMessage[]>();
  for (const message of messages) {
    const list = byConversation.get(message.conversationId);
    if (list) list.push(message);
    else byConversation.set(message.conversationId, [message]);
  }
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(
      item.conversationId,
      countIncomingAgentUnread(
        byConversation.get(item.conversationId) ?? [],
        item.assignedAgentId,
        item.cutoff,
      ),
    );
  }
  return map;
}
