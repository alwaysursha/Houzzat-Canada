/**
 * Canonical Conversation Message service — in-memory selftest.
 * Does not connect to production. Does not create production rows.
 * Run: pnpm conversation-message:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversationStatus } from "@prisma/client";
import {
  SYSTEM_SENDER_NAME,
  createConversationMessage,
  type ConversationMessageDb,
  type ConversationMessageRecord,
  type ConversationMessageTx,
  type CreateConversationMessageInput,
} from "../src/lib/conversations/create-conversation-message";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const LEAD_A = "lead_in_workspace_a";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const ADMIN_A = "user_admin_a";
const CUSTOMER_A = "user_customer_a";

function uniqueError(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function makeConversation(
  workspaceId: string,
  leadId: string,
  id: string,
): LeadConversationRecord {
  const now = new Date("2026-09-17T18:00:00.000Z");
  return {
    id,
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
}

class FakeMessageDb implements ConversationMessageDb {
  leads = new Map<string, { id: string; workspaceId: string }>();
  conversations = new Map<string, LeadConversationRecord>();
  messages: ConversationMessageRecord[] = [];
  conversationCreates = 0;
  messageCreates = 0;
  leadActivityCreates = 0;
  notificationSends = 0;
  nextConversationId = 1;
  nextMessageId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  addLead(workspaceId: string, leadId: string) {
    this.leads.set(this.leadKey(workspaceId, leadId), {
      id: leadId,
      workspaceId,
    });
  }

  lead: ConversationMessageDb["lead"] = {
    findUnique: async ({ where }) => {
      const pair = where.workspaceId_id;
      if (!pair) return null;
      return this.leads.get(this.leadKey(pair.workspaceId, pair.id)) ?? null;
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
      const row = makeConversation(
        workspaceId,
        leadId,
        `conv_${this.nextConversationId++}`,
      );
      this.conversations.set(key, row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { workspaceId_id?: { workspaceId: string; id: string } };
      data: { lastMessageAt?: Date };
    }) => {
      const pair = where.workspaceId_id;
      if (!pair) throw new Error("workspaceId_id required");
      const row = [...this.conversations.values()].find(
        (item) =>
          item.workspaceId === pair.workspaceId && item.id === pair.id,
      );
      if (!row) throw new Error("Conversation not found");
      row.lastMessageAt = data.lastMessageAt ?? row.lastMessageAt;
      row.updatedAt = new Date();
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
      const sid =
        typeof data.twilioMessageSid === "string"
          ? data.twilioMessageSid
          : null;
      if (sid && this.messages.some((row) => row.twilioMessageSid === sid)) {
        throw uniqueError();
      }
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
        twilioMessageSid: sid,
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

  leadActivity = {
    create: async () => {
      this.leadActivityCreates += 1;
      throw new Error("LeadActivity must not be written");
    },
  };
}

function chatText(
  overrides: Partial<CreateConversationMessageInput> = {},
): CreateConversationMessageInput {
  return {
    workspaceId: WS_A,
    leadId: LEAD_A,
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "AGENT",
    senderUserId: AGENT_A,
    senderName: "Ali Agent",
    body: "Hello from chat",
    ...overrides,
  };
}

async function testFirstMessageLazilyCreatesConversation() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(db, chatText());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.created, true);
  assert.equal(result.conversationCreated, true);
  assert.equal(db.conversationCreates, 1);
  assert.equal(db.messageCreates, 1);
  assert.equal(result.message.conversationId, result.conversation.id);
  assert.ok(result.conversation.lastMessageAt);
}

async function testSubsequentMessageUsesSameConversation() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const first = await createConversationMessage(db, chatText({ body: "One" }));
  const second = await createConversationMessage(db, chatText({ body: "Two" }));
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(second.conversationCreated, false);
  assert.equal(first.conversation.id, second.conversation.id);
  assert.equal(db.conversationCreates, 1);
  assert.equal(db.messages.length, 2);
}

async function testLastMessageAtAdvances() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const first = await createConversationMessage(db, chatText({ body: "One" }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await createConversationMessage(db, chatText({ body: "Two" }));
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(
    second.conversation.lastMessageAt,
    second.message.createdAt,
  );
  assert.ok(
    (second.conversation.lastMessageAt?.getTime() ?? 0) >=
      (first.conversation.lastMessageAt?.getTime() ?? 0),
  );
}

async function testAgentSenderIndependentOfAssignedAgent() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({
      senderUserId: AGENT_B,
      senderName: "Other Agent",
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.message.senderKind, "AGENT");
  assert.equal(result.message.senderUserId, AGENT_B);
  assert.equal(result.message.senderName, "Other Agent");
}

async function testAdminDoesNotMasqueradeAsAgent() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({
      senderKind: "ADMIN",
      senderUserId: ADMIN_A,
      senderName: "Workspace Admin",
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.message.senderKind, "ADMIN");
  assert.equal(result.message.senderUserId, ADMIN_A);
}

async function testCustomerWithLinkedUser() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({
      senderKind: "CUSTOMER",
      senderUserId: CUSTOMER_A,
      senderName: "Pat Buyer",
      body: "Is this still available?",
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.message.senderUserId, CUSTOMER_A);
}

async function testCustomerWithoutUserId() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({
      senderKind: "CUSTOMER",
      senderUserId: null,
      senderName: "SMS inbound",
      body: "Can we view Saturday?",
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.message.senderUserId, null);
  assert.equal(result.message.senderName, "SMS inbound");
}

async function testSystemRejectsHumanSender() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({
      kind: "SYSTEM_CARD",
      senderKind: "SYSTEM",
      senderUserId: AGENT_A,
      senderName: SYSTEM_SENDER_NAME,
      body: null,
      payload: { card: "REASSIGNED" },
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "INVALID_SENDER");
  assert.equal(db.messageCreates, 0);
}

async function testSystemCardValid() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({
      kind: "SYSTEM_CARD",
      senderKind: "SYSTEM",
      senderUserId: null,
      senderName: SYSTEM_SENDER_NAME,
      body: "Lead reassigned",
      payload: { card: "REASSIGNED", fromAgentId: AGENT_A, toAgentId: AGENT_B },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.message.kind, "SYSTEM_CARD");
  assert.equal(result.message.senderUserId, null);
  assert.equal(result.message.senderName, SYSTEM_SENDER_NAME);
}

async function testTextRequiresNonEmptyBody() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({ body: "   " }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "INVALID_CONTENT");
}

async function testChatRejectsSmsMetadata() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({ smsFrom: "+14165550100" }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "INVALID_CHANNEL");
}

async function testSmsTwilioRequiresSidAndNumbers() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const missing = await createConversationMessage(
    db,
    chatText({
      channel: "SMS",
      smsSource: "TWILIO",
      body: "Twilio body",
    }),
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "INVALID_CHANNEL");

  const ok = await createConversationMessage(
    db,
    chatText({
      channel: "SMS",
      smsSource: "TWILIO",
      twilioMessageSid: "SM123",
      smsFrom: "+14165550100",
      smsTo: "+14165550199",
      providerStatus: "delivered",
      senderKind: "CUSTOMER",
      senderUserId: null,
      senderName: "Pat",
      body: "Twilio body",
    }),
  );
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.message.twilioMessageSid, "SM123");
  assert.equal(ok.message.smsSource, "TWILIO");
}

async function testSmsManualRejectsTwilioSid() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const invalid = await createConversationMessage(
    db,
    chatText({
      channel: "SMS",
      smsSource: "MANUAL",
      twilioMessageSid: "SM999",
      body: "Logged SMS",
    }),
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.reason, "INVALID_CHANNEL");

  const ok = await createConversationMessage(
    db,
    chatText({
      channel: "SMS",
      smsSource: "MANUAL",
      body: "Logged SMS",
    }),
  );
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.message.smsSource, "MANUAL");
  assert.equal(ok.message.twilioMessageSid, null);
}

async function testInvalidChannelSourceRejected() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({ channel: "SMS", smsSource: null, body: "Nope" }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "INVALID_CHANNEL");
}

async function testDuplicateTwilioSidDoesNotDuplicate() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const input = chatText({
    channel: "SMS",
    smsSource: "TWILIO",
    twilioMessageSid: "SM_DUP",
    smsFrom: "+14165550100",
    smsTo: "+14165550199",
    senderKind: "CUSTOMER",
    senderUserId: null,
    senderName: "Pat",
    body: "Same SID",
  });
  const first = await createConversationMessage(db, input);
  const second = await createConversationMessage(db, input);
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(second.created, false);
  assert.equal(first.message.id, second.message.id);
  assert.equal(db.messages.length, 1);
}

async function testTwilioSidConflictAcrossConversations() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  db.addLead(WS_A, "lead_other");
  await createConversationMessage(
    db,
    chatText({
      channel: "SMS",
      smsSource: "TWILIO",
      twilioMessageSid: "SM_SHARED",
      smsFrom: "+14165550100",
      smsTo: "+14165550199",
      senderKind: "CUSTOMER",
      senderUserId: null,
      senderName: "Pat",
      body: "First lead",
    }),
  );
  const conflict = await createConversationMessage(
    db,
    chatText({
      leadId: "lead_other",
      channel: "SMS",
      smsSource: "TWILIO",
      twilioMessageSid: "SM_SHARED",
      smsFrom: "+14165550100",
      smsTo: "+14165550199",
      senderKind: "CUSTOMER",
      senderUserId: null,
      senderName: "Pat",
      body: "Second lead",
    }),
  );
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.reason, "TWILIO_SID_CONFLICT");
  assert.equal(db.messages.length, 1);
}

async function testWrongWorkspaceCannotCreate() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(
    db,
    chatText({ workspaceId: WS_B }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "LEAD_NOT_IN_WORKSPACE");
  assert.equal(db.messageCreates, 0);
  assert.equal(db.conversationCreates, 0);
}

async function testNonexistentLeadRejected() {
  const db = new FakeMessageDb();
  const result = await createConversationMessage(db, chatText());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "LEAD_NOT_IN_WORKSPACE");
  assert.equal(db.messageCreates, 0);
}

async function testLeadIdComesFromConversation() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  const result = await createConversationMessage(db, chatText());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.message.leadId, result.conversation.leadId);
  assert.equal(result.message.leadId, LEAD_A);
  assert.equal(result.message.workspaceId, WS_A);
}

async function testNoLeadActivityOrNotifications() {
  const db = new FakeMessageDb();
  db.addLead(WS_A, LEAD_A);
  await createConversationMessage(db, chatText());
  assert.equal(db.leadActivityCreates, 0);
  assert.equal(db.notificationSends, 0);

  const source = read("src/lib/conversations/create-conversation-message.ts");
  assert.ok(!source.includes("prisma.leadActivity"));
  assert.ok(!source.includes("@/lib/notifications"));
}

function testNotWiredIntoProductPaths() {
  const callers = [
    "src/app/api/leads/route.ts",
    "src/lib/agent/lead-intake.ts",
    "src/app/api/agent/leads/route.ts",
    "src/app/api/agent/email/route.ts",
    "src/lib/notifications.ts",
  ];
  for (const rel of callers) {
    const src = read(rel);
    assert.ok(!src.includes("createConversationMessage"));
  }
}

async function main() {
  await testFirstMessageLazilyCreatesConversation();
  await testSubsequentMessageUsesSameConversation();
  await testLastMessageAtAdvances();
  await testAgentSenderIndependentOfAssignedAgent();
  await testAdminDoesNotMasqueradeAsAgent();
  await testCustomerWithLinkedUser();
  await testCustomerWithoutUserId();
  await testSystemRejectsHumanSender();
  await testSystemCardValid();
  await testTextRequiresNonEmptyBody();
  await testChatRejectsSmsMetadata();
  await testSmsTwilioRequiresSidAndNumbers();
  await testSmsManualRejectsTwilioSid();
  await testInvalidChannelSourceRejected();
  await testDuplicateTwilioSidDoesNotDuplicate();
  await testTwilioSidConflictAcrossConversations();
  await testWrongWorkspaceCannotCreate();
  await testNonexistentLeadRejected();
  await testLeadIdComesFromConversation();
  await testNoLeadActivityOrNotifications();
  testNotWiredIntoProductPaths();
  console.log("conversation-message:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
