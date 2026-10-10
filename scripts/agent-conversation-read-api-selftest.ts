/**
 * Agent Conversation open/read + mark-read API — in-memory selftest.
 * Does not connect to production. Does not create production rows.
 * Run: pnpm agent-conversation-read-api:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ConversationStatus,
  MessageChannel,
  MessageKind,
  MessageSenderKind,
  OrgMembershipRole,
  Role,
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceStatus,
} from "@prisma/client";
import type { AgentOrgContext } from "../src/lib/agent";
import {
  AGENT_CONVERSATION_MESSAGE_SELECT,
  AGENT_CONVERSATION_PAGE_MAX,
  AGENT_CONVERSATION_PAGE_SIZE,
  markAgentLeadConversationRead,
  openAgentLeadConversation,
  parseAgentConversationPageParams,
  parseTranscriptCursor,
  type AgentConversationReadDb,
  type AgentConversationMessageRow,
} from "../src/lib/conversations/agent-conversation-read";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import { getConversationUnreadState } from "../src/lib/conversations/read-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const ORG_A = "org_a";
const ORG_B = "org_b";
const LEAD_A = "lead_in_workspace_a";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const ADMIN_A = "user_admin_a";
const CUSTOMER_A = "user_customer_a";

const T0 = new Date("2026-09-01T00:00:00.000Z");
const T1 = new Date("2026-09-02T00:00:00.000Z");
const T2 = new Date("2026-09-03T00:00:00.000Z");
const T3 = new Date("2026-09-04T00:00:00.000Z");
const T4 = new Date("2026-09-05T00:00:00.000Z");
const T_TIE = new Date("2026-09-10T12:00:00.000Z");

type FakeLead = {
  id: string;
  workspaceId: string;
  organizationId: string | null;
  assignedAgentId: string | null;
};

type FakeMessage = AgentConversationMessageRow & {
  workspaceId: string;
  conversationId: string;
  leadId: string;
  twilioMessageSid: string | null;
  smsFrom: string | null;
  smsTo: string | null;
};

function uniqueError(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function withWorkspaceRead<T>(fn: () => Promise<T> | T): Promise<T> {
  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  return Promise.resolve(fn()).finally(() => {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  });
}

function makeCtx(
  overrides: Partial<AgentOrgContext> & { userId?: string } = {},
): AgentOrgContext {
  const { userId, user, ...rest } = overrides;
  return {
    user: {
      id: userId ?? AGENT_A,
      email: "agent@test.local",
      name: "Agent",
      image: null,
      phone: null,
      role: "AGENT" as Role,
      ...user,
    },
    organizationId: ORG_A,
    organizationName: "Tenant A",
    organizationIds: [ORG_A],
    membershipRole: "MEMBER" as OrgMembershipRole,
    canSeeTeamLeads: false,
    isPlatformAdmin: false,
    workspaceId: WS_A,
    workspaceRole: "AGENT" as WorkspaceMemberRole,
    workspaceMemberStatus: "ACTIVE" as WorkspaceMemberStatus,
    workspaceStatus: "ACTIVE" as WorkspaceStatus,
    workspaceName: "Tenant A",
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: false,
    readScope: "workspace",
    ...rest,
  };
}

class FakeApiDb implements AgentConversationReadDb {
  leads = new Map<string, FakeLead>();
  conversations = new Map<string, LeadConversationRecord>();
  messages: FakeMessage[] = [];
  activities: Array<{
    id: string;
    leadId: string;
    type: string;
    createdAt: Date;
  }> = [];
  conversationCreates = 0;
  conversationUpdates = 0;
  messageCreates = 0;
  leadActivityCreates = 0;
  notificationSends = 0;
  emailSends = 0;
  leadMutations = 0;
  nextConversationId = 1;
  nextMessageId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedLead(input: FakeLead) {
    this.leads.set(this.leadKey(input.workspaceId, input.id), input);
  }

  seedConversation(
    overrides: Partial<LeadConversationRecord> &
      Pick<LeadConversationRecord, "id" | "workspaceId" | "leadId">,
  ) {
    const row: LeadConversationRecord = {
      status: "OPEN" as ConversationStatus,
      createdAt: T0,
      updatedAt: T0,
      lastMessageAt: null,
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
    editedAt?: Date | null;
    kind?: MessageKind;
    channel?: MessageChannel;
    payload?: AgentConversationMessageRow["payload"];
    providerStatus?: string | null;
    deliveredAt?: Date | null;
    smsSource?: FakeMessage["smsSource"];
    twilioMessageSid?: string | null;
    replyToMessageId?: string | null;
    id?: string;
  }) {
    const row: FakeMessage = {
      id: input.id ?? `msg_${this.nextMessageId++}`,
      workspaceId: input.workspaceId ?? WS_A,
      conversationId: input.conversationId,
      leadId: input.leadId ?? LEAD_A,
      channel: input.channel ?? ("CHAT" as MessageChannel),
      kind: input.kind ?? ("TEXT" as MessageKind),
      senderKind: input.senderKind,
      senderUserId: input.senderUserId ?? null,
      senderName: input.senderName ?? "Sender",
      body: input.body ?? "hello",
      editedAt: input.editedAt ?? null,
      deletedAt: input.deletedAt ?? null,
      replyToMessageId: input.replyToMessageId ?? null,
      createdAt: input.createdAt,
      deliveredAt: input.deliveredAt ?? null,
      smsSource: input.smsSource ?? null,
      providerStatus: input.providerStatus ?? null,
      payload: input.payload ?? null,
      twilioMessageSid: input.twilioMessageSid ?? null,
      smsFrom: null,
      smsTo: null,
    };
    this.messages.push(row);
    this.messageCreates += 1;
    return row;
  }

  lead: AgentConversationReadDb["lead"] = {
    findUnique: async ({ where }) => {
      const pair = where.workspaceId_id;
      if (pair) {
        return this.leads.get(this.leadKey(pair.workspaceId, pair.id)) ?? null;
      }
      if (where.id) {
        return (
          [...this.leads.values()].find((row) => row.id === where.id) ?? null
        );
      }
      return null;
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
    create: async ({
      data,
    }: {
      data: { workspaceId: string; leadId: string; status: ConversationStatus };
    }) => {
      const key = this.leadKey(data.workspaceId, data.leadId);
      this.conversationCreates += 1;
      if (this.conversations.has(key)) throw uniqueError();
      const now = new Date("2026-09-17T18:00:00.000Z");
      const row: LeadConversationRecord = {
        id: `conv_${this.nextConversationId++}`,
        workspaceId: data.workspaceId,
        leadId: data.leadId,
        status: data.status,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
        customerLastReadAt: null,
        agentLastReadAt: null,
        agentLastReadByUserId: null,
      };
      this.conversations.set(key, row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { workspaceId_id?: { workspaceId: string; id: string } };
      data: Partial<LeadConversationRecord>;
    }) => {
      const pair = where.workspaceId_id;
      if (!pair) throw new Error("workspaceId_id required");
      const row = [...this.conversations.values()].find(
        (item) =>
          item.workspaceId === pair.workspaceId && item.id === pair.id,
      );
      if (!row) throw new Error("missing conversation");
      this.conversationUpdates += 1;
      Object.assign(row, data);
      this.conversations.set(this.leadKey(row.workspaceId, row.leadId), row);
      return { ...row };
    },
  };

  message = {
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: {
        workspaceId?: string;
        conversationId?: string;
        OR?: Array<{
          createdAt?: Date | { lt?: Date };
          id?: { lt?: string };
        }>;
      };
      orderBy?:
        | { createdAt?: "asc" | "desc" }
        | Array<{ createdAt?: "asc" | "desc"; id?: "asc" | "desc" }>;
      take?: number;
    }) => {
      let rows = this.messages.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.conversationId === where.conversationId,
      );
      if (where.OR) {
        rows = rows.filter((row) =>
          where.OR!.some((clause) => {
            if (
              clause.createdAt &&
              typeof clause.createdAt === "object" &&
              "lt" in clause.createdAt &&
              clause.createdAt.lt
            ) {
              return row.createdAt.getTime() < clause.createdAt.lt.getTime();
            }
            if (
              clause.createdAt instanceof Date &&
              clause.id &&
              typeof clause.id === "object" &&
              "lt" in clause.id &&
              clause.id.lt
            ) {
              return (
                row.createdAt.getTime() === clause.createdAt.getTime() &&
                row.id < clause.id.lt
              );
            }
            return false;
          }),
        );
      }
      const specs = Array.isArray(orderBy) ? orderBy : [orderBy ?? { createdAt: "asc" as const }];
      rows.sort((a, b) => {
        for (const spec of specs) {
          if (!spec) continue;
          if (spec.createdAt) {
            const delta = a.createdAt.getTime() - b.createdAt.getTime();
            if (delta !== 0) {
              return spec.createdAt === "desc" ? -delta : delta;
            }
          }
          if (spec.id) {
            if (a.id < b.id) return spec.id === "desc" ? 1 : -1;
            if (a.id > b.id) return spec.id === "desc" ? -1 : 1;
          }
        }
        return 0;
      });
      if (typeof take === "number") rows = rows.slice(0, take);
      return rows;
    },
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { workspaceId?: string; conversationId?: string };
      orderBy?: { createdAt?: "asc" | "desc" };
    }) => {
      const rows = await this.message.findMany({ where, orderBy });
      return rows[0] ?? null;
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

function baseLeadDb(assignedAgentId: string | null = AGENT_A) {
  const db = new FakeApiDb();
  db.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    organizationId: ORG_A,
    assignedAgentId,
  });
  return db;
}

function testPageParamParsing() {
  const ok = parseAgentConversationPageParams(
    new URL("https://x.local/api/agent/leads/lead/conversation"),
  );
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.value.limit, AGENT_CONVERSATION_PAGE_SIZE);
  assert.equal(ok.value.cursor, null);

  const limited = parseAgentConversationPageParams(
    new URL("https://x.local/api/agent/leads/lead/conversation?limit=999"),
  );
  assert.equal(limited.ok, true);
  if (limited.ok) assert.equal(limited.value.limit, AGENT_CONVERSATION_PAGE_MAX);

  const invalid = parseAgentConversationPageParams(
    new URL("https://x.local/api/agent/leads/lead/conversation?cursor=nope"),
  );
  assert.equal(invalid.ok, false);
}

async function testAssignedAgentCanRetrieve() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    db.addMessage({
      conversationId: conversation.id,
      createdAt: T1,
      senderKind: "CUSTOMER",
      senderUserId: CUSTOMER_A,
      body: "hi",
    });
    const data = await openAgentLeadConversation(
      db,
      makeCtx(),
      LEAD_A,
      { limit: 40, cursor: null },
    );
    assert.ok(data);
    assert.equal(data?.conversation.id, "conv_a");
    assert.equal(data?.conversation.created, false);
    assert.equal(data?.assignedAgentId, AGENT_A);
    assert.equal(data?.viewer.canMarkRead, true);
    assert.equal(data?.messages.length, 1);
    assert.equal(data?.messages[0]?.body, "hi");
  });
}

async function testAdminCanView() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb(AGENT_A);
    db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    const data = await openAgentLeadConversation(
      db,
      makeCtx({
        userId: ADMIN_A,
        canSeeTeamLeads: true,
        isPlatformAdmin: true,
        user: {
          id: ADMIN_A,
          email: "admin@test.local",
          name: "Admin",
          image: null,
          phone: null,
          role: "ADMIN" as Role,
        },
      }),
      LEAD_A,
      { limit: 40, cursor: null },
    );
    assert.ok(data);
    assert.equal(data?.viewer.canMarkRead, false);
    assert.equal(data?.viewer.isAssignedAgent, false);
  });
}

async function testForeignWorkspaceCannotRetrieve() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    const data = await openAgentLeadConversation(
      db,
      makeCtx({
        workspaceId: WS_B,
        organizationId: ORG_B,
        organizationIds: [ORG_B],
      }),
      LEAD_A,
      { limit: 40, cursor: null },
    );
    assert.equal(data, null);
  });
}

async function testUnauthorizedAgentCannotRetrieve() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb(AGENT_A);
    db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    const data = await openAgentLeadConversation(
      db,
      makeCtx({ userId: AGENT_B }),
      LEAD_A,
      { limit: 40, cursor: null },
    );
    assert.equal(data, null);
  });
}

async function testLazyCreatesConversationWithoutMessage() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    const beforeMessages = db.messageCreates;
    const data = await openAgentLeadConversation(
      db,
      makeCtx(),
      LEAD_A,
      { limit: 40, cursor: null },
    );
    assert.ok(data);
    assert.equal(data?.conversation.created, true);
    assert.equal(db.conversationCreates, 1);
    assert.equal(db.messageCreates, beforeMessages);
    assert.equal(data?.messages.length, 0);
  });
}

async function testGetDoesNotMarkRead() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
      agentLastReadAt: null,
      agentLastReadByUserId: null,
    });
    db.addMessage({
      conversationId: conversation.id,
      createdAt: T2,
      senderKind: "CUSTOMER",
      senderUserId: CUSTOMER_A,
    });
    const data = await openAgentLeadConversation(
      db,
      makeCtx(),
      LEAD_A,
      { limit: 40, cursor: null },
    );
    assert.ok(data);
    assert.equal(data?.unread.count, 1);
    assert.equal(conversation.agentLastReadAt, null);
    assert.equal(conversation.agentLastReadByUserId, null);
    assert.equal(db.conversationUpdates, 0);
  });
}

async function testChronologicalOrdering() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    db.addMessage({
      conversationId: conversation.id,
      createdAt: T2,
      senderKind: "CUSTOMER",
      id: "later",
    });
    db.addMessage({
      conversationId: conversation.id,
      createdAt: T0,
      senderKind: "CUSTOMER",
      id: "earliest",
    });
    db.addMessage({
      conversationId: conversation.id,
      createdAt: T1,
      senderKind: "CUSTOMER",
      id: "middle",
    });
    const data = await openAgentLeadConversation(
      db,
      makeCtx(),
      LEAD_A,
      { limit: 40, cursor: null },
    );
    assert.deepEqual(
      data?.messages.map((row) => row.id),
      ["earliest", "middle", "later"],
    );
  });
}

async function testLatestPageAndOlderCursor() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    for (const [id, createdAt] of [
      ["m0", T0],
      ["m1", T1],
      ["m2", T2],
      ["m3", T3],
      ["m4", T4],
    ] as const) {
      db.addMessage({
        conversationId: conversation.id,
        createdAt,
        senderKind: "CUSTOMER",
        id,
      });
    }
    const latest = await openAgentLeadConversation(
      db,
      makeCtx(),
      LEAD_A,
      { limit: 3, cursor: null },
    );
    assert.deepEqual(
      latest?.messages.map((row) => row.id),
      ["m2", "m3", "m4"],
    );
    assert.equal(latest?.page.hasMore, true);
    assert.ok(latest?.page.nextCursor);
    const olderCursor = parseTranscriptCursor(latest!.page.nextCursor!);
    assert.ok(olderCursor);
    const older = await openAgentLeadConversation(db, makeCtx(), LEAD_A, {
      limit: 3,
      cursor: olderCursor,
    });
    assert.deepEqual(
      older?.messages.map((row) => row.id),
      ["m0", "m1"],
    );
    assert.equal(older?.page.hasMore, false);
    assert.equal(older?.page.nextCursor, null);
  });
}

async function testTimestampTieOrderingIsStable() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    db.addMessage({
      conversationId: conversation.id,
      createdAt: T_TIE,
      senderKind: "CUSTOMER",
      id: "tie_a",
    });
    db.addMessage({
      conversationId: conversation.id,
      createdAt: T_TIE,
      senderKind: "CUSTOMER",
      id: "tie_b",
    });
    const latest = await openAgentLeadConversation(
      db,
      makeCtx(),
      LEAD_A,
      { limit: 1, cursor: null },
    );
    assert.deepEqual(
      latest?.messages.map((row) => row.id),
      ["tie_b"],
    );
    const parsed = parseTranscriptCursor(latest!.page.nextCursor!);
    assert.ok(parsed);
    const older = await openAgentLeadConversation(
      db,
      makeCtx(),
      LEAD_A,
      { limit: 1, cursor: parsed },
    );
    assert.deepEqual(
      older?.messages.map((row) => row.id),
      ["tie_a"],
    );
  });
}

async function testDeletedBodyNotLeaked() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    db.addMessage({
      conversationId: conversation.id,
      createdAt: T1,
      senderKind: "CUSTOMER",
      body: "SECRET_DELETED_BODY",
      deletedAt: T2,
      payload: { secret: "SECRET_DELETED_PAYLOAD" },
    });
    const data = await openAgentLeadConversation(
      db,
      makeCtx(),
      LEAD_A,
      { limit: 40, cursor: null },
    );
    const serialized = JSON.stringify(data);
    assert.equal(serialized.includes("SECRET_DELETED_BODY"), false);
    assert.equal(serialized.includes("SECRET_DELETED_PAYLOAD"), false);
    assert.equal(data?.messages[0]?.body, null);
    assert.equal(data?.messages[0]?.payload, null);
    assert.ok(data?.messages[0]?.deletedAt);
  });
}

async function testUnreadComesFromCanonicalService() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
      agentLastReadAt: T0,
      agentLastReadByUserId: AGENT_A,
    });
    db.addMessage({
      conversationId: conversation.id,
      createdAt: T0,
      senderKind: "CUSTOMER",
    });
    const newer = db.addMessage({
      conversationId: conversation.id,
      createdAt: T2,
      senderKind: "CUSTOMER",
    });
    const canonical = await getConversationUnreadState(db, {
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    const data = await openAgentLeadConversation(
      db,
      makeCtx(),
      LEAD_A,
      { limit: 40, cursor: null },
    );
    assert.equal(data?.unread.count, canonical.agentUnreadCount);
    assert.equal(data?.unread.dividerMessageId, canonical.agentDividerMessageId);
    assert.equal(data?.unread.cutoffMode, canonical.agentCutoff.mode);
    assert.equal(data?.unread.agentCursorValid, canonical.agentCursorValid);
    assert.equal(data?.unread.dividerMessageId, newer.id);
    assert.equal("customerUnreadCount" in (data ?? {}), false);
    // customerLastReadAt is exposed for agent-side Read receipts on own messages.
    assert.equal("customerLastReadAt" in (data?.conversation ?? {}), true);
    assert.equal(data?.conversation.customerLastReadAt ?? null, null);
  });
}

async function testCurrentAgentCanMarkRead() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    const latest = db.addMessage({
      conversationId: conversation.id,
      createdAt: T2,
      senderKind: "CUSTOMER",
    });
    const result = await markAgentLeadConversationRead(db, makeCtx(), LEAD_A);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.conversation.agentLastReadByUserId, AGENT_A);
    assert.equal(
      result.data.conversation.agentLastReadAt,
      latest.createdAt.toISOString(),
    );
    assert.equal(result.data.unread.count, 0);
    assert.equal(latest.twilioMessageSid, null);
  });
}

async function testAdminViewDoesNotMarkRead() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb(AGENT_A);
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
      agentLastReadAt: T0,
      agentLastReadByUserId: AGENT_A,
    });
    const admin = makeCtx({
      userId: ADMIN_A,
      canSeeTeamLeads: true,
      isPlatformAdmin: true,
      user: {
        id: ADMIN_A,
        email: "admin@test.local",
        name: "Admin",
        image: null,
        phone: null,
        role: "ADMIN" as Role,
      },
    });
    const viewed = await openAgentLeadConversation(db, admin, LEAD_A, {
      limit: 40,
      cursor: null,
    });
    assert.ok(viewed);
    const marked = await markAgentLeadConversationRead(db, admin, LEAD_A);
    assert.equal(marked.ok, false);
    if (!marked.ok) assert.equal(marked.reason, "FORBIDDEN");
    assert.deepEqual(conversation.agentLastReadAt, T0);
    assert.equal(conversation.agentLastReadByUserId, AGENT_A);
  });
}

async function testWrongAgentCannotMarkRead() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb(AGENT_A);
    db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    const unmarked = await markAgentLeadConversationRead(
      db,
      makeCtx({ userId: AGENT_B }),
      LEAD_A,
    );
    assert.equal(unmarked.ok, false);
    if (!unmarked.ok) assert.equal(unmarked.reason, "LEAD_NOT_FOUND");

    const former = await markAgentLeadConversationRead(
      db,
      makeCtx({
        userId: AGENT_B,
        canSeeTeamLeads: true,
      }),
      LEAD_A,
    );
    assert.equal(former.ok, false);
    if (!former.ok) assert.equal(former.reason, "FORBIDDEN");
  });
}

async function testForeignWorkspaceCannotMarkRead() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    const result = await markAgentLeadConversationRead(
      db,
      makeCtx({
        workspaceId: WS_B,
        organizationId: ORG_B,
        organizationIds: [ORG_B],
      }),
      LEAD_A,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "LEAD_NOT_FOUND");
    assert.equal(db.conversationUpdates, 0);
  });
}

async function testNoSideEffectsBeyondConversationCreate() {
  await withWorkspaceRead(async () => {
    const db = baseLeadDb();
    await openAgentLeadConversation(db, makeCtx(), LEAD_A, {
      limit: 40,
      cursor: null,
    });
    assert.equal(db.leadActivityCreates, 0);
    assert.equal(db.notificationSends, 0);
    assert.equal(db.emailSends, 0);
    assert.equal(db.leadMutations, 0);
    assert.equal(db.messageCreates, 0);
    assert.equal(db.conversationUpdates, 0);
  });
}

function testRouteSourceContract() {
  const getRoute = read("src/app/api/agent/leads/[id]/conversation/route.ts");
  const readRoute = read(
    "src/app/api/agent/leads/[id]/conversation/read/route.ts",
  );
  const service = read("src/lib/conversations/agent-conversation-read.ts");

  assert.ok(getRoute.includes("requireAgentContextFromRequest(request"));
  assert.ok(getRoute.includes("sideEffects: false"));
  assert.ok(getRoute.includes("openAgentLeadConversation"));
  assert.ok(!getRoute.includes("markConversationReadByAgent"));
  assert.ok(!getRoute.includes("markAgentLeadConversationRead"));
  assert.ok(!getRoute.includes("createConversationMessage"));
  assert.ok(!getRoute.includes("searchParams.get(\"workspace"));
  assert.ok(!getRoute.includes("leadActivity"));

  assert.ok(readRoute.includes("requireAgentContextFromRequest(request)"));
  assert.ok(readRoute.includes("markAgentLeadConversationRead"));
  assert.ok(!readRoute.includes("openAgentLeadConversation"));
  assert.ok(!readRoute.includes("searchParams.get(\"workspace"));

  assert.ok(service.includes("canAccessLead"));
  assert.ok(service.includes("getOrCreateLeadConversation"));
  assert.ok(service.includes("getConversationUnreadState"));
  assert.ok(service.includes("markConversationReadByAgent"));
  // Peer customer cursor is returned for Sent/Read labels; unread counts stay agent-side.
  assert.ok(service.includes("customerLastReadAt"));
  assert.ok(!service.includes("customerUnreadCount"));
  assert.ok(!service.includes("twilioMessageSid"));
  assert.ok(!service.includes("smsFrom"));
  assert.ok(!("twilioMessageSid" in AGENT_CONVERSATION_MESSAGE_SELECT));
  assert.ok(!("createdByUserId" in AGENT_CONVERSATION_MESSAGE_SELECT));
  assert.ok(!("deletedByUserId" in AGENT_CONVERSATION_MESSAGE_SELECT));

  const v2Emails = read("src/app/api/agent/leads-v2/[id]/emails/route.ts");
  assert.ok(!v2Emails.includes("openAgentLeadConversation"));
  const v2Shell = read("src/app/api/agent/leads-v2/[id]/shell/route.ts");
  assert.ok(!v2Shell.includes("openAgentLeadConversation"));
}

async function main() {
  testPageParamParsing();
  await testAssignedAgentCanRetrieve();
  await testAdminCanView();
  await testForeignWorkspaceCannotRetrieve();
  await testUnauthorizedAgentCannotRetrieve();
  await testLazyCreatesConversationWithoutMessage();
  await testGetDoesNotMarkRead();
  await testChronologicalOrdering();
  await testLatestPageAndOlderCursor();
  await testTimestampTieOrderingIsStable();
  await testDeletedBodyNotLeaked();
  await testUnreadComesFromCanonicalService();
  await testCurrentAgentCanMarkRead();
  await testAdminViewDoesNotMarkRead();
  await testWrongAgentCannotMarkRead();
  await testForeignWorkspaceCannotMarkRead();
  await testNoSideEffectsBeyondConversationCreate();
  testRouteSourceContract();
  console.log("agent-conversation-read-api:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
