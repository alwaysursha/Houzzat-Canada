/**
 * Agent Chats Inbox GET /api/agent/conversations — in-memory selftest.
 * Does not connect to production. Does not create production rows.
 * Run: pnpm agent-inbox-api:selftest
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
  countUnreadFromMessageRows,
  getAgentInboxListResponse,
  type AgentInboxHeader,
  type AgentInboxLatestMessageRow,
  type AgentInboxListDb,
  type AgentInboxListResult,
} from "../src/lib/conversations/agent-inbox-list";
import type { ConversationReadMessage } from "../src/lib/conversations/read-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const CUSTOMER_A = "user_customer_a";

const T1 = new Date("2026-09-02T00:00:00.000Z");
const T2 = new Date("2026-09-03T00:00:00.000Z");
const T3 = new Date("2026-09-04T00:00:00.000Z");
const T4 = new Date("2026-09-05T00:00:00.000Z");
const T5 = new Date("2026-09-06T00:00:00.000Z");

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
  customer: FakeCustomer | null;
};

type FakeConversation = {
  id: string;
  workspaceId: string;
  leadId: string;
  status: ConversationStatus;
  lastMessageAt: Date | null;
  agentLastReadAt: Date | null;
  agentLastReadByUserId: string | null;
};

type FakeMessage = ConversationReadMessage & {
  workspaceId: string;
  conversationId: string;
  channel: MessageChannel;
  senderName: string;
  body: string | null;
  payload: Prisma.JsonValue | null;
  twilioMessageSid: string | null;
  smsFrom: string | null;
  smsTo: string | null;
};

class FakeInboxApiDb implements AgentInboxListDb {
  leads = new Map<string, FakeLead>();
  conversations = new Map<string, FakeConversation>();
  messages: FakeMessage[] = [];
  findInboxHeadersCalls = 0;
  findLatestMessagesCalls = 0;
  findLatestAssignmentCardsCalls = 0;
  findLatestAssignmentActivitiesCalls = 0;
  countUnreadCalls = 0;
  conversationCreates = 0;
  conversationUpdates = 0;
  messageCreates = 0;
  leadUpdates = 0;
  leadActivityCreates = 0;
  nextMessageId = 1;

  private key(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedLead(
    workspaceId: string,
    leadId: string,
    assignedAgentId: string | null,
    customer: Partial<FakeCustomer> = {},
  ) {
    this.leads.set(this.key(workspaceId, leadId), {
      id: leadId,
      workspaceId,
      assignedAgentId,
      status: "NEW_LEAD",
      customer: {
        name: customer.name ?? "Buyer",
        email: customer.email ?? `${leadId}@test.local`,
        phone: customer.phone ?? "4165550000",
        image: customer.image ?? null,
      },
    });
  }

  seedConversation(row: FakeConversation) {
    this.conversations.set(this.key(row.workspaceId, row.leadId), row);
  }

  addMessage(input: {
    conversationId: string;
    createdAt: Date;
    senderKind?: MessageSenderKind;
    body?: string | null;
    kind?: MessageKind;
    deletedAt?: Date | null;
    twilioMessageSid?: string | null;
    smsFrom?: string | null;
    smsTo?: string | null;
    payload?: Prisma.JsonValue | null;
  }) {
    const conversation = [...this.conversations.values()].find(
      (row) => row.id === input.conversationId,
    );
    this.messages.push({
      id: `msg_${this.nextMessageId++}`,
      workspaceId: conversation?.workspaceId ?? WS_A,
      conversationId: input.conversationId,
      channel: "CHAT",
      kind: input.kind ?? "TEXT",
      senderKind: input.senderKind ?? "CUSTOMER",
      senderUserId: input.senderKind === "AGENT" ? AGENT_A : CUSTOMER_A,
      senderName: "Name",
      body: input.body ?? "hello",
      createdAt: input.createdAt,
      deletedAt: input.deletedAt ?? null,
      payload: input.payload ?? null,
      providerStatus: null,
      deliveredAt: null,
      twilioMessageSid: input.twilioMessageSid ?? "SM_SECRET",
      smsFrom: input.smsFrom ?? "+1555",
      smsTo: input.smsTo ?? "+1666",
    });
  }

  seedThread(input: {
    leadId: string;
    conversationId: string;
    lastMessageAt: Date | null;
    assignedAgentId?: string | null;
    workspaceId?: string;
    customer?: Partial<FakeCustomer>;
    body?: string;
    agentLastReadAt?: Date | null;
    agentLastReadByUserId?: string | null;
  }) {
    const workspaceId = input.workspaceId ?? WS_A;
    this.seedLead(
      workspaceId,
      input.leadId,
      input.assignedAgentId === undefined ? AGENT_A : input.assignedAgentId,
      input.customer,
    );
    this.seedConversation({
      id: input.conversationId,
      workspaceId,
      leadId: input.leadId,
      status: "OPEN",
      lastMessageAt: input.lastMessageAt,
      agentLastReadAt: input.agentLastReadAt ?? null,
      agentLastReadByUserId: input.agentLastReadByUserId ?? null,
    });
    if (input.lastMessageAt) {
      this.addMessage({
        conversationId: input.conversationId,
        createdAt: input.lastMessageAt,
        body: input.body ?? "hello",
      });
    }
  }

  findInboxHeaders: AgentInboxListDb["findInboxHeaders"] = async (input) => {
    this.findInboxHeadersCalls += 1;
    const q = input.q?.toLowerCase() ?? null;
    const rows: AgentInboxHeader[] = [];
    for (const conversation of this.conversations.values()) {
      if (conversation.workspaceId !== input.workspaceId) continue;
      if (!conversation.lastMessageAt) continue;
      const lead = this.leads.get(
        this.key(conversation.workspaceId, conversation.leadId),
      );
      if (!lead || lead.assignedAgentId !== input.assignedAgentId) continue;
      if (q) {
        const hay = [
          lead.customer?.name,
          lead.customer?.email,
          lead.customer?.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }
      rows.push({
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
      });
    }
    rows.sort((a, b) => {
      const byTime = b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
      if (byTime !== 0) return byTime;
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
        message.createdAt > prev.createdAt ||
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
    async () => {
      this.findLatestAssignmentCardsCalls += 1;
      return new Map();
    };

  findLatestAssignmentActivities: AgentInboxListDb["findLatestAssignmentActivities"] =
    async () => {
      this.findLatestAssignmentActivitiesCalls += 1;
      return new Map();
    };

  countUnread: AgentInboxListDb["countUnread"] = async (input) => {
    this.countUnreadCalls += 1;
    const ids = new Set(input.items.map((item) => item.conversationId));
    return countUnreadFromMessageRows(
      this.messages.filter(
        (message) =>
          message.workspaceId === input.workspaceId &&
          ids.has(message.conversationId),
      ),
      input.items,
    );
  };
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

function url(path = "/api/agent/conversations", query = "") {
  return new URL(`https://app.houzzatpro.com${path}${query}`);
}

function asList(body: unknown): AgentInboxListResult {
  assert.ok(body && typeof body === "object");
  assert.ok("conversations" in (body as object));
  return body as AgentInboxListResult;
}

function populatedDb() {
  const db = new FakeInboxApiDb();
  db.seedThread({
    leadId: "lead_mine",
    conversationId: "conv_mine",
    lastMessageAt: T3,
    body: "mine",
  });
  db.seedThread({
    leadId: "lead_older",
    conversationId: "conv_older",
    lastMessageAt: T1,
    body: "older",
  });
  db.seedThread({
    leadId: "lead_mid",
    conversationId: "conv_mid",
    lastMessageAt: T2,
    body: "mid",
  });
  db.seedThread({
    leadId: "lead_empty",
    conversationId: "conv_empty",
    lastMessageAt: null,
  });
  db.seedThread({
    leadId: "lead_pond",
    conversationId: "conv_pond",
    lastMessageAt: T4,
    assignedAgentId: null,
  });
  db.seedThread({
    leadId: "lead_team",
    conversationId: "conv_team",
    lastMessageAt: T5,
    assignedAgentId: AGENT_B,
    customer: { name: "Teammate Lead", email: "team@test.local" },
  });
  db.seedThread({
    leadId: "lead_foreign",
    conversationId: "conv_foreign",
    lastMessageAt: T5,
    workspaceId: WS_B,
    customer: { name: "Foreign Ada", email: "ada@foreign.test" },
  });
  return db;
}

async function testUnauthenticatedRejected() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(db, null, url());
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "Unauthorized" });
  assert.equal(db.findInboxHeadersCalls, 0);
}

async function testTrustedWorkspaceUsed() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(db, ctx(), url());
  assert.equal(result.status, 200);
  const list = asList(result.body);
  assert.deepEqual(
    list.conversations.map((row) => row.conversationId),
    ["conv_mine", "conv_mid", "conv_older"],
  );
  assert.ok(list.conversations.every((row) => row.assignment.assignedAgentId === AGENT_A));
}

async function testForeignWorkspaceExcluded() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(db, ctx(), url());
  const list = asList(result.body);
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_foreign"));
}

async function testTeammateExcluded() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(db, ctx(), url());
  const list = asList(result.body);
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_team"));
}

async function testPondExcluded() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(db, ctx(), url());
  const list = asList(result.body);
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_pond"));
}

async function testCurrentAgentNonEmptyReturned() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(db, ctx(), url());
  const list = asList(result.body);
  assert.ok(list.conversations.some((row) => row.conversationId === "conv_mine"));
}

async function testEmptyConversationExcluded() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(db, ctx(), url());
  const list = asList(result.body);
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_empty"));
}

async function testQueryCannotOverrideWorkspace() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(
    db,
    ctx(),
    url(
      "/api/agent/conversations",
      "?workspaceId=ws_tenant_b&workspace=ws_tenant_b",
    ),
  );
  assert.equal(result.status, 200);
  const list = asList(result.body);
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_foreign"));
  assert.ok(list.conversations.some((row) => row.conversationId === "conv_mine"));
}

async function testQueryCannotOverrideAssignment() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(
    db,
    ctx(),
    url(
      "/api/agent/conversations",
      "?assignedAgentId=user_agent_b&agentId=user_agent_b",
    ),
  );
  assert.equal(result.status, 200);
  const list = asList(result.body);
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_team"));
}

async function testSearchRemainsScoped() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(
    db,
    ctx(),
    url("/api/agent/conversations", "?q=Ada"),
  );
  assert.equal(result.status, 200);
  const list = asList(result.body);
  assert.equal(list.conversations.length, 0);
}

async function testUnreadFilterRemainsScoped() {
  const db = populatedDb();
  const mine = db.conversations.get(`${WS_A}:lead_mine`);
  assert.ok(mine);
  mine.agentLastReadAt = T3;
  mine.agentLastReadByUserId = AGENT_A;
  const result = await getAgentInboxListResponse(
    db,
    ctx(),
    url("/api/agent/conversations", "?filter=unread"),
  );
  assert.equal(result.status, 200);
  const list = asList(result.body);
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_team"));
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_foreign"));
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_pond"));
  assert.ok(!list.conversations.some((row) => row.conversationId === "conv_mine"));
  assert.ok(list.conversations.some((row) => row.conversationId === "conv_mid"));
}

async function testMalformedCursorRejected() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(
    db,
    ctx(),
    url("/api/agent/conversations", "?cursor=not-a-cursor"),
  );
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "Invalid cursor" });
  assert.equal(db.findInboxHeadersCalls, 0);
}

async function testInvalidFilterRejected() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(
    db,
    ctx(),
    url("/api/agent/conversations", "?filter=starred"),
  );
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "Invalid filter" });
  assert.equal(db.findInboxHeadersCalls, 0);
}

async function testInvalidLimitClamped() {
  const db = populatedDb();
  const high = await getAgentInboxListResponse(
    db,
    ctx(),
    url("/api/agent/conversations", "?limit=999"),
  );
  assert.equal(high.status, 200);
  assert.equal(asList(high.body).page.limit, AGENT_INBOX_PAGE_MAX);

  const junk = await getAgentInboxListResponse(
    db,
    ctx(),
    url("/api/agent/conversations", "?limit=nope"),
  );
  assert.equal(junk.status, 200);
  assert.equal(asList(junk.body).page.limit, AGENT_INBOX_PAGE_SIZE);
}

async function testForbiddenFieldsNotExposed() {
  const db = populatedDb();
  const result = await getAgentInboxListResponse(db, ctx(), url());
  const json = JSON.stringify(result.body);
  assert.ok(!json.includes("twilioMessageSid"));
  assert.ok(!json.includes("SM_SECRET"));
  assert.ok(!json.includes("smsFrom"));
  assert.ok(!json.includes("smsTo"));
  assert.ok(!json.includes("customerLastReadAt"));
  assert.ok(!json.includes("MessageRevision"));
  assert.ok(!json.includes("createdByUserId"));
  for (const row of asList(result.body).conversations) {
    assert.equal(
      "payload" in (row.latestMessage ?? {}),
      false,
    );
    assert.ok(!("messages" in row));
  }
}

async function testNoSideEffects() {
  const db = populatedDb();
  await getAgentInboxListResponse(db, ctx(), url());
  await getAgentInboxListResponse(
    db,
    ctx(),
    url("/api/agent/conversations", "?filter=unread"),
  );
  assert.equal(db.conversationCreates, 0);
  assert.equal(db.conversationUpdates, 0);
  assert.equal(db.messageCreates, 0);
  assert.equal(db.leadUpdates, 0);
  assert.equal(db.leadActivityCreates, 0);
}

async function testPaginationCursor() {
  const db = populatedDb();
  const first = await getAgentInboxListResponse(
    db,
    ctx(),
    url("/api/agent/conversations", "?limit=2"),
  );
  const list = asList(first.body);
  assert.equal(list.page.limit, 2);
  assert.equal(list.page.hasMore, true);
  assert.ok(list.page.nextCursor);
  assert.deepEqual(
    list.conversations.map((row) => row.conversationId),
    ["conv_mine", "conv_mid"],
  );

  const second = await getAgentInboxListResponse(
    db,
    ctx(),
    url(
      "/api/agent/conversations",
      `?limit=2&cursor=${encodeURIComponent(list.page.nextCursor ?? "")}`,
    ),
  );
  const next = asList(second.body);
  assert.deepEqual(
    next.conversations.map((row) => row.conversationId),
    ["conv_older"],
  );
  assert.ok(!next.conversations.some((row) => row.conversationId === "conv_mine"));
  assert.ok(!next.conversations.some((row) => row.conversationId === "conv_mid"));
}

async function testInvokesListOnce() {
  const db = populatedDb();
  await getAgentInboxListResponse(db, ctx(), url());
  assert.equal(db.findInboxHeadersCalls, 1);
  assert.equal(db.findLatestMessagesCalls, 1);
  assert.equal(db.countUnreadCalls, 1);
}

function testRouteSourceContract() {
  const route = read("src/app/api/agent/conversations/route.ts");
  assert.ok(route.includes("requireAgentContextFromRequest(request"));
  assert.ok(route.includes("sideEffects: false"));
  assert.ok(route.includes("getAgentInboxListResponse"));
  assert.ok(route.includes("createPrismaAgentInboxListDb"));
  assert.ok(!route.includes("listAgentInboxConversations("));
  assert.ok(!route.includes("getOrCreateLeadConversation"));
  assert.ok(!route.includes("markConversationReadByAgent"));
  assert.ok(!route.includes("markAgentLeadConversationRead"));
  assert.ok(!route.includes("createConversationMessage"));
  assert.ok(!route.includes("leadScopeWhere"));
  assert.ok(!route.includes('searchParams.get("workspace'));
  assert.ok(!route.includes('searchParams.get("assignedAgent'));
  assert.ok(!route.includes("GET") || route.includes("export async function GET"));
  assert.ok(!route.includes("export async function POST"));

  const adapter = read("src/lib/conversations/agent-inbox-list.ts");
  const getFn = adapter.indexOf("export async function getAgentInboxListResponse");
  const listFn = adapter.indexOf(
    "const data = await listAgentInboxConversations",
  );
  assert.ok(getFn >= 0);
  assert.ok(listFn > getFn);
  assert.equal(
    adapter.slice(getFn).split("listAgentInboxConversations(").length - 1,
    1,
  );

  const comms = read("src/components/agent/AgentShell.tsx");
  assert.ok(comms.includes('href: "/agent/inbox"'));
  assert.ok(comms.includes('label: "Comms"'));
  const instant = read("src/components/agent/AgentMobileInstantShell.tsx");
  assert.ok(!instant.includes("AgentChatsInbox"));
  assert.ok(!instant.includes("useAgentChatThread"));
  assert.ok(instant.includes('href="/agent/chats"'));
}

async function main() {
  await testUnauthenticatedRejected();
  await testTrustedWorkspaceUsed();
  await testForeignWorkspaceExcluded();
  await testTeammateExcluded();
  await testPondExcluded();
  await testCurrentAgentNonEmptyReturned();
  await testEmptyConversationExcluded();
  await testQueryCannotOverrideWorkspace();
  await testQueryCannotOverrideAssignment();
  await testSearchRemainsScoped();
  await testUnreadFilterRemainsScoped();
  await testMalformedCursorRejected();
  await testInvalidFilterRejected();
  await testInvalidLimitClamped();
  await testForbiddenFieldsNotExposed();
  await testNoSideEffects();
  await testPaginationCursor();
  await testInvokesListOnce();
  testRouteSourceContract();
  console.log("agent-inbox-api:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
