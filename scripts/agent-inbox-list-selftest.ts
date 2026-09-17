/**
 * Agent Chat Inbox list service — in-memory selftest.
 * Does not connect to production. Does not create production rows.
 * Run: pnpm agent-inbox-list:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ConversationStatus,
  LeadStatus,
  MessageChannel,
  MessageKind,
  MessageSenderKind,
  Prisma,
} from "@prisma/client";
import {
  AGENT_INBOX_PAGE_MAX,
  AGENT_INBOX_PAGE_SIZE,
  inboxLatestMessagePreview,
  listAgentInboxConversations,
  parseAgentInboxListParams,
  type AgentInboxHeader,
  type AgentInboxLatestMessageRow,
  type AgentInboxListDb,
  type AgentInboxListParams,
  countUnreadFromMessageRows,
} from "../src/lib/conversations/agent-inbox-list";
import { V2_CHAT_DELETED_TOMBSTONE } from "../src/lib/agent/lead-profile-v2/chat-query";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import {
  getConversationUnreadState,
  type ConversationReadMessage,
  type ConversationReadStateDb,
} from "../src/lib/conversations/read-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const CUSTOMER_A = "user_customer_a";

const T0 = new Date("2026-09-01T00:00:00.000Z");
const T1 = new Date("2026-09-02T00:00:00.000Z");
const T2 = new Date("2026-09-03T00:00:00.000Z");
const T3 = new Date("2026-09-04T00:00:00.000Z");
const T4 = new Date("2026-09-05T00:00:00.000Z");
const T5 = new Date("2026-09-06T00:00:00.000Z");
const T6 = new Date("2026-09-07T00:00:00.000Z");
const T7 = new Date("2026-09-08T00:00:00.000Z");
const T8 = new Date("2026-09-09T00:00:00.000Z");
const T_ASSIGN = new Date("2026-09-01T12:00:00.000Z");
const T_CARD = new Date("2026-09-10T12:00:00.000Z");
const T_AFTER = new Date("2026-09-17T15:00:00.000Z");
const T_LATER = new Date("2026-09-17T16:00:00.000Z");
const T_TIE = new Date("2026-09-20T12:00:00.000Z");

type FakeCustomer = {
  name: string | null;
  email: string | null;
  phone: string | null;
  image: string | null;
};

type FakeLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  status: LeadStatus;
  updatedAt: Date;
  customer: FakeCustomer | null;
};

type FakeConversation = LeadConversationRecord;

type FakeMessage = ConversationReadMessage & {
  workspaceId: string;
  conversationId: string;
  leadId: string;
  channel: MessageChannel;
  senderName: string;
  body: string | null;
  payload: Prisma.JsonValue | null;
  twilioMessageSid: string | null;
  smsFrom: string | null;
  smsTo: string | null;
};

type FakeActivity = {
  id: string;
  leadId: string;
  type: string;
  createdAt: Date;
};

class FakeInboxDb implements AgentInboxListDb, ConversationReadStateDb {
  leads = new Map<string, FakeLead>();
  conversations = new Map<string, FakeConversation>();
  messages: FakeMessage[] = [];
  activities: FakeActivity[] = [];
  findInboxHeadersCalls = 0;
  findLatestMessagesCalls = 0;
  findLatestAssignmentCardsCalls = 0;
  findLatestAssignmentActivitiesCalls = 0;
  countUnreadCalls = 0;
  conversationCreates = 0;
  conversationUpdates = 0;
  messageCreates = 0;
  leadUpdates = 0;
  nextMessageId = 1;
  nextActivityId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedLead(
    workspaceId: string,
    leadId: string,
    assignedAgentId: string | null,
    customer: Partial<FakeCustomer> | null = {},
    status: LeadStatus = "NEW_LEAD",
  ) {
    this.leads.set(this.leadKey(workspaceId, leadId), {
      id: leadId,
      workspaceId,
      assignedAgentId,
      status,
      updatedAt: T0,
      customer:
        customer === null
          ? null
          : {
              name: customer.name ?? "Buyer",
              email: customer.email ?? `${leadId}@test.local`,
              phone: customer.phone ?? "4165550000",
              image: customer.image ?? null,
            },
    });
  }

  seedConversation(
    overrides: Partial<FakeConversation> &
      Pick<FakeConversation, "id" | "workspaceId" | "leadId">,
  ) {
    const row: FakeConversation = {
      status: "OPEN" as ConversationStatus,
      createdAt: T0,
      updatedAt: T0,
      lastMessageAt: T1,
      customerLastReadAt: null,
      agentLastReadAt: null,
      agentLastReadByUserId: null,
      ...overrides,
    };
    this.conversations.set(this.leadKey(row.workspaceId, row.leadId), row);
    return row;
  }

  addMessage(input: {
    conversationId: string;
    workspaceId?: string;
    leadId?: string;
    createdAt: Date;
    senderKind: MessageSenderKind;
    senderUserId?: string | null;
    senderName?: string;
    body?: string | null;
    deletedAt?: Date | null;
    kind?: MessageKind;
    channel?: MessageChannel;
    payload?: Prisma.JsonValue | null;
    twilioMessageSid?: string | null;
    smsFrom?: string | null;
    smsTo?: string | null;
    id?: string;
  }) {
    const conversation = [...this.conversations.values()].find(
      (row) => row.id === input.conversationId,
    );
    const row: FakeMessage = {
      id: input.id ?? `msg_${this.nextMessageId++}`,
      workspaceId: input.workspaceId ?? conversation?.workspaceId ?? WS_A,
      conversationId: input.conversationId,
      leadId: input.leadId ?? conversation?.leadId ?? "lead_unknown",
      channel: input.channel ?? "CHAT",
      kind: input.kind ?? "TEXT",
      senderKind: input.senderKind,
      senderUserId: input.senderUserId ?? null,
      senderName: input.senderName ?? input.senderKind,
      body: input.body ?? "hello",
      createdAt: input.createdAt,
      deletedAt: input.deletedAt ?? null,
      payload: input.payload ?? null,
      providerStatus: null,
      deliveredAt: null,
      twilioMessageSid: input.twilioMessageSid ?? null,
      smsFrom: input.smsFrom ?? null,
      smsTo: input.smsTo ?? null,
    };
    this.messages.push(row);
    return row;
  }

  seedActivity(input: {
    leadId: string;
    type: string;
    createdAt: Date;
    id?: string;
  }) {
    const row: FakeActivity = {
      id: input.id ?? `act_${this.nextActivityId++}`,
      leadId: input.leadId,
      type: input.type,
      createdAt: input.createdAt,
    };
    this.activities.push(row);
    return row;
  }

  bumpLeadUpdatedAt(workspaceId: string, leadId: string, updatedAt: Date) {
    const row = this.leads.get(this.leadKey(workspaceId, leadId));
    if (!row) throw new Error("missing lead");
    row.updatedAt = updatedAt;
    this.leadUpdates += 1;
  }

  private toHeader(conversation: FakeConversation): AgentInboxHeader | null {
    if (!conversation.lastMessageAt) return null;
    const lead = this.leads.get(
      this.leadKey(conversation.workspaceId, conversation.leadId),
    );
    if (!lead) return null;
    return {
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      leadId: conversation.leadId,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      agentLastReadAt: conversation.agentLastReadAt,
      agentLastReadByUserId: conversation.agentLastReadByUserId,
      assignedAgentId: lead.assignedAgentId,
      pipelineStatus: lead.status,
      customer: lead.customer,
    };
  }

  private matchesSearch(lead: FakeLead, q: string | null): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    const hay = [
      lead.customer?.name,
      lead.customer?.email,
      lead.customer?.phone,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  }

  findInboxHeaders: AgentInboxListDb["findInboxHeaders"] = async (input) => {
    this.findInboxHeadersCalls += 1;
    const rows: AgentInboxHeader[] = [];
    for (const conversation of this.conversations.values()) {
      if (conversation.workspaceId !== input.workspaceId) continue;
      if (!conversation.lastMessageAt) continue;
      const lead = this.leads.get(
        this.leadKey(conversation.workspaceId, conversation.leadId),
      );
      if (!lead) continue;
      if (lead.assignedAgentId !== input.assignedAgentId) continue;
      if (!this.matchesSearch(lead, input.q)) continue;
      const header = this.toHeader(conversation);
      if (header) rows.push(header);
    }
    rows.sort((a, b) => {
      const byTime = b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
      if (byTime !== 0) return byTime;
      if (a.id === b.id) return 0;
      return a.id < b.id ? 1 : -1;
    });
    const cursor = input.page?.cursor;
    const after = cursor
      ? rows.filter((row) => {
          const t = row.lastMessageAt.getTime();
          const ct = cursor.lastMessageAt.getTime();
          if (t < ct) return true;
          if (t > ct) return false;
          return row.id < cursor.id;
        })
      : rows;
    return input.page ? after.slice(0, input.page.take) : after;
  };

  findLatestMessages: AgentInboxListDb["findLatestMessages"] = async (
    input,
  ) => {
    this.findLatestMessagesCalls += 1;
    const wanted = new Set(input.conversationIds);
    const latest = new Map<string, AgentInboxLatestMessageRow>();
    for (const message of this.messages) {
      if (message.workspaceId !== input.workspaceId) continue;
      if (!wanted.has(message.conversationId)) continue;
      const prev = latest.get(message.conversationId);
      if (
        !prev ||
        message.createdAt.getTime() > prev.createdAt.getTime() ||
        (message.createdAt.getTime() === prev.createdAt.getTime() &&
          message.id > prev.id)
      ) {
        latest.set(message.conversationId, {
          id: message.id,
          conversationId: message.conversationId,
          channel: message.channel,
          kind: message.kind,
          senderKind: message.senderKind,
          senderName: message.senderName,
          body: message.body,
          deletedAt: message.deletedAt,
          createdAt: message.createdAt,
          payload: message.payload,
        });
      }
    }
    return [...latest.values()];
  };

  findLatestAssignmentCards: AgentInboxListDb["findLatestAssignmentCards"] =
    async (input) => {
      this.findLatestAssignmentCardsCalls += 1;
      const wanted = new Set(input.conversationIds);
      const map = new Map<string, ConversationReadMessage>();
      for (const message of this.messages) {
        if (message.workspaceId !== input.workspaceId) continue;
        if (!wanted.has(message.conversationId)) continue;
        if (!isAssignmentCardSafe(message)) continue;
        const prev = map.get(message.conversationId);
        if (
          !prev ||
          message.createdAt > prev.createdAt ||
          (message.createdAt.getTime() === prev.createdAt.getTime() &&
            message.id > prev.id)
        ) {
          map.set(message.conversationId, message);
        }
      }
      return map;
    };

  findLatestAssignmentActivities: AgentInboxListDb["findLatestAssignmentActivities"] =
    async (input) => {
      this.findLatestAssignmentActivitiesCalls += 1;
      const wanted = new Set(input.leadIds);
      const map = new Map<string, { id: string; createdAt: Date }>();
      for (const activity of this.activities) {
        if (!wanted.has(activity.leadId)) continue;
        if (
          activity.type !== "assigned" &&
          activity.type !== "reassigned" &&
          activity.type !== "claimed"
        ) {
          continue;
        }
        const prev = map.get(activity.leadId);
        if (
          !prev ||
          activity.createdAt > prev.createdAt ||
          (activity.createdAt.getTime() === prev.createdAt.getTime() &&
            activity.id > prev.id)
        ) {
          map.set(activity.leadId, {
            id: activity.id,
            createdAt: activity.createdAt,
          });
        }
      }
      return map;
    };

  countUnread: AgentInboxListDb["countUnread"] = async (input) => {
    this.countUnreadCalls += 1;
    const ids = new Set(input.items.map((item) => item.conversationId));
    const rows = this.messages.filter(
      (message) =>
        message.workspaceId === input.workspaceId &&
        ids.has(message.conversationId),
    );
    return countUnreadFromMessageRows(rows, input.items);
  };

  lead: ConversationReadStateDb["lead"] = {
    findUnique: async ({ where }) => {
      const pair = where.workspaceId_id;
      if (!pair) return null;
      const row = this.leads.get(this.leadKey(pair.workspaceId, pair.id));
      if (!row) return null;
      return {
        assignedAgentId: row.assignedAgentId,
        workspaceId: row.workspaceId,
      };
    },
  };

  conversation = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const byLead = where.workspaceId_leadId as
        | { workspaceId: string; leadId: string }
        | undefined;
      if (byLead) {
        return (
          this.conversations.get(
            this.leadKey(byLead.workspaceId, byLead.leadId),
          ) ?? null
        );
      }
      return null;
    },
    update: async () => {
      this.conversationUpdates += 1;
      throw new Error("inbox list must not update conversations");
    },
    create: async () => {
      this.conversationCreates += 1;
      throw new Error("inbox list must not create conversations");
    },
  };

  message = {
    findMany: async ({
      where,
    }: {
      where: { workspaceId?: string; conversationId?: string };
    }) => {
      return this.messages.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.conversationId === where.conversationId,
      );
    },
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { workspaceId?: string; conversationId?: string };
      orderBy?: { createdAt?: "asc" | "desc" };
    }) => {
      const rows = [...this.messages].filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.conversationId === where.conversationId,
      );
      rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (orderBy?.createdAt === "desc") rows.reverse();
      return rows[0] ?? null;
    },
    create: async () => {
      this.messageCreates += 1;
      throw new Error("inbox list must not create messages");
    },
  };

  leadActivity = {
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { leadId?: string; type?: { in?: string[] } | string };
      orderBy?: { createdAt?: "asc" | "desc" };
    }) => {
      const allowed =
        typeof where.type === "string"
          ? [where.type]
          : where.type?.in ?? null;
      const rows = this.activities.filter((row) => {
        if (where.leadId && row.leadId !== where.leadId) return false;
        if (allowed && !allowed.includes(row.type)) return false;
        return true;
      });
      rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (orderBy?.createdAt === "desc") rows.reverse();
      const row = rows[0];
      return row ? { id: row.id, createdAt: row.createdAt } : null;
    },
  };
}

function isAssignmentCardSafe(message: ConversationReadMessage) {
  if (message.kind !== "SYSTEM_CARD") return false;
  const payload = message.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const card = (payload as { card?: unknown }).card;
  return card === "ASSIGNED" || card === "REASSIGNED";
}

function ctx(userId = AGENT_A, workspaceId: string | null = WS_A) {
  return {
    user: {
      id: userId,
      email: "agent@test.local",
      name: "Agent",
      image: null,
      phone: null,
      role: "AGENT" as const,
    },
    workspaceId,
  };
}

function allParams(
  overrides: Partial<AgentInboxListParams> = {},
): AgentInboxListParams {
  return {
    q: null,
    filter: "all",
    limit: AGENT_INBOX_PAGE_SIZE,
    cursor: null,
    ...overrides,
  };
}

function seedAssignedThread(
  db: FakeInboxDb,
  input: {
    leadId: string;
    conversationId: string;
    lastMessageAt: Date;
    assignedAgentId?: string | null;
    workspaceId?: string;
    customer?: Partial<FakeCustomer> | null;
    body?: string;
    senderKind?: MessageSenderKind;
    senderUserId?: string | null;
  },
) {
  const workspaceId = input.workspaceId ?? WS_A;
  db.seedLead(
    workspaceId,
    input.leadId,
    input.assignedAgentId === undefined ? AGENT_A : input.assignedAgentId,
    input.customer,
  );
  db.seedConversation({
    id: input.conversationId,
    workspaceId,
    leadId: input.leadId,
    lastMessageAt: input.lastMessageAt,
  });
  db.addMessage({
    conversationId: input.conversationId,
    workspaceId,
    leadId: input.leadId,
    createdAt: input.lastMessageAt,
    senderKind: input.senderKind ?? "CUSTOMER",
    senderUserId: input.senderUserId ?? CUSTOMER_A,
    body: input.body ?? "hello",
  });
}

async function listAll(db: FakeInboxDb, params?: Partial<AgentInboxListParams>) {
  return listAgentInboxConversations(db, ctx(), allParams(params));
}

async function testAssignedOnly() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_mine",
    conversationId: "conv_mine",
    lastMessageAt: T2,
  });
  seedAssignedThread(db, {
    leadId: "lead_other_agent",
    conversationId: "conv_team",
    lastMessageAt: T3,
    assignedAgentId: AGENT_B,
  });
  const result = await listAll(db);
  assert.deepEqual(
    result.conversations.map((row) => row.conversationId),
    ["conv_mine"],
  );
  assert.equal(result.conversations[0]?.assignment.isAssignedToViewer, true);
  assert.equal(result.conversations[0]?.viewer.canSend, true);
  assert.equal(result.conversations[0]?.viewer.canMarkRead, true);
}

async function testForeignWorkspaceExcluded() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_a",
    conversationId: "conv_a",
    lastMessageAt: T2,
  });
  seedAssignedThread(db, {
    leadId: "lead_b",
    conversationId: "conv_b",
    lastMessageAt: T3,
    workspaceId: WS_B,
    customer: { name: "Same Name", email: "same@test.local", phone: "4165550000" },
  });
  const result = await listAgentInboxConversations(
    db,
    ctx(AGENT_A, WS_A),
    allParams(),
  );
  assert.deepEqual(
    result.conversations.map((row) => row.conversationId),
    ["conv_a"],
  );
}

async function testPondExcluded() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_pond",
    conversationId: "conv_pond",
    lastMessageAt: T4,
    assignedAgentId: null,
  });
  seedAssignedThread(db, {
    leadId: "lead_mine",
    conversationId: "conv_mine",
    lastMessageAt: T1,
  });
  const result = await listAll(db);
  assert.deepEqual(
    result.conversations.map((row) => row.conversationId),
    ["conv_mine"],
  );
}

async function testTeamNotIncludedForCanSeeTeamLeads() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_admin",
    conversationId: "conv_admin",
    lastMessageAt: T5,
  });
  seedAssignedThread(db, {
    leadId: "lead_teammate",
    conversationId: "conv_teammate",
    lastMessageAt: T6,
    assignedAgentId: AGENT_B,
  });
  const result = await listAgentInboxConversations(
    db,
    { ...ctx(), user: { ...ctx().user, role: "ADMIN" } },
    allParams(),
  );
  assert.deepEqual(
    result.conversations.map((row) => row.conversationId),
    ["conv_admin"],
  );
}

async function testEmptyConversationExcluded() {
  const db = new FakeInboxDb();
  db.seedLead(WS_A, "lead_empty", AGENT_A);
  db.seedConversation({
    id: "conv_empty",
    workspaceId: WS_A,
    leadId: "lead_empty",
    lastMessageAt: null,
  });
  seedAssignedThread(db, {
    leadId: "lead_real",
    conversationId: "conv_real",
    lastMessageAt: T1,
  });
  const result = await listAll(db);
  assert.deepEqual(
    result.conversations.map((row) => row.conversationId),
    ["conv_real"],
  );
}

async function testLatestMessageOrdering() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_old",
    conversationId: "conv_old",
    lastMessageAt: T1,
  });
  seedAssignedThread(db, {
    leadId: "lead_new",
    conversationId: "conv_new",
    lastMessageAt: T4,
  });
  seedAssignedThread(db, {
    leadId: "lead_mid",
    conversationId: "conv_mid",
    lastMessageAt: T2,
  });
  const result = await listAll(db);
  assert.deepEqual(
    result.conversations.map((row) => row.conversationId),
    ["conv_new", "conv_mid", "conv_old"],
  );
}

async function testTimestampTieBreaksByIdDesc() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_a",
    conversationId: "conv_tie_a",
    lastMessageAt: T_TIE,
  });
  seedAssignedThread(db, {
    leadId: "lead_b",
    conversationId: "conv_tie_b",
    lastMessageAt: T_TIE,
  });
  const result = await listAll(db);
  assert.deepEqual(
    result.conversations.map((row) => row.conversationId),
    ["conv_tie_b", "conv_tie_a"],
  );
}

async function testCursorPagination() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_1",
    conversationId: "conv_1",
    lastMessageAt: T1,
  });
  seedAssignedThread(db, {
    leadId: "lead_2",
    conversationId: "conv_2",
    lastMessageAt: T2,
  });
  seedAssignedThread(db, {
    leadId: "lead_3",
    conversationId: "conv_3",
    lastMessageAt: T3,
  });
  const first = await listAll(db, { limit: 2 });
  assert.deepEqual(
    first.conversations.map((row) => row.conversationId),
    ["conv_3", "conv_2"],
  );
  assert.equal(first.page.hasMore, true);
  assert.ok(first.page.nextCursor);
  const parsed = parseAgentInboxListParams({
    cursor: first.page.nextCursor,
    limit: 2,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const second = await listAgentInboxConversations(db, ctx(), parsed.value);
  assert.deepEqual(
    second.conversations.map((row) => row.conversationId),
    ["conv_1"],
  );
  assert.equal(second.page.hasMore, false);
}

async function testSearchByNameEmailPhone() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_name",
    conversationId: "conv_name",
    lastMessageAt: T3,
    customer: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "4161111111",
    },
  });
  seedAssignedThread(db, {
    leadId: "lead_email",
    conversationId: "conv_email",
    lastMessageAt: T2,
    customer: {
      name: "Other",
      email: "unique.mail@example.com",
      phone: "4162222222",
    },
  });
  seedAssignedThread(db, {
    leadId: "lead_phone",
    conversationId: "conv_phone",
    lastMessageAt: T1,
    customer: {
      name: "Phone Person",
      email: "phone@example.com",
      phone: "6479990000",
    },
  });

  const byName = await listAll(db, { q: "lovelace" });
  assert.deepEqual(
    byName.conversations.map((row) => row.conversationId),
    ["conv_name"],
  );
  const byEmail = await listAll(db, { q: "unique.mail" });
  assert.deepEqual(
    byEmail.conversations.map((row) => row.conversationId),
    ["conv_email"],
  );
  const byPhone = await listAll(db, { q: "6479990000" });
  assert.deepEqual(
    byPhone.conversations.map((row) => row.conversationId),
    ["conv_phone"],
  );
}

async function testSearchCannotEscapeScope() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_visible",
    conversationId: "conv_visible",
    lastMessageAt: T1,
    customer: { name: "Secret Name", email: "x@test.local", phone: "111" },
  });
  seedAssignedThread(db, {
    leadId: "lead_foreign",
    conversationId: "conv_foreign",
    lastMessageAt: T8,
    workspaceId: WS_B,
    customer: { name: "Secret Name", email: "y@test.local", phone: "111" },
  });
  seedAssignedThread(db, {
    leadId: "lead_team",
    conversationId: "conv_team",
    lastMessageAt: T7,
    assignedAgentId: AGENT_B,
    customer: { name: "Secret Name", email: "z@test.local", phone: "111" },
  });
  seedAssignedThread(db, {
    leadId: "lead_pond",
    conversationId: "conv_pond",
    lastMessageAt: T6,
    assignedAgentId: null,
    customer: { name: "Secret Name", email: "p@test.local", phone: "111" },
  });
  const result = await listAll(db, { q: "Secret Name" });
  assert.deepEqual(
    result.conversations.map((row) => row.conversationId),
    ["conv_visible"],
  );
}

async function testLatestMessageBatchedNotNPlusOne() {
  const db = new FakeInboxDb();
  for (let i = 0; i < 8; i += 1) {
    seedAssignedThread(db, {
      leadId: `lead_${i}`,
      conversationId: `conv_${i}`,
      lastMessageAt: new Date(T1.getTime() + i * 1000),
    });
  }
  await listAll(db);
  assert.equal(db.findLatestMessagesCalls, 1);
  assert.equal(db.countUnreadCalls, 1);
  assert.equal(db.findInboxHeadersCalls, 1);
}

async function unreadEqualsCanonical(
  db: FakeInboxDb,
  leadId: string,
  conversationId: string,
) {
  const listed = await listAll(db);
  const row = listed.conversations.find(
    (item) => item.conversationId === conversationId,
  );
  assert.ok(row, `missing ${conversationId}`);
  const canonical = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId,
  });
  assert.equal(row.unread.count, canonical.agentUnreadCount);
  assert.equal(row.unread.cutoffMode, canonical.agentCutoff.mode);
  assert.equal(row.unread.agentCursorValid, canonical.agentCursorValid);
}

async function testMatchingCursorUnreadMatchesCanonical() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_match",
    conversationId: "conv_match",
    lastMessageAt: T1,
    body: "before",
  });
  const conversation = db.conversations.get(`${WS_A}:lead_match`);
  assert.ok(conversation);
  conversation.agentLastReadAt = T1;
  conversation.agentLastReadByUserId = AGENT_A;
  db.addMessage({
    conversationId: "conv_match",
    createdAt: T_AFTER,
    senderKind: "AGENT",
    senderUserId: AGENT_A,
    senderName: "Agent",
    body: "own send",
  });
  db.addMessage({
    conversationId: "conv_match",
    createdAt: T_LATER,
    senderKind: "CUSTOMER",
    body: "incoming",
  });
  conversation.lastMessageAt = T_LATER;
  await unreadEqualsCanonical(db, "lead_match", "conv_match");
  const row = (await listAll(db)).conversations[0];
  assert.equal(row?.unread.count, 1);
  assert.equal(row?.unread.cutoffMode, "matching");
}

async function testOwnAgentSendsExcluded() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_own",
    conversationId: "conv_own",
    lastMessageAt: T1,
  });
  const conversation = db.conversations.get(`${WS_A}:lead_own`);
  assert.ok(conversation);
  conversation.agentLastReadAt = T1;
  conversation.agentLastReadByUserId = AGENT_A;
  db.addMessage({
    conversationId: "conv_own",
    createdAt: T_AFTER,
    senderKind: "AGENT",
    senderUserId: AGENT_A,
    body: "only me",
  });
  conversation.lastMessageAt = T_AFTER;
  await unreadEqualsCanonical(db, "lead_own", "conv_own");
  assert.equal((await listAll(db)).conversations[0]?.unread.count, 0);
}

async function testDeletedExcludedFromUnread() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_del",
    conversationId: "conv_del",
    lastMessageAt: T1,
  });
  const conversation = db.conversations.get(`${WS_A}:lead_del`);
  assert.ok(conversation);
  conversation.agentLastReadAt = T1;
  conversation.agentLastReadByUserId = AGENT_A;
  db.addMessage({
    conversationId: "conv_del",
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    body: "gone",
    deletedAt: T_LATER,
  });
  db.addMessage({
    conversationId: "conv_del",
    createdAt: T_LATER,
    senderKind: "CUSTOMER",
    body: "kept",
  });
  conversation.lastMessageAt = T_LATER;
  await unreadEqualsCanonical(db, "lead_del", "conv_del");
  assert.equal((await listAll(db)).conversations[0]?.unread.count, 1);
}

async function testAssignmentCardFallback() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_card",
    conversationId: "conv_card",
    lastMessageAt: T_LATER,
  });
  const conversation = db.conversations.get(`${WS_A}:lead_card`);
  assert.ok(conversation);
  conversation.agentLastReadByUserId = AGENT_B;
  conversation.agentLastReadAt = T0;
  db.addMessage({
    conversationId: "conv_card",
    createdAt: T1,
    senderKind: "CUSTOMER",
    body: "old history",
  });
  db.addMessage({
    conversationId: "conv_card",
    createdAt: T_CARD,
    senderKind: "SYSTEM",
    senderName: "Houzzat",
    kind: "SYSTEM_CARD",
    body: null,
    payload: { card: "REASSIGNED" },
  });
  db.addMessage({
    conversationId: "conv_card",
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    body: "after card",
  });
  await unreadEqualsCanonical(db, "lead_card", "conv_card");
  assert.equal(
    (await listAll(db)).conversations[0]?.unread.cutoffMode,
    "assignment_card",
  );
}

async function testAssignmentActivityFallback() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_act",
    conversationId: "conv_act",
    lastMessageAt: T_AFTER,
  });
  const conversation = db.conversations.get(`${WS_A}:lead_act`);
  assert.ok(conversation);
  conversation.agentLastReadByUserId = AGENT_B;
  conversation.agentLastReadAt = T0;
  db.addMessage({
    conversationId: "conv_act",
    createdAt: T0,
    senderKind: "CUSTOMER",
    body: "ancient",
  });
  db.seedActivity({
    leadId: "lead_act",
    type: "reassigned",
    createdAt: T_ASSIGN,
  });
  db.addMessage({
    conversationId: "conv_act",
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    body: "after activity",
  });
  await unreadEqualsCanonical(db, "lead_act", "conv_act");
  assert.equal(
    (await listAll(db)).conversations[0]?.unread.cutoffMode,
    "assignment_activity",
  );
}

async function testConservativeUnanchoredFallback() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_un",
    conversationId: "conv_un",
    lastMessageAt: T_AFTER,
  });
  const conversation = db.conversations.get(`${WS_A}:lead_un`);
  assert.ok(conversation);
  conversation.agentLastReadByUserId = AGENT_B;
  conversation.agentLastReadAt = T0;
  db.addMessage({
    conversationId: "conv_un",
    createdAt: T0,
    senderKind: "CUSTOMER",
    body: "history",
  });
  db.addMessage({
    conversationId: "conv_un",
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    body: "also unread",
  });
  await unreadEqualsCanonical(db, "lead_un", "conv_un");
  assert.equal(
    (await listAll(db)).conversations[0]?.unread.cutoffMode,
    "conservative_unanchored",
  );
}

async function testUnrelatedLeadUpdateDoesNotChangeUnread() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_upd",
    conversationId: "conv_upd",
    lastMessageAt: T1,
  });
  const conversation = db.conversations.get(`${WS_A}:lead_upd`);
  assert.ok(conversation);
  conversation.agentLastReadAt = T1;
  conversation.agentLastReadByUserId = AGENT_A;
  db.addMessage({
    conversationId: "conv_upd",
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    body: "incoming",
  });
  conversation.lastMessageAt = T_AFTER;
  const before = await listAll(db);
  db.bumpLeadUpdatedAt(WS_A, "lead_upd", T_LATER);
  db.seedActivity({
    leadId: "lead_upd",
    type: "note",
    createdAt: T_LATER,
  });
  const after = await listAll(db);
  assert.equal(before.conversations[0]?.unread.count, 1);
  assert.equal(after.conversations[0]?.unread.count, 1);
  await unreadEqualsCanonical(db, "lead_upd", "conv_upd");
}

async function testUnreadFilterFillsPageNotFirstAllSlice() {
  const db = new FakeInboxDb();
  const newest = [T8, T7, T6, T5, T4];
  newest.forEach((time, index) => {
    const id = `conv_read_${index}`;
    seedAssignedThread(db, {
      leadId: `lead_read_${index}`,
      conversationId: id,
      lastMessageAt: time,
    });
    const conversation = db.conversations.get(`${WS_A}:lead_read_${index}`);
    assert.ok(conversation);
    conversation.agentLastReadAt = time;
    conversation.agentLastReadByUserId = AGENT_A;
  });
  const unreadTimes = [T3, T2, T1];
  unreadTimes.forEach((time, index) => {
    seedAssignedThread(db, {
      leadId: `lead_unread_${index}`,
      conversationId: `conv_unread_${index}`,
      lastMessageAt: time,
      body: "still unread",
    });
  });

  const first = await listAll(db, { filter: "unread", limit: 2 });
  assert.deepEqual(
    first.conversations.map((row) => row.conversationId),
    ["conv_unread_0", "conv_unread_1"],
  );
  assert.equal(first.page.hasMore, true);
  const parsed = parseAgentInboxListParams({
    filter: "unread",
    limit: 2,
    cursor: first.page.nextCursor,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const second = await listAgentInboxConversations(db, ctx(), parsed.value);
  assert.deepEqual(
    second.conversations.map((row) => row.conversationId),
    ["conv_unread_2"],
  );
  assert.equal(second.page.hasMore, false);

  const naiveAll = await listAll(db, { limit: 2 });
  assert.deepEqual(
    naiveAll.conversations.map((row) => row.conversationId),
    ["conv_read_0", "conv_read_1"],
  );
}

async function testDeletedLatestPreviewDoesNotLeakBody() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_tomb",
    conversationId: "conv_tomb",
    lastMessageAt: T2,
    body: "SECRET BODY",
  });
  const latest = db.addMessage({
    conversationId: "conv_tomb",
    createdAt: T3,
    senderKind: "CUSTOMER",
    body: "SECRET BODY",
    deletedAt: T3,
  });
  const conversation = db.conversations.get(`${WS_A}:lead_tomb`);
  assert.ok(conversation);
  conversation.lastMessageAt = T3;
  const result = await listAll(db);
  assert.equal(result.conversations[0]?.latestMessage?.id, latest.id);
  assert.equal(
    result.conversations[0]?.latestMessage?.preview,
    V2_CHAT_DELETED_TOMBSTONE,
  );
  assert.ok(!result.conversations[0]?.latestMessage?.preview.includes("SECRET"));
}

async function testSystemCardPreviewNotRawPayload() {
  const db = new FakeInboxDb();
  db.seedLead(WS_A, "lead_card_prev", AGENT_A);
  db.seedConversation({
    id: "conv_card_prev",
    workspaceId: WS_A,
    leadId: "lead_card_prev",
    lastMessageAt: T_CARD,
  });
  db.addMessage({
    conversationId: "conv_card_prev",
    createdAt: T_CARD,
    senderKind: "SYSTEM",
    senderName: "Houzzat",
    kind: "SYSTEM_CARD",
    body: null,
    payload: { card: "ASSIGNED", internal: "do-not-leak" },
  });
  const result = await listAll(db);
  assert.equal(result.conversations[0]?.latestMessage?.preview, "Assigned");
  assert.ok(
    !JSON.stringify(result.conversations[0]?.latestMessage).includes(
      "do-not-leak",
    ),
  );
}

async function testNoSideEffects() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_ro",
    conversationId: "conv_ro",
    lastMessageAt: T1,
  });
  await listAll(db);
  await listAll(db, { filter: "unread" });
  assert.equal(db.conversationCreates, 0);
  assert.equal(db.conversationUpdates, 0);
  assert.equal(db.messageCreates, 0);
}

async function testMissingWorkspaceReturnsEmpty() {
  const db = new FakeInboxDb();
  seedAssignedThread(db, {
    leadId: "lead_x",
    conversationId: "conv_x",
    lastMessageAt: T1,
  });
  const result = await listAgentInboxConversations(
    db,
    ctx(AGENT_A, null),
    allParams(),
  );
  assert.equal(result.conversations.length, 0);
  assert.equal(db.findInboxHeadersCalls, 0);
}

async function testParseParams() {
  const ok = parseAgentInboxListParams({
    q: "  ada  ",
    filter: "unread",
    limit: "80",
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.value.q, "ada");
  assert.equal(ok.value.filter, "unread");
  assert.equal(ok.value.limit, AGENT_INBOX_PAGE_MAX);
  const badFilter = parseAgentInboxListParams({ filter: "starred" });
  assert.equal(badFilter.ok, false);
  const badCursor = parseAgentInboxListParams({ cursor: "not-a-cursor" });
  assert.equal(badCursor.ok, false);
  const defaulted = parseAgentInboxListParams({});
  assert.equal(defaulted.ok, true);
  if (!defaulted.ok) return;
  assert.equal(defaulted.value.filter, "all");
  assert.equal(defaulted.value.limit, AGENT_INBOX_PAGE_SIZE);
}

async function testPreviewHelpers() {
  assert.equal(
    inboxLatestMessagePreview({
      kind: "TEXT",
      body: "SECRET",
      deletedAt: T1,
      payload: null,
    }),
    V2_CHAT_DELETED_TOMBSTONE,
  );
  assert.equal(
    inboxLatestMessagePreview({
      kind: "SYSTEM_CARD",
      body: null,
      deletedAt: null,
      payload: { card: "VIEWING_CONFIRMED" },
    }),
    "Viewing confirmed",
  );
}

async function testUnreadBatchingOnInvalidCursors() {
  const db = new FakeInboxDb();
  for (let i = 0; i < 4; i += 1) {
    seedAssignedThread(db, {
      leadId: `lead_inv_${i}`,
      conversationId: `conv_inv_${i}`,
      lastMessageAt: new Date(T2.getTime() + i * 1000),
    });
    const conversation = db.conversations.get(`${WS_A}:lead_inv_${i}`);
    assert.ok(conversation);
    conversation.agentLastReadByUserId = AGENT_B;
  }
  await listAll(db);
  assert.equal(db.findLatestAssignmentCardsCalls, 1);
  assert.equal(db.findLatestAssignmentActivitiesCalls, 1);
  assert.equal(db.countUnreadCalls, 1);
}

async function testSourceContract() {
  const src = read("src/lib/conversations/agent-inbox-list.ts");
  assert.ok(!src.includes("leadScopeWhere"));
  assert.ok(!src.includes("getConversationUnreadState"));
  assert.ok(!src.includes("getOrCreateLeadConversation"));
  assert.ok(!src.includes("markConversationReadByAgent"));
  assert.ok(!src.includes("createConversationMessage"));
  assert.ok(!src.includes("filter=starred"));
  assert.ok(src.includes("assignedAgentId: input.assignedAgentId"));
  assert.ok(src.includes("lastMessageAt: { not: null }"));
  assert.ok(src.includes("DISTINCT ON"));
}

async function testNotDuplicatedInNativeShell() {
  const instant = read("src/components/agent/AgentMobileInstantShell.tsx");
  assert.ok(!instant.includes("AgentChatsInbox"));
  assert.ok(!instant.includes("useAgentChatThread"));
  assert.ok(!instant.includes("/agent/chats"));
}

async function main() {
  await testAssignedOnly();
  await testForeignWorkspaceExcluded();
  await testPondExcluded();
  await testTeamNotIncludedForCanSeeTeamLeads();
  await testEmptyConversationExcluded();
  await testLatestMessageOrdering();
  await testTimestampTieBreaksByIdDesc();
  await testCursorPagination();
  await testSearchByNameEmailPhone();
  await testSearchCannotEscapeScope();
  await testLatestMessageBatchedNotNPlusOne();
  await testMatchingCursorUnreadMatchesCanonical();
  await testOwnAgentSendsExcluded();
  await testDeletedExcludedFromUnread();
  await testAssignmentCardFallback();
  await testAssignmentActivityFallback();
  await testConservativeUnanchoredFallback();
  await testUnrelatedLeadUpdateDoesNotChangeUnread();
  await testUnreadFilterFillsPageNotFirstAllSlice();
  await testDeletedLatestPreviewDoesNotLeakBody();
  await testSystemCardPreviewNotRawPayload();
  await testNoSideEffects();
  await testMissingWorkspaceReturnsEmpty();
  await testParseParams();
  await testPreviewHelpers();
  await testUnreadBatchingOnInvalidCursors();
  await testSourceContract();
  await testNotDuplicatedInNativeShell();
  console.log("agent-inbox-list:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
