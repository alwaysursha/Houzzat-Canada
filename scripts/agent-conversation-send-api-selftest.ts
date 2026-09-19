/**
 * Agent CHAT TEXT send API — in-memory selftest.
 * Does not connect to production. Does not create production rows.
 * Run: pnpm agent-conversation-send-api:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ConversationStatus,
  OrgMembershipRole,
  Role,
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceStatus,
} from "@prisma/client";
import type { AgentOrgContext } from "../src/lib/agent";
import {
  AGENT_CHAT_TEXT_MAX_LENGTH,
  agentChatSendRequestSchema,
  agentConversationSendRequestSchema,
  frozenAgentSenderName,
  normalizeAgentChatText,
  sendAgentLeadChatMessage,
  type AgentConversationSendDb,
} from "../src/lib/conversations/agent-conversation-send";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import type {
  ConversationMessageRecord,
  ConversationMessageTx,
} from "../src/lib/conversations/create-conversation-message";

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
      name: "Ali Agent",
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

class FakeSendDb implements AgentConversationSendDb {
  leads = new Map<
    string,
    {
      id: string;
      workspaceId: string;
      organizationId: string | null;
      assignedAgentId: string | null;
    }
  >();
  conversations = new Map<string, LeadConversationRecord>();
  messages: ConversationMessageRecord[] = [];
  conversationCreates = 0;
  messageCreates = 0;
  leadActivityCreates = 0;
  notificationSends = 0;
  emailSends = 0;
  smsSends = 0;
  nextConversationId = 1;
  nextMessageId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedLead(input: {
    id?: string;
    workspaceId?: string;
    organizationId?: string | null;
    assignedAgentId: string | null;
  }) {
    const row = {
      id: input.id ?? LEAD_A,
      workspaceId: input.workspaceId ?? WS_A,
      organizationId: input.organizationId ?? ORG_A,
      assignedAgentId: input.assignedAgentId,
    };
    this.leads.set(this.leadKey(row.workspaceId, row.id), row);
    return row;
  }

  seedConversation(
    overrides: Partial<LeadConversationRecord> &
      Pick<LeadConversationRecord, "id" | "workspaceId" | "leadId">,
  ) {
    const now = new Date("2026-09-17T18:00:00.000Z");
    const row: LeadConversationRecord = {
      status: "OPEN" as ConversationStatus,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      customerLastReadAt: null,
      agentLastReadAt: null,
      agentLastReadByUserId: null,
      ...overrides,
    };
    this.conversations.set(this.leadKey(row.workspaceId, row.leadId), row);
    return row;
  }

  lead: AgentConversationSendDb["lead"] = {
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
      const byId = where.workspaceId_id as
        | { workspaceId: string; id: string }
        | undefined;
      if (byId) {
        return (
          [...this.conversations.values()].find(
            (row) =>
              row.workspaceId === byId.workspaceId && row.id === byId.id,
          ) ?? null
        );
      }
      return null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const workspaceId = String(data.workspaceId);
      const leadId = String(data.leadId);
      const key = this.leadKey(workspaceId, leadId);
      this.conversationCreates += 1;
      if (this.conversations.has(key)) throw uniqueError();
      const now = new Date("2026-09-17T18:00:00.000Z");
      const row: LeadConversationRecord = {
        id: `conv_${this.nextConversationId++}`,
        workspaceId,
        leadId,
        status: "OPEN" as ConversationStatus,
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
      if (data.lastMessageAt !== undefined) {
        row.lastMessageAt = data.lastMessageAt;
      }
      if (data.agentLastReadAt !== undefined) {
        row.agentLastReadAt = data.agentLastReadAt;
      }
      if (data.agentLastReadByUserId !== undefined) {
        row.agentLastReadByUserId = data.agentLastReadByUserId;
      }
      if (data.customerLastReadAt !== undefined) {
        row.customerLastReadAt = data.customerLastReadAt;
      }
      this.conversations.set(this.leadKey(row.workspaceId, row.leadId), row);
      return { ...row };
    },
  };

  message = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const sid = where.twilioMessageSid;
      if (typeof sid === "string") {
        return this.messages.find((row) => row.twilioMessageSid === sid) ?? null;
      }
      return null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.messageCreates += 1;
      const row: ConversationMessageRecord = {
        id: `msg_${this.nextMessageId++}`,
        workspaceId: String(data.workspaceId),
        conversationId: String(data.conversationId),
        leadId: String(data.leadId),
        channel: data.channel as ConversationMessageRecord["channel"],
        kind: data.kind as ConversationMessageRecord["kind"],
        senderKind: data.senderKind as ConversationMessageRecord["senderKind"],
        senderUserId:
          typeof data.senderUserId === "string" ? data.senderUserId : null,
        senderName: String(data.senderName),
        createdByUserId:
          typeof data.createdByUserId === "string"
            ? data.createdByUserId
            : null,
        body: typeof data.body === "string" ? data.body : null,
        createdAt:
          data.createdAt instanceof Date ? data.createdAt : new Date(),
        deliveredAt: null,
        smsSource: (data.smsSource ??
          null) as ConversationMessageRecord["smsSource"],
        twilioMessageSid:
          typeof data.twilioMessageSid === "string"
            ? data.twilioMessageSid
            : null,
        providerStatus:
          typeof data.providerStatus === "string" ? data.providerStatus : null,
        smsFrom: typeof data.smsFrom === "string" ? data.smsFrom : null,
        smsTo: typeof data.smsTo === "string" ? data.smsTo : null,
        payload: (data.payload ?? null) as ConversationMessageRecord["payload"],
      };
      this.messages.push(row);
      return row;
    },
  };

  async $transaction<T>(
    fn: (tx: ConversationMessageTx) => Promise<T>,
  ): Promise<T> {
    return fn({
      message: this.message,
      conversation: this.conversation,
    });
  }
}

function assignedDb() {
  const db = new FakeSendDb();
  db.seedLead({ assignedAgentId: AGENT_A });
  return db;
}

function testSchemaRejectsSpoofedFields() {
  assert.equal(
    agentChatSendRequestSchema.safeParse({ body: "Hello" }).success,
    true,
  );
  assert.equal(
    agentChatSendRequestSchema.safeParse({
      body: "Hello",
      senderName: "Hacker",
    }).success,
    false,
  );
  assert.equal(
    agentChatSendRequestSchema.safeParse({
      body: "Hello",
      senderKind: "CUSTOMER",
    }).success,
    false,
  );
  assert.equal(
    agentChatSendRequestSchema.safeParse({
      body: "Hello",
      senderUserId: AGENT_B,
    }).success,
    false,
  );
  assert.equal(
    agentChatSendRequestSchema.safeParse({
      body: "Hello",
      channel: "SMS",
    }).success,
    false,
  );
  assert.equal(
    agentChatSendRequestSchema.safeParse({
      body: "Hello",
      kind: "SYSTEM_CARD",
    }).success,
    false,
  );
  assert.equal(
    agentChatSendRequestSchema.safeParse({
      body: "Hello",
      workspaceId: WS_B,
    }).success,
    false,
  );
  assert.equal(
    agentChatSendRequestSchema.safeParse({
      body: "Hello",
      smsSource: "TWILIO",
      twilioMessageSid: "SM1",
    }).success,
    false,
  );
  const omitted = agentConversationSendRequestSchema.safeParse({ body: "Hello" });
  assert.equal(omitted.success, true);
  if (omitted.success) assert.equal(omitted.data.channel, undefined);
  assert.equal(
    agentConversationSendRequestSchema.safeParse({
      body: "Hello",
      channel: "SMS",
    }).success,
    true,
  );
  assert.equal(
    agentConversationSendRequestSchema.safeParse({
      body: "Hello",
      channel: "SMS",
      senderName: "Hacker",
    }).success,
    false,
  );
}

function testNormalizeBody() {
  assert.equal(normalizeAgentChatText("   "), null);
  assert.equal(normalizeAgentChatText("\n\n"), null);
  assert.equal(normalizeAgentChatText("hello\r\nworld"), "hello\nworld");
  assert.equal(
    normalizeAgentChatText("  keep\n\nbreaks  "),
    "keep\n\nbreaks",
  );
  assert.equal(normalizeAgentChatText("x".repeat(AGENT_CHAT_TEXT_MAX_LENGTH)), "x".repeat(AGENT_CHAT_TEXT_MAX_LENGTH));
  assert.equal(
    normalizeAgentChatText("x".repeat(AGENT_CHAT_TEXT_MAX_LENGTH + 1)),
    null,
  );
  assert.equal(frozenAgentSenderName({ name: " Ali ", email: "a@x.test" }), "Ali");
  assert.equal(
    frozenAgentSenderName({ name: null, email: "agent@test.local" }),
    "agent@test.local",
  );
}

async function testAssignedAgentCanSend() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const result = await sendAgentLeadChatMessage(
      db,
      makeCtx(),
      LEAD_A,
      "Hello from desk",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.message.channel, "CHAT");
    assert.equal(result.data.message.kind, "TEXT");
    assert.equal(result.data.message.senderKind, "AGENT");
    assert.equal(result.data.message.senderUserId, AGENT_A);
    assert.equal(result.data.message.senderName, "Ali Agent");
    assert.equal(result.data.message.body, "Hello from desk");
    assert.equal(result.data.conversation.created, true);
    assert.equal(db.messages.length, 1);
    assert.equal(db.messages[0]?.createdByUserId, AGENT_A);
    assert.equal(db.messages[0]?.smsSource, null);
    assert.equal(db.messages[0]?.twilioMessageSid, null);
  });
}

async function testFrozenNameNotAssignedAgentName() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const result = await sendAgentLeadChatMessage(
      db,
      makeCtx({
        user: {
          id: AGENT_A,
          email: "ali@houzzat.test",
          name: "Actual Authenticated Agent",
          image: null,
          phone: null,
          role: "AGENT" as Role,
        },
      }),
      LEAD_A,
      "Checking identity",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.message.senderUserId, AGENT_A);
    assert.equal(result.data.message.senderName, "Actual Authenticated Agent");
    assert.notEqual(result.data.message.senderName, AGENT_A);
  });
}

async function testAdminCannotSend() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const result = await sendAgentLeadChatMessage(
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
      "Admin impersonation",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "FORBIDDEN");
    assert.equal(db.messageCreates, 0);
  });
}

async function testFormerAndUnauthorizedCannotSend() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const unauthorized = await sendAgentLeadChatMessage(
      db,
      makeCtx({ userId: AGENT_B }),
      LEAD_A,
      "nope",
    );
    assert.equal(unauthorized.ok, false);
    if (!unauthorized.ok) assert.equal(unauthorized.reason, "LEAD_NOT_FOUND");

    const formerViewer = await sendAgentLeadChatMessage(
      db,
      makeCtx({
        userId: AGENT_B,
        canSeeTeamLeads: true,
        user: {
          id: AGENT_B,
          email: "former@test.local",
          name: "Former",
          image: null,
          phone: null,
          role: "AGENT" as Role,
        },
      }),
      LEAD_A,
      "former send",
    );
    assert.equal(formerViewer.ok, false);
    if (!formerViewer.ok) assert.equal(formerViewer.reason, "FORBIDDEN");
    assert.equal(db.messageCreates, 0);
  });
}

async function testForeignWorkspaceCannotSend() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const result = await sendAgentLeadChatMessage(
      db,
      makeCtx({
        workspaceId: WS_B,
        organizationId: ORG_B,
        organizationIds: [ORG_B],
      }),
      LEAD_A,
      "cross tenant",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "LEAD_NOT_FOUND");
    assert.equal(db.messageCreates, 0);
  });
}

async function testPondCannotSend() {
  await withWorkspaceRead(async () => {
    const db = new FakeSendDb();
    db.seedLead({ assignedAgentId: null });
    const result = await sendAgentLeadChatMessage(
      db,
      makeCtx(),
      LEAD_A,
      "pond ping",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "FORBIDDEN");
    assert.equal(db.messageCreates, 0);
  });
}

async function testNonexistentLeadCannotSend() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const result = await sendAgentLeadChatMessage(
      db,
      makeCtx(),
      "lead_missing",
      "hello",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "LEAD_NOT_FOUND");
  });
}

async function testLazyCreateThenReuseConversation() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const first = await sendAgentLeadChatMessage(db, makeCtx(), LEAD_A, "first");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.data.conversation.created, true);
    const conversationId = first.data.conversation.id;
    const second = await sendAgentLeadChatMessage(
      db,
      makeCtx(),
      LEAD_A,
      "second",
    );
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.data.conversation.created, false);
    assert.equal(second.data.conversation.id, conversationId);
    assert.equal(db.conversations.size, 1);
    assert.equal(db.messages.length, 2);
  });
}

async function testBlankAndOversizedRejected() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const blank = await sendAgentLeadChatMessage(db, makeCtx(), LEAD_A, "   \n");
    assert.equal(blank.ok, false);
    if (!blank.ok) assert.equal(blank.reason, "INVALID_BODY");
    const oversized = await sendAgentLeadChatMessage(
      db,
      makeCtx(),
      LEAD_A,
      "x".repeat(AGENT_CHAT_TEXT_MAX_LENGTH + 1),
    );
    assert.equal(oversized.ok, false);
    if (!oversized.ok) assert.equal(oversized.reason, "INVALID_BODY");
    assert.equal(db.messageCreates, 0);
  });
}

async function testPlainTextLineBreaksAndHtmlLiteral() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const result = await sendAgentLeadChatMessage(
      db,
      makeCtx(),
      LEAD_A,
      "Line one\n\nLine two <b>not html</b>",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.message.body, "Line one\n\nLine two <b>not html</b>");
  });
}

async function testSendDoesNotTouchReadCursors() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const customerRead = new Date("2026-09-01T00:00:00.000Z");
    const conversation = db.seedConversation({
      id: "conv_a",
      workspaceId: WS_A,
      leadId: LEAD_A,
      customerLastReadAt: customerRead,
      agentLastReadAt: null,
      agentLastReadByUserId: null,
    });
    const result = await sendAgentLeadChatMessage(
      db,
      makeCtx(),
      LEAD_A,
      "reply without catching up",
    );
    assert.equal(result.ok, true);
    assert.deepEqual(conversation.customerLastReadAt, customerRead);
    assert.equal(conversation.agentLastReadAt, null);
    assert.equal(conversation.agentLastReadByUserId, null);
    assert.ok(conversation.lastMessageAt);
  });
}

async function testNoCrmOrOutboundSideEffects() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    await sendAgentLeadChatMessage(db, makeCtx(), LEAD_A, "hello");
    assert.equal(db.leadActivityCreates, 0);
    assert.equal(db.notificationSends, 0);
    assert.equal(db.emailSends, 0);
    assert.equal(db.smsSends, 0);
  });
}

async function testResponseOmitsProhibitedFields() {
  await withWorkspaceRead(async () => {
    const db = assignedDb();
    const result = await sendAgentLeadChatMessage(
      db,
      makeCtx(),
      LEAD_A,
      "safe response",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.data);
    assert.equal(serialized.includes("twilioMessageSid"), false);
    assert.equal(serialized.includes("createdByUserId"), false);
    assert.equal(serialized.includes("smsFrom"), false);
    assert.equal(serialized.includes("smsTo"), false);
    assert.equal(serialized.includes("customerLastReadAt"), false);
    assert.equal("twilioMessageSid" in result.data.message, false);
    assert.equal("createdByUserId" in result.data.message, false);
  });
}

function testRouteSourceContract() {
  const route = read(
    "src/app/api/agent/leads/[id]/conversation/messages/route.ts",
  );
  const service = read("src/lib/conversations/agent-conversation-send.ts");
  assert.ok(route.includes("requireAgentContextFromRequest(request)"));
  assert.ok(route.includes("sendAgentLeadChatMessage"));
  assert.ok(route.includes("agentConversationSendRequestSchema"));
  assert.ok(route.includes("parseJsonText"));
  assert.ok(!route.includes("prisma.message.create"));
  assert.ok(!route.includes("createConversationMessage("));
  assert.ok(!route.includes("markConversationReadByAgent"));
  assert.ok(!route.includes("markAgentLeadConversationRead"));
  assert.ok(!route.includes("leadActivity"));
  assert.ok(!route.includes("searchParams.get(\"workspace"));
  assert.ok(service.includes("createConversationMessage"));
  assert.ok(service.includes('channel: "CHAT"'));
  assert.ok(service.includes('kind: "TEXT"'));
  assert.ok(service.includes('senderKind: "AGENT"'));
  assert.ok(service.includes("loadAccessibleAgentConversationLead"));
  assert.ok(service.includes("assignedAgentId !== ctx.user.id"));
  assert.ok(!service.includes("markConversationReadByAgent("));
  assert.ok(!service.includes("prisma.leadActivity"));
  assert.ok(!service.includes("@/lib/notifications"));
  assert.ok(!service.includes("customer-chat-agent-push"));
  assert.ok(!service.includes("chat_message"));
  assert.ok(!service.includes("twilioMessageSid:"));
  const v2 = read("src/app/api/agent/leads-v2/[id]/emails/route.ts");
  assert.ok(!v2.includes("sendAgentLeadChatMessage"));
}

async function main() {
  testSchemaRejectsSpoofedFields();
  testNormalizeBody();
  await testAssignedAgentCanSend();
  await testFrozenNameNotAssignedAgentName();
  await testAdminCannotSend();
  await testFormerAndUnauthorizedCannotSend();
  await testForeignWorkspaceCannotSend();
  await testPondCannotSend();
  await testNonexistentLeadCannotSend();
  await testLazyCreateThenReuseConversation();
  await testBlankAndOversizedRejected();
  await testPlainTextLineBreaksAndHtmlLiteral();
  await testSendDoesNotTouchReadCursors();
  await testNoCrmOrOutboundSideEffects();
  await testResponseOmitsProhibitedFields();
  testRouteSourceContract();
  console.log("agent-conversation-send-api:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
