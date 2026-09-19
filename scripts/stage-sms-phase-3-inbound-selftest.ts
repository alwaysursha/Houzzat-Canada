/**
 * Twilio Two-Way SMS — Phase 3 inbound + keywords + Agent FCM.
 * Run: pnpm sms-phase-3-inbound:selftest
 *
 * No production writes. No Twilio network. No MLS sync. No deploy.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConversationStatus } from "@prisma/client";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import type {
  ConversationMessageRecord,
  ConversationMessageTx,
} from "../src/lib/conversations/create-conversation-message";
import { isPhoneSuppressed } from "../src/lib/sms/suppression";
import {
  classifyInboundSmsKeyword,
  emptyTwiml,
  keywordTwiml,
  SMS_HELP_ACK,
  SMS_START_ACK,
  SMS_STOP_ACK,
} from "../src/lib/sms/keywords";
import {
  handleInboundTwilioSms,
  INBOUND_SMS_TEXT_MAX_LENGTH,
  type HandleInboundSmsDeps,
  type InboundSmsDb,
} from "../src/lib/sms/inbound";
import { sendAgentLeadSmsMessage } from "../src/lib/conversations/agent-conversation-sms";
import type { AgentOrgContext } from "../src/lib/agent";
import type {
  OrgMembershipRole,
  Role,
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceStatus,
} from "@prisma/client";
import {
  isCustomerChatAgentPushEligible,
  type NotifyAssignedAgentOfCustomerChatMessageInput,
} from "../src/lib/notifications/customer-chat-agent-push";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const ORG_A = "org_a";
const LEAD_A = "lead_a";
const LEAD_A2 = "lead_a2";
const LEAD_B = "lead_b";
const CUST_A = "cust_a";
const CUST_B = "cust_b";
const AGENT_A = "user_agent_a";
const FROM = "+14165550100";
const TO_A = "+16475550199";
const TO_B = "+16475550200";
const SUB_A = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MG_A = "MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function uniqueError(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

type FakeLead = {
  id: string;
  workspaceId: string;
  organizationId: string | null;
  assignedAgentId: string | null;
  customerId: string | null;
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    phoneE164: string | null;
  } | null;
  workspace: {
    twilioPhoneE164: string | null;
    twilioSubaccountSid: string | null;
    twilioMessagingServiceSid: string | null;
  } | null;
};

class FakeInboundDb implements InboundSmsDb {
  workspaces = new Map<
    string,
    { id: string; twilioPhoneE164: string; twilioSubaccountSid: string | null }
  >();
  leads = new Map<string, FakeLead>();
  conversations = new Map<string, LeadConversationRecord>();
  messages: ConversationMessageRecord[] = [];
  suppressions = new Set<string>();
  quarantines: Array<{
    twilioMessageSid: string;
    fromE164: string;
    toE164: string;
    reason: string;
    workspaceId: string | null;
  }> = [];
  persistFail = false;
  nextConversationId = 1;
  nextMessageId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedWorkspace(
    id: string,
    twilioPhoneE164: string,
    twilioSubaccountSid: string | null = null,
  ) {
    this.workspaces.set(twilioPhoneE164, {
      id,
      twilioPhoneE164,
      twilioSubaccountSid,
    });
  }

  seedLead(input: {
    id: string;
    workspaceId: string;
    assignedAgentId?: string | null;
    customerId: string;
    customerName?: string;
    phoneE164: string;
  }) {
    const row: FakeLead = {
      id: input.id,
      workspaceId: input.workspaceId,
      organizationId: ORG_A,
      assignedAgentId: input.assignedAgentId ?? AGENT_A,
      customerId: input.customerId,
      customer: {
        id: input.customerId,
        name: input.customerName ?? "Jordan Customer",
        email: "jordan@test.local",
        phoneE164: input.phoneE164,
      },
      workspace: {
        twilioPhoneE164: input.workspaceId === WS_B ? TO_B : TO_A,
        twilioSubaccountSid: SUB_A,
        twilioMessagingServiceSid: MG_A,
      },
    };
    this.leads.set(this.leadKey(row.workspaceId, row.id), row);
    return row;
  }

  seedConversation(input: { id: string; workspaceId: string; leadId: string }) {
    const now = new Date("2026-09-19T15:00:00.000Z");
    const row: LeadConversationRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      status: "OPEN" as ConversationStatus,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      customerLastReadAt: null,
      agentLastReadAt: null,
      agentLastReadByUserId: null,
    };
    this.conversations.set(this.leadKey(row.workspaceId, row.leadId), row);
    return row;
  }

  seedOutboundSms(input: {
    leadId: string;
    workspaceId: string;
    conversationId: string;
    toE164: string;
    createdAt: Date;
  }) {
    const row: ConversationMessageRecord = {
      id: `msg_${this.nextMessageId++}`,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      leadId: input.leadId,
      channel: "SMS",
      kind: "TEXT",
      senderKind: "AGENT",
      senderUserId: AGENT_A,
      senderName: "Ali Agent",
      createdByUserId: AGENT_A,
      body: "Earlier outbound",
      createdAt: input.createdAt,
      deliveredAt: null,
      smsSource: "TWILIO",
      twilioMessageSid: `SM_OUT_${this.nextMessageId}`,
      providerStatus: "delivered",
      smsFrom: TO_A,
      smsTo: input.toE164,
      payload: null,
    };
    this.messages.push(row);
    return row;
  }

  workspace: InboundSmsDb["workspace"] = {
    findUnique: async ({ where }) => {
      if (where.twilioPhoneE164) {
        return this.workspaces.get(where.twilioPhoneE164) ?? null;
      }
      if (where.id) {
        return (
          [...this.workspaces.values()].find((row) => row.id === where.id) ??
          null
        );
      }
      return null;
    },
  };

  lead: InboundSmsDb["lead"] = {
    findUnique: async ({ where }) => {
      const pair = where.workspaceId_id;
      if (pair) {
        return this.leads.get(this.leadKey(pair.workspaceId, pair.id)) ?? null;
      }
      if (where.id) {
        return [...this.leads.values()].find((row) => row.id === where.id) ?? null;
      }
      return null;
    },
    findMany: async ({ where }) => {
      const workspaceId = where.workspaceId as string | undefined;
      const phone = where.customer?.is?.phoneE164 as string | undefined;
      return [...this.leads.values()].filter((row) => {
        if (workspaceId && row.workspaceId !== workspaceId) return false;
        if (phone && row.customer?.phoneE164 !== phone) return false;
        return true;
      });
    },
  };

  conversation = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const byLead = where.workspaceId_leadId as
        | { workspaceId: string; leadId: string }
        | undefined;
      if (byLead) {
        return (
          this.conversations.get(this.leadKey(byLead.workspaceId, byLead.leadId)) ??
          null
        );
      }
      return null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const workspaceId = String(data.workspaceId);
      const leadId = String(data.leadId);
      const now = new Date("2026-09-19T15:00:00.000Z");
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
      this.conversations.set(this.leadKey(workspaceId, leadId), row);
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
        (item) => item.workspaceId === pair.workspaceId && item.id === pair.id,
      );
      if (!row) throw new Error("missing conversation");
      Object.assign(row, data);
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
    findFirst: async ({
      where,
    }: {
      where: {
        workspaceId?: string;
        channel?: string;
        smsTo?: string;
      };
    }) => {
      const rows = this.messages.filter((row) => {
        if (where.workspaceId && row.workspaceId !== where.workspaceId) {
          return false;
        }
        if (where.channel && row.channel !== where.channel) return false;
        if (where.smsTo && row.smsTo !== where.smsTo) return false;
        return true;
      });
      rows.sort((a, b) => {
        const byTime = b.createdAt.getTime() - a.createdAt.getTime();
        if (byTime !== 0) return byTime;
        return b.id.localeCompare(a.id);
      });
      return rows[0] ?? null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (this.persistFail) throw new Error("db down");
      if (
        typeof data.twilioMessageSid === "string" &&
        this.messages.some((row) => row.twilioMessageSid === data.twilioMessageSid)
      ) {
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
          typeof data.createdByUserId === "string" ? data.createdByUserId : null,
        body: typeof data.body === "string" ? data.body : null,
        createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(),
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

  smsSuppression = {
    findUnique: async ({
      where,
    }: {
      where: {
        workspaceId_phoneE164: { workspaceId: string; phoneE164: string };
      };
    }) => {
      const key = `${where.workspaceId_phoneE164.workspaceId}::${where.workspaceId_phoneE164.phoneE164}`;
      return this.suppressions.has(key) ? { id: key } : null;
    },
    upsert: async ({
      where,
    }: {
      where: {
        workspaceId_phoneE164: { workspaceId: string; phoneE164: string };
      };
    }) => {
      const key = `${where.workspaceId_phoneE164.workspaceId}::${where.workspaceId_phoneE164.phoneE164}`;
      this.suppressions.add(key);
      return { id: key };
    },
    deleteMany: async ({
      where,
    }: {
      where: { workspaceId: string; phoneE164: string };
    }) => {
      const key = `${where.workspaceId}::${where.phoneE164}`;
      const had = this.suppressions.delete(key);
      return { count: had ? 1 : 0 };
    },
  };

  inboundSmsQuarantine = {
    findUnique: async ({
      where,
    }: {
      where: { twilioMessageSid: string };
    }) => {
      const row = this.quarantines.find(
        (item) => item.twilioMessageSid === where.twilioMessageSid,
      );
      return row ? { id: row.twilioMessageSid } : null;
    },
    create: async ({
      data,
    }: {
      data: {
        twilioMessageSid: string;
        fromE164: string;
        toE164: string;
        reason: string;
        workspaceId?: string | null;
      };
    }) => {
      if (this.quarantines.some((row) => row.twilioMessageSid === data.twilioMessageSid)) {
        throw uniqueError();
      }
      this.quarantines.push({
        twilioMessageSid: data.twilioMessageSid,
        fromE164: data.fromE164,
        toE164: data.toE164,
        reason: data.reason,
        workspaceId: data.workspaceId ?? null,
      });
      return data;
    },
  };

  async $transaction<T>(fn: (tx: ConversationMessageTx) => Promise<T>): Promise<T> {
    return fn({
      message: this.message,
      conversation: this.conversation,
    });
  }
}

function inbound(overrides: Record<string, string> = {}) {
  return {
    MessageSid: "SM_IN_1",
    From: FROM,
    To: TO_A,
    Body: "On my way",
    ...overrides,
  };
}

function captureNotify() {
  const pushes: NotifyAssignedAgentOfCustomerChatMessageInput[] = [];
  return {
    pushes,
    deps: {
      scheduleNotify: (input: NotifyAssignedAgentOfCustomerChatMessageInput) => {
        pushes.push(input);
      },
    } satisfies HandleInboundSmsDeps,
  };
}

function testKeywordsAndBoundaries() {
  assert.equal(classifyInboundSmsKeyword("stop"), "STOP");
  assert.equal(classifyInboundSmsKeyword(" STOPALL "), "STOP");
  assert.equal(classifyInboundSmsKeyword("unsubscribe"), "STOP");
  assert.equal(classifyInboundSmsKeyword("start"), "START");
  assert.equal(classifyInboundSmsKeyword("UNSTOP"), "START");
  assert.equal(classifyInboundSmsKeyword("yes"), null);
  assert.equal(classifyInboundSmsKeyword("YES"), null);
  assert.equal(classifyInboundSmsKeyword("Yes"), null);
  assert.equal(classifyInboundSmsKeyword("help"), "HELP");
  assert.equal(classifyInboundSmsKeyword("INFO"), "HELP");
  assert.equal(classifyInboundSmsKeyword("please stop"), null);
  assert.equal(classifyInboundSmsKeyword("On my way"), null);
  assert.ok(keywordTwiml("STOP", false).includes(SMS_STOP_ACK));
  assert.equal(keywordTwiml("STOP", true), emptyTwiml());
  assert.ok(keywordTwiml("START", false).includes(SMS_START_ACK));
  assert.ok(keywordTwiml("HELP", false).includes(SMS_HELP_ACK));

  assert.ok(
    existsSync(join(root, "src/app/api/webhooks/twilio/inbound/route.ts")),
  );
  const route = read("src/app/api/webhooks/twilio/inbound/route.ts");
  assert.ok(route.includes("validateTwilioRequestSignature"));
  assert.ok(route.includes("resolveTwilioInboundWebhookUrl"));
  assert.ok(route.includes("handleInboundTwilioSms"));
  assert.ok(route.includes("text/xml"));
  assert.equal(route.includes("prisma.lead.create"), false);
  const inboundSrc = read("src/lib/sms/inbound.ts");
  assert.equal(inboundSrc.includes("smsAlertsEnabled"), false);
  assert.equal(inboundSrc.includes("lead.create"), false);
  assert.ok(inboundSrc.includes('channel: "SMS"'));
  assert.ok(inboundSrc.includes('senderKind: "CUSTOMER"'));
  const customer = read("src/lib/conversations/customer-conversation.ts");
  assert.ok(customer.includes('channel: "CHAT"'));
  const customerUi = read("src/components/customer-chat/CustomerChatScreen.tsx");
  assert.equal(customerUi.includes("Send SMS"), false);
}

async function testUnknownWorkspaceQuarantine() {
  const db = new FakeInboundDb();
  const notify = captureNotify();
  const result = await handleInboundTwilioSms(inbound(), {
    db,
    ...notify.deps,
  });
  assert.equal(result.outcome, "unknown_workspace");
  assert.equal(db.messages.length, 0);
  assert.equal(db.quarantines[0]?.reason, "unknown_workspace");
  assert.equal(notify.pushes.length, 0);
}

async function testUnknownCustomerQuarantine() {
  const db = new FakeInboundDb();
  db.seedWorkspace(WS_A, TO_A);
  const withDb = await handleInboundTwilioSms(inbound(), { db });
  assert.equal(withDb.outcome, "unknown_customer");
  assert.equal(db.messages.length, 0);
  assert.equal(db.conversations.size, 0);
  assert.equal(db.quarantines[0]?.reason, "unknown_customer");
  assert.equal(db.quarantines[0]?.workspaceId, WS_A);
}

async function testPersistsOnExistingConversationAndNotifies() {
  const db = new FakeInboundDb();
  db.seedWorkspace(WS_A, TO_A);
  db.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
  });
  db.seedConversation({
    id: "conv_existing",
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  const notify = captureNotify();
  const result = await handleInboundTwilioSms(inbound(), {
    db,
    ...notify.deps,
  });
  assert.equal(result.outcome, "persisted");
  assert.equal(db.messages.length, 1);
  assert.equal(db.messages[0]?.channel, "SMS");
  assert.equal(db.messages[0]?.smsSource, "TWILIO");
  assert.equal(db.messages[0]?.senderKind, "CUSTOMER");
  assert.equal(db.messages[0]?.conversationId, "conv_existing");
  assert.equal(db.messages[0]?.leadId, LEAD_A);
  assert.equal(db.messages[0]?.workspaceId, WS_A);
  assert.equal(db.messages[0]?.twilioMessageSid, "SM_IN_1");
  assert.equal(db.messages[0]?.smsFrom, FROM);
  assert.equal(db.messages[0]?.smsTo, TO_A);
  assert.equal(db.messages[0]?.body, "On my way");
  assert.equal(db.messages[0]?.senderName, "Jordan Customer");
  assert.equal(notify.pushes.length, 1);
  assert.equal(notify.pushes[0]?.message.channel, "SMS");
  assert.equal(notify.pushes[0]?.message.senderKind, "CUSTOMER");
  assert.equal(notify.pushes[0]?.created, true);
  assert.equal(notify.pushes[0]?.trustedWorkspaceId, WS_A);

  const dup = await handleInboundTwilioSms(inbound(), {
    db,
    ...notify.deps,
  });
  assert.equal(dup.outcome, "duplicate");
  assert.equal(db.messages.length, 1);
  assert.equal(notify.pushes.length, 1);
}

async function testTenantIsolationSamePhone() {
  const db = new FakeInboundDb();
  db.seedWorkspace(WS_A, TO_A);
  db.seedWorkspace(WS_B, TO_B);
  db.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
  });
  db.seedLead({
    id: LEAD_B,
    workspaceId: WS_B,
    customerId: CUST_B,
    customerName: "Other Tenant",
    phoneE164: FROM,
  });
  db.seedConversation({
    id: "conv_a",
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  db.seedConversation({
    id: "conv_b",
    workspaceId: WS_B,
    leadId: LEAD_B,
  });
  const result = await handleInboundTwilioSms(inbound({ To: TO_A }), {
    db,
    scheduleNotify: () => {},
  });
  assert.equal(result.outcome, "persisted");
  assert.equal(db.messages.length, 1);
  assert.equal(db.messages[0]?.workspaceId, WS_A);
  assert.equal(db.messages[0]?.leadId, LEAD_A);
  assert.equal(
    db.messages.some((row) => row.workspaceId === WS_B || row.leadId === LEAD_B),
    false,
  );
}

async function testAmbiguousAndTieBreak() {
  const ambiguous = new FakeInboundDb();
  ambiguous.seedWorkspace(WS_A, TO_A);
  ambiguous.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
  });
  ambiguous.seedLead({
    id: LEAD_A2,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
  });
  const quarantined = await handleInboundTwilioSms(inbound(), { db: ambiguous });
  assert.equal(quarantined.outcome, "ambiguous_customer");
  assert.equal(ambiguous.messages.length, 0);
  assert.equal(ambiguous.quarantines[0]?.reason, "ambiguous_customer");

  const tied = new FakeInboundDb();
  tied.seedWorkspace(WS_A, TO_A);
  tied.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
  });
  tied.seedLead({
    id: LEAD_A2,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
  });
  tied.seedConversation({
    id: "conv_a",
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  tied.seedConversation({
    id: "conv_a2",
    workspaceId: WS_A,
    leadId: LEAD_A2,
  });
  tied.seedOutboundSms({
    leadId: LEAD_A2,
    workspaceId: WS_A,
    conversationId: "conv_a2",
    toE164: FROM,
    createdAt: new Date("2026-09-19T14:00:00.000Z"),
  });
  const routed = await handleInboundTwilioSms(inbound({ MessageSid: "SM_TIE" }), {
    db: tied,
    scheduleNotify: () => {},
  });
  assert.equal(routed.outcome, "persisted");
  assert.equal(tied.messages.filter((row) => row.senderKind === "CUSTOMER").length, 1);
  assert.equal(
    tied.messages.find((row) => row.twilioMessageSid === "SM_TIE")?.leadId,
    LEAD_A2,
  );
}

async function testStopStartHelp() {
  const db = new FakeInboundDb();
  db.seedWorkspace(WS_A, TO_A);
  db.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
  });
  db.seedConversation({
    id: "conv_existing",
    workspaceId: WS_A,
    leadId: LEAD_A,
  });

  const stop = await handleInboundTwilioSms(inbound({ Body: "STOP", MessageSid: "SM_STOP" }), {
    db,
    twilioManagesKeywordReplies: false,
  });
  assert.equal(stop.outcome, "keyword_stop");
  assert.ok(stop.twiml.includes(SMS_STOP_ACK));
  assert.equal(db.messages.length, 0);
  assert.equal(await isPhoneSuppressed(WS_A, FROM, db), true);
  assert.equal(db.quarantines[0]?.reason, "keyword_stop");
  assert.equal(db.quarantines[0]?.workspaceId, WS_A);

  const stopDup = await handleInboundTwilioSms(
    inbound({ Body: "STOP", MessageSid: "SM_STOP" }),
    { db, twilioManagesKeywordReplies: false },
  );
  assert.equal(stopDup.outcome, "duplicate");
  assert.equal(stopDup.twiml, emptyTwiml());

  const help = await handleInboundTwilioSms(
    inbound({ Body: "HELP", MessageSid: "SM_HELP" }),
    { db, twilioManagesKeywordReplies: false },
  );
  assert.equal(help.outcome, "keyword_help");
  assert.ok(help.twiml.includes(SMS_HELP_ACK));
  assert.equal(db.messages.length, 0);
  assert.equal(db.conversations.size, 1);

  const start = await handleInboundTwilioSms(
    inbound({ Body: "START", MessageSid: "SM_START" }),
    { db, twilioManagesKeywordReplies: false },
  );
  assert.equal(start.outcome, "keyword_start");
  assert.ok(start.twiml.includes(SMS_START_ACK));
  assert.equal(await isPhoneSuppressed(WS_A, FROM, db), false);

  const managed = await handleInboundTwilioSms(
    inbound({ Body: "STOP", MessageSid: "SM_STOP2" }),
    { db, twilioManagesKeywordReplies: true },
  );
  assert.equal(managed.outcome, "keyword_stop");
  assert.equal(managed.twiml, emptyTwiml());
}

async function testYesIsNormalInboundSms() {
  const db = new FakeInboundDb();
  db.seedWorkspace(WS_A, TO_A);
  db.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
    assignedAgentId: AGENT_A,
  });
  db.seedConversation({
    id: "conv_existing",
    workspaceId: WS_A,
    leadId: LEAD_A,
  });

  const ctx = {
    user: {
      id: AGENT_A,
      email: "agent@test.local",
      name: "Ali Agent",
      image: null,
      phone: null,
      role: "AGENT" as Role,
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
  } satisfies AgentOrgContext;

  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  try {
    const outbound = await sendAgentLeadSmsMessage(
      db as never,
      ctx,
      LEAD_A,
      "Would 3:00 PM work?",
      {
        sendSms: async () => ({
          status: "sent",
          sid: "SM_ASK_TIME",
          providerStatus: "queued",
        }),
      },
    );
    assert.equal(outbound.ok, true);
    if (!outbound.ok) return;
    assert.equal(outbound.data.conversation.id, "conv_existing");
    assert.equal(outbound.data.message.channel, "SMS");
    assert.equal(outbound.data.message.body, "Would 3:00 PM work?");

    const suppressedBefore = await isPhoneSuppressed(WS_A, FROM, db);
    assert.equal(suppressedBefore, false);

    const notify = captureNotify();
    const inboundYes = await handleInboundTwilioSms(
      inbound({ Body: "Yes", MessageSid: "SM_YES_1" }),
      { db, ...notify.deps, twilioManagesKeywordReplies: false },
    );
    assert.equal(inboundYes.outcome, "persisted");
    assert.equal(inboundYes.twiml, emptyTwiml());
    assert.equal(inboundYes.twiml.includes(SMS_START_ACK), false);

    const yesRow = db.messages.find((row) => row.twilioMessageSid === "SM_YES_1");
    assert.ok(yesRow);
    assert.equal(yesRow?.channel, "SMS");
    assert.equal(yesRow?.body, "Yes");
    assert.equal(yesRow?.senderKind, "CUSTOMER");
    assert.equal(yesRow?.leadId, LEAD_A);
    assert.equal(yesRow?.conversationId, "conv_existing");
    assert.equal(yesRow?.workspaceId, WS_A);
    assert.equal(
      db.messages.every((row) => row.conversationId === "conv_existing"),
      true,
    );
    assert.equal(await isPhoneSuppressed(WS_A, FROM, db), false);
    assert.equal(notify.pushes.length, 1);
    assert.equal(
      isCustomerChatAgentPushEligible(notify.pushes[0]!),
      true,
    );
    assert.equal(notify.pushes[0]?.message.body, "Yes");
    assert.equal(notify.pushes[0]?.message.channel, "SMS");

    const replay = await handleInboundTwilioSms(
      inbound({ Body: "Yes", MessageSid: "SM_YES_1" }),
      { db, ...notify.deps },
    );
    assert.equal(replay.outcome, "duplicate");
    assert.equal(
      db.messages.filter((row) => row.twilioMessageSid === "SM_YES_1").length,
      1,
    );
    assert.equal(notify.pushes.length, 1);
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
  }
}

async function testStopBlocksLaterOutbound() {
  const db = new FakeInboundDb();
  db.seedWorkspace(WS_A, TO_A);
  db.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
    assignedAgentId: AGENT_A,
  });
  db.seedConversation({
    id: "conv_existing",
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  await handleInboundTwilioSms(inbound({ Body: "stop", MessageSid: "SM_STOP3" }), {
    db,
  });
  const ctx = {
    user: {
      id: AGENT_A,
      email: "agent@test.local",
      name: "Ali Agent",
      image: null,
      phone: null,
      role: "AGENT" as Role,
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
  } satisfies AgentOrgContext;

  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  try {
    const blocked = await sendAgentLeadSmsMessage(db as never, ctx, LEAD_A, "Hi", {
      sendSms: async () => {
        throw new Error("must not send");
      },
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.reason, "SUPPRESSED");
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
  }
}

async function testInvalidAndTooLong() {
  const db = new FakeInboundDb();
  db.seedWorkspace(WS_A, TO_A);
  const invalid = await handleInboundTwilioSms(
    { MessageSid: "SM1", From: "not-a-phone", To: TO_A, Body: "Hi" },
    { db },
  );
  assert.equal(invalid.outcome, "invalid_payload");
  assert.equal(db.quarantines.length, 0);

  const tooLong = await handleInboundTwilioSms(
    inbound({
      MessageSid: "SM_LONG",
      Body: "x".repeat(INBOUND_SMS_TEXT_MAX_LENGTH + 1),
    }),
    { db },
  );
  assert.equal(tooLong.outcome, "body_too_long");
  assert.equal(db.quarantines[0]?.reason, "body_too_long");
  assert.equal(db.messages.length, 0);
}

async function testFcmFailureStillPersists() {
  const db = new FakeInboundDb();
  db.seedWorkspace(WS_A, TO_A);
  db.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
  });
  const result = await handleInboundTwilioSms(inbound({ MessageSid: "SM_FCM" }), {
    db,
    scheduleNotify: () => {
      throw new Error("fcm down");
    },
  });
  assert.equal(result.outcome, "persisted");
  assert.equal(db.messages.length, 1);
}

async function main() {
  testKeywordsAndBoundaries();
  await testUnknownWorkspaceQuarantine();
  await testUnknownCustomerQuarantine();
  await testPersistsOnExistingConversationAndNotifies();
  await testTenantIsolationSamePhone();
  await testAmbiguousAndTieBreak();
  await testStopStartHelp();
  await testYesIsNormalInboundSms();
  await testStopBlocksLaterOutbound();
  await testInvalidAndTooLong();
  await testFcmFailureStillPersists();
  console.log("sms-phase-3-inbound selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
