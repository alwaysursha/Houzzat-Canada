/**
 * Manual / inbound / Lead-automation / Agent-notification SMS
 * Conversation + Activity presentation.
 * Run: pnpm sms-automation-conversation-activity:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  conversationActivityFromLeadActivity,
  conversationActivityHeadline,
} from "../src/lib/agent/conversation-activity";
import { v2SmsAutomationBadge } from "../src/lib/agent/lead-profile-v2/chat-query";
import { presentAgentConversationMessage } from "../src/lib/conversations/agent-conversation-read";
import type { AgentConversationMessageRow } from "../src/lib/conversations/agent-conversation-read";
import {
  createConversationMessage,
  type ConversationMessageDb,
  type ConversationMessageRecord,
  type ConversationMessageTx,
  type CreateConversationMessageInput,
} from "../src/lib/conversations/create-conversation-message";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import {
  recordSmsLeadActivity,
  type ConversationLeadActivityDb,
} from "../src/lib/conversations/sms-lead-activity";
import {
  presentSmsAutomationMessagePayload,
} from "../src/lib/conversations/sms-automation-payload";
import { smsAutomationTranscriptLabel } from "../src/lib/platform/sms-automations/catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

class FakeMessageDb implements ConversationMessageDb {
  leads = new Map<string, { id: string; workspaceId: string }>();
  conversations = new Map<string, LeadConversationRecord>();
  messages: ConversationMessageRecord[] = [];
  nextConversationId = 1;
  nextMessageId = 1;

  addLead() {
    this.leads.set("ws-1:lead-1", { id: "lead-1", workspaceId: "ws-1" });
  }

  lead = {
    findUnique: async ({
      where,
    }: {
      where: { workspaceId_id?: { workspaceId: string; id: string } };
    }) => {
      const pair = where.workspaceId_id;
      if (!pair) return null;
      return this.leads.get(`${pair.workspaceId}:${pair.id}`) ?? null;
    },
  };

  conversation = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const byLead = where.workspaceId_leadId as
        | { workspaceId: string; leadId: string }
        | undefined;
      if (byLead) {
        return this.conversations.get(`${byLead.workspaceId}:${byLead.leadId}`) ?? null;
      }
      return [...this.conversations.values()][0] ?? null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date("2026-09-20T17:00:00.000Z");
      const row: LeadConversationRecord = {
        id: `conv_${this.nextConversationId++}`,
        workspaceId: String(data.workspaceId),
        leadId: String(data.leadId),
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
        customerLastReadAt: null,
        agentLastReadAt: null,
        agentLastReadByUserId: null,
      };
      this.conversations.set(`${row.workspaceId}:${row.leadId}`, row);
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
      const row = [...this.conversations.values()].find(
        (item) =>
          item.workspaceId === pair?.workspaceId && item.id === pair?.id,
      );
      if (!row) throw new Error("Conversation not found");
      row.lastMessageAt = data.lastMessageAt ?? row.lastMessageAt;
      return { ...row };
    },
  };

  message = {
    findUnique: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
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
          typeof data.createdByUserId === "string" ? data.createdByUserId : null,
        body: typeof data.body === "string" ? data.body : null,
        createdAt: new Date("2026-09-20T17:00:00.000Z"),
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
    return fn({ message: this.message, conversation: this.conversation });
  }
}

class FakeActivityDb implements ConversationLeadActivityDb {
  creates = 0;
  rows: Array<{
    type: string;
    meta: Record<string, unknown> | null;
  }> = [];

  leadActivity = {
    findFirst: async () => null,
    create: async ({
      data,
    }: {
      data: { type: string; meta?: unknown };
    }) => {
      this.creates += 1;
      const meta =
        data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
          ? (data.meta as Record<string, unknown>)
          : null;
      const row = { type: data.type, meta };
      this.rows.push(row);
      return { id: `act_${this.creates}`, ...row };
    },
  };
}

function smsInput(
  overrides: Partial<CreateConversationMessageInput> = {},
): CreateConversationMessageInput {
  return {
    workspaceId: "ws-1",
    leadId: "lead-1",
    channel: "SMS",
    kind: "TEXT",
    senderKind: "AGENT",
    senderUserId: "agent-1",
    senderName: "Ali Syed",
    body: "Hello from SMS",
    smsSource: "TWILIO",
    twilioMessageSid: "SM_MANUAL",
    smsFrom: "+14165550100",
    smsTo: "+14165550199",
    providerStatus: "queued",
    ...overrides,
  };
}

function presenterRow(
  overrides: Partial<AgentConversationMessageRow> = {},
): AgentConversationMessageRow {
  return {
    id: "msg_1",
    channel: "SMS",
    kind: "TEXT",
    senderKind: "AGENT",
    senderUserId: "agent-1",
    senderName: "Ali Syed",
    body: "Hi firstname",
    editedAt: null,
    deletedAt: null,
    replyToMessageId: null,
    createdAt: new Date("2026-09-20T17:00:00.000Z"),
    deliveredAt: null,
    smsSource: "TWILIO",
    providerStatus: "queued",
    payload: null,
    ...overrides,
  };
}

function testActivityHeadlines() {
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      meta: { channel: "SMS", direction: "outbound" },
    }),
    "Conversation · SMS · Sent",
  );
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      meta: { channel: "SMS", direction: "inbound" },
    }),
    "Conversation · SMS · Received",
  );
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      meta: {
        channel: "SMS",
        direction: "outbound",
        recipient: "LEAD",
        automationKey: "lead.inactive_14_days",
      },
    }),
    "Conversation · SMS · Automated",
  );
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      meta: {
        channel: "SMS",
        direction: "outbound",
        recipient: "AGENT",
        automationKey: "agent.new_lead_signup",
      },
    }),
    "SMS · Agent Notification",
  );

  const automated = conversationActivityFromLeadActivity({
    type: "SMS",
    meta: {
      channel: "SMS",
      direction: "outbound",
      recipient: "LEAD",
      automationKey: "lead.inactive_14_days",
    },
  });
  assert.equal(automated.isAutomatedLeadSms, true);
  assert.equal(automated.isAgentNotification, false);
  assert.equal(automated.automationName, "Inactive for 14 Days");

  const notify = conversationActivityFromLeadActivity({
    type: "SMS",
    conversationChannel: "SMS",
    conversationDirection: "outbound",
    automationKey: "agent.lead_unsubscribed",
    recipient: "AGENT",
  });
  assert.equal(notify.isAgentNotification, true);
  assert.equal(notify.automationName, "Lead Unsubscribed");
  assert.equal(
    conversationActivityHeadline({
      type: "SMS",
      conversationChannel: "SMS",
      conversationDirection: "outbound",
    }),
    "Conversation · SMS · Sent",
  );
}

async function testManualAndInboundActivityRecords() {
  const db = new FakeActivityDb();
  await recordSmsLeadActivity(db, {
    leadId: "lead-1",
    workspaceId: "ws-1",
    messageId: "msg-manual",
    body: "Manual SMS",
    direction: "outbound",
    userId: "agent-1",
  });
  await recordSmsLeadActivity(db, {
    leadId: "lead-1",
    workspaceId: "ws-1",
    messageId: "msg-inbound",
    body: "Customer SMS",
    direction: "inbound",
  });
  assert.equal(db.creates, 2);
  assert.equal(
    conversationActivityHeadline({ type: db.rows[0]!.type, meta: db.rows[0]!.meta }),
    "Conversation · SMS · Sent",
  );
  assert.equal(db.rows[0]!.meta?.automationKey, undefined);
  assert.equal(
    conversationActivityHeadline({ type: db.rows[1]!.type, meta: db.rows[1]!.meta }),
    "Conversation · SMS · Received",
  );
}

async function testLeadAutomationMessagePayload() {
  const db = new FakeMessageDb();
  db.addLead();
  const created = await createConversationMessage(
    db,
    smsInput({
      twilioMessageSid: "SM_AUTO",
      payload: { automationKey: "lead.inactive_14_days" },
      body: "Still here if you want to look.",
    }),
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.deepEqual(created.message.payload, {
    automationKey: "lead.inactive_14_days",
  });

  const chatRejected = await createConversationMessage(db, {
    workspaceId: "ws-1",
    leadId: "lead-1",
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "AGENT",
    senderUserId: "agent-1",
    senderName: "Ali Syed",
    body: "Chat cannot carry automation payload",
    payload: { automationKey: "lead.inactive_14_days" },
  });
  assert.equal(chatRejected.ok, false);

  const extraRejected = await createConversationMessage(
    db,
    smsInput({
      twilioMessageSid: "SM_EXTRA",
      payload: { automationKey: "lead.inactive_14_days", extra: true },
    }),
  );
  assert.equal(extraRejected.ok, false);

  const manual = await createConversationMessage(
    db,
    smsInput({ twilioMessageSid: "SM_MANUAL_2" }),
  );
  assert.equal(manual.ok, true);
  if (!manual.ok) return;
  assert.equal(manual.message.payload, null);
}

function testPresenterExposesSmsAutomationPayloadSafely() {
  const presented = presentAgentConversationMessage(
    presenterRow({
      payload: {
        automationKey: "lead.inactive_14_days",
        secret: "do-not-leak",
      },
    }),
  );
  assert.deepEqual(presented.payload, {
    automationKey: "lead.inactive_14_days",
  });
  assert.equal(
    smsAutomationTranscriptLabel(presented.payload),
    "Automated · Inactive for 14 Days",
  );
  assert.equal(
    smsAutomationTranscriptLabel({ automationKey: "lead.welcome_new_signup" }),
    "Automated · Customer Introduction",
  );
  assert.equal(
    v2SmsAutomationBadge(presented.payload),
    "Automated · Inactive for 14 Days",
  );

  const chat = presentAgentConversationMessage(
    presenterRow({
      channel: "CHAT",
      smsSource: null,
      payload: { automationKey: "lead.inactive_14_days" },
    }),
  );
  assert.equal(chat.payload, null);

  const deleted = presentAgentConversationMessage(
    presenterRow({
      deletedAt: new Date("2026-09-20T18:00:00.000Z"),
      payload: { automationKey: "lead.inactive_14_days" },
    }),
  );
  assert.equal(deleted.payload, null);
  assert.equal(presentSmsAutomationMessagePayload({ card: "ASSIGNED" }), null);
}

function testWiringAndUi() {
  const execute = read("src/lib/sms/automations/execute.ts");
  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  const timeline = read("src/components/agent/CrmTimeline.tsx");
  const presenter = read("src/lib/conversations/agent-conversation-read.ts");
  const persist = read("src/lib/conversations/create-conversation-message.ts");

  assert.ok(execute.includes("smsAutomationMessagePayload(key)"));
  assert.ok(execute.includes('recipient: "LEAD"'));
  assert.ok(execute.includes('recipient: "AGENT"'));
  const notifyFn = execute.slice(
    execute.indexOf("async function sendAgentNotification"),
    execute.indexOf("async function sendLeadAutomation"),
  );
  assert.equal(notifyFn.includes("createConversationMessage"), false);
  assert.ok(notifyFn.includes("leadActivity.create"));

  assert.ok(presenter.includes("presentSmsAutomationMessagePayload"));
  assert.ok(persist.includes("isSmsAutomationTextPayload"));
  assert.ok(pane.includes("v2SmsAutomationBadge"));
  assert.ok(pane.includes("HouzzatPRO"));
  assert.ok(timeline.includes("SMS · Agent Notification") || timeline.includes("conversationActivityHeadline"));
  assert.ok(timeline.includes("automationName"));
}

async function main() {
  testActivityHeadlines();
  await testManualAndInboundActivityRecords();
  await testLeadAutomationMessagePayload();
  testPresenterExposesSmsAutomationPayloadSafely();
  testWiringAndUi();
  console.log("sms-automation-conversation-activity-selftest: ok");
}

void main();
