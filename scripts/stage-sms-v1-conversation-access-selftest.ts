/**
 * HouzzatPRO V1 SMS conversation access: unlock, assignment, STOP/START, notify.
 * Run: pnpm sms-v1-conversation-access:selftest
 *
 * No production writes. No Twilio network. No deploy.
 */

import assert from "node:assert/strict";
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
  evaluateAgentSmsEligibility,
  resolveAgentSmsSendEligibility,
  sendAgentLeadSmsMessage,
  type AgentSmsContextDb,
} from "../src/lib/conversations/agent-conversation-sms";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import type {
  ConversationMessageRecord,
  ConversationMessageTx,
} from "../src/lib/conversations/create-conversation-message";
import {
  handleInboundTwilioSms,
  type HandleInboundSmsDeps,
  type InboundSmsDb,
} from "../src/lib/sms/inbound";
import { isPhoneSuppressed } from "../src/lib/sms/suppression";
import {
  formatAssignedAgentInboundSmsNotification,
  resolveAssignedAgentNotifyToE164,
  type AssignedAgentInboundSmsNotifyInput,
} from "../src/lib/sms/assigned-agent-inbound-notify";
import type { NotifyAssignedAgentOfCustomerChatMessageInput } from "../src/lib/notifications/customer-chat-agent-push";

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const ORG_A = "org_a";
const LEAD_A = "lead_a";
const LEAD_B = "lead_b";
const CUST_A = "cust_a";
const CUST_B = "cust_b";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const FROM = "+14165550100";
const TO_A = "+16475550199";
const TO_B = "+16475550200";
const AGENT_CELL = "+16475550999";
const SUB_A = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MG_A = "MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

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
  const id = userId ?? AGENT_A;
  return {
    user: {
      id,
      email: `${id}@test.local`,
      name: id === AGENT_B ? "Bea Agent" : "Ali Agent",
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

class FakeDb implements InboundSmsDb, AgentSmsContextDb {
  workspaces = new Map<
    string,
    { id: string; twilioPhoneE164: string; twilioSubaccountSid: string | null }
  >();
  leads = new Map<string, FakeLead>();
  conversations = new Map<string, LeadConversationRecord>();
  messages: ConversationMessageRecord[] = [];
  suppressions = new Set<string>();
  activities: Array<{
    leadId: string;
    userId: string | null;
    type: string;
    body: string | null;
  }> = [];
  quarantines: Array<{
    twilioMessageSid: string;
    fromE164: string;
    toE164: string;
    reason: string;
    workspaceId: string | null;
  }> = [];
  deadLetters: Array<{ twilioMessageSid: string }> = [];
  nextConversationId = 1;
  nextMessageId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedWorkspace(id: string, twilioPhoneE164: string) {
    this.workspaces.set(twilioPhoneE164, {
      id,
      twilioPhoneE164,
      twilioSubaccountSid: SUB_A,
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
    const twilioPhoneE164 = input.workspaceId === WS_B ? TO_B : TO_A;
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
        twilioPhoneE164,
        twilioSubaccountSid: SUB_A,
        twilioMessagingServiceSid: MG_A,
      },
    };
    this.leads.set(this.leadKey(row.workspaceId, row.id), row);
    return row;
  }

  seedConversation(input: { id: string; workspaceId: string; leadId: string }) {
    const now = new Date("2026-09-19T16:00:00.000Z");
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

  workspace: InboundSmsDb["workspace"] = {
    findUnique: async ({ where }) => {
      if (where.twilioPhoneE164) {
        return this.workspaces.get(where.twilioPhoneE164) ?? null;
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
          this.conversations.get(
            this.leadKey(byLead.workspaceId, byLead.leadId),
          ) ?? null
        );
      }
      return null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      return this.seedConversation({
        id: `conv_${this.nextConversationId++}`,
        workspaceId: String(data.workspaceId),
        leadId: String(data.leadId),
      });
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
        leadId?: string;
        channel?: string;
        senderKind?: string;
        kind?: string;
        smsTo?: string;
      };
    }) => {
      return (
        this.messages.find((row) => {
          if (where.workspaceId && row.workspaceId !== where.workspaceId) {
            return false;
          }
          if (where.leadId && row.leadId !== where.leadId) return false;
          if (where.channel && row.channel !== where.channel) return false;
          if (where.senderKind && row.senderKind !== where.senderKind) {
            return false;
          }
          if (where.kind && row.kind !== where.kind) return false;
          if (where.smsTo && row.smsTo !== where.smsTo) return false;
          return true;
        }) ?? null
      );
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
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

  leadActivity = {
    findFirst: async () => null,
    create: async ({
      data,
    }: {
      data: {
        leadId: string;
        userId?: string | null;
        type: string;
        body?: string | null;
      };
    }) => {
      const row = {
        leadId: data.leadId,
        userId: data.userId ?? null,
        type: data.type,
        body: data.body ?? null,
      };
      this.activities.push(row);
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
      return row ? { twilioMessageSid: row.twilioMessageSid } : null;
    },
    create: async ({
      data,
    }: {
      data: {
        twilioMessageSid: string;
        fromE164: string;
        toE164: string;
        reason: string;
        workspaceId: string | null;
      };
    }) => {
      if (
        this.quarantines.some(
          (row) => row.twilioMessageSid === data.twilioMessageSid,
        )
      ) {
        throw uniqueError();
      }
      this.quarantines.push(data);
      return data;
    },
  };

  outboundSmsDeadLetter = {
    create: async ({ data }: { data: { twilioMessageSid: string } }) => {
      this.deadLetters.push({ twilioMessageSid: data.twilioMessageSid });
      return data;
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

function inbound(overrides: Record<string, string> = {}) {
  return {
    MessageSid: "SM_IN_1",
    AccountSid: SUB_A,
    From: FROM,
    To: TO_A,
    Body: "Need a showing tomorrow",
    ...overrides,
  };
}

function captureNotify() {
  const pushes: NotifyAssignedAgentOfCustomerChatMessageInput[] = [];
  const agentSms: AssignedAgentInboundSmsNotifyInput[] = [];
  return {
    pushes,
    agentSms,
    deps: {
      scheduleNotify: (input: NotifyAssignedAgentOfCustomerChatMessageInput) => {
        pushes.push(input);
      },
      scheduleAssignedAgentSmsNotify: (
        input: AssignedAgentInboundSmsNotifyInput,
      ) => {
        agentSms.push(input);
      },
    } satisfies HandleInboundSmsDeps,
  };
}

async function sendOk(
  db: FakeDb,
  ctx: AgentOrgContext,
  body = "On my way",
) {
  let sent = 0;
  const result = await sendAgentLeadSmsMessage(db, ctx, LEAD_A, body, {
    sendSms: async () => {
      sent += 1;
      return {
        status: "sent",
        sid: `SM_OUT_${sent}_${Date.now()}`,
        providerStatus: "queued",
      };
    },
  });
  return { result, sent };
}

function readyLead(db: FakeDb, assignedAgentId: string | null = AGENT_A) {
  db.seedWorkspace(WS_A, TO_A);
  db.seedLead({
    id: LEAD_A,
    workspaceId: WS_A,
    customerId: CUST_A,
    phoneE164: FROM,
    assignedAgentId,
  });
  db.seedConversation({
    id: "conv_a",
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
}

async function testAssignedAgentCanInitiateEligibleSms() {
  await withWorkspaceRead(async () => {
    const db = new FakeDb();
    readyLead(db);
    const eligibility = await resolveAgentSmsSendEligibility(
      db,
      makeCtx(),
      LEAD_A,
    );
    assert.equal(eligibility?.enabled, true);
    assert.equal(eligibility?.reason, null);
    const { result, sent } = await sendOk(db, makeCtx());
    assert.equal(result.ok, true);
    assert.equal(sent, 1);
    assert.equal(
      db.messages.filter((row) => row.senderKind === "AGENT" && row.channel === "SMS")
        .length,
      1,
    );
    assert.equal(
      db.activities.filter((row) => row.type === "SMS" && row.userId === AGENT_A)
        .length,
      1,
    );
  });
}

async function testLeadReplyUnlocksAndAssignedAgentCanReply() {
  await withWorkspaceRead(async () => {
    const db = new FakeDb();
    readyLead(db);
    const notify = captureNotify();
    const inboundResult = await handleInboundTwilioSms(inbound(), {
      db,
      ...notify.deps,
    });
    assert.equal(inboundResult.outcome, "persisted");
    assert.equal(db.messages[0]?.senderKind, "CUSTOMER");
    assert.equal(db.activities[0]?.type, "SMS");
    assert.equal(db.activities[0]?.userId, null);

    const eligibility = await resolveAgentSmsSendEligibility(
      db,
      makeCtx(),
      LEAD_A,
    );
    assert.equal(eligibility?.enabled, true);
    const { result, sent } = await sendOk(db, makeCtx(), "See you at 3");
    assert.equal(result.ok, true);
    assert.equal(sent, 1);
    assert.equal(
      db.messages.filter((row) => row.senderKind === "AGENT" && row.channel === "SMS")
        .length,
      1,
    );
    assert.equal(
      db.activities.filter((row) => row.type === "SMS" && row.userId === AGENT_A)
        .length,
      1,
    );
  });
}

async function testAnotherAgentCannot() {
  await withWorkspaceRead(async () => {
    const db = new FakeDb();
    readyLead(db);
    await handleInboundTwilioSms(inbound(), {
      db,
      ...captureNotify().deps,
    });
    const other = makeCtx({
      userId: AGENT_B,
      canSeeTeamLeads: true,
      user: {
        id: AGENT_B,
        email: "bea@test.local",
        name: "Bea Agent",
        image: null,
        phone: null,
        role: "ADMIN" as Role,
      },
    });
    const eligibility = await resolveAgentSmsSendEligibility(db, other, LEAD_A);
    assert.equal(eligibility?.enabled, false);
    assert.equal(eligibility?.reason, "NOT_ASSIGNED");
    const { result, sent } = await sendOk(db, other);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "FORBIDDEN");
    assert.equal(sent, 0);
  });
}

async function testReassignmentTransfersAccess() {
  await withWorkspaceRead(async () => {
    const db = new FakeDb();
    readyLead(db, AGENT_A);
    await handleInboundTwilioSms(inbound(), {
      db,
      ...captureNotify().deps,
    });
    const before = await resolveAgentSmsSendEligibility(db, makeCtx(), LEAD_A);
    assert.equal(before?.enabled, true);

    const lead = db.leads.get(`${WS_A}:${LEAD_A}`);
    assert.ok(lead);
    lead.assignedAgentId = AGENT_B;

    const previousSend = await sendOk(db, makeCtx());
    assert.equal(previousSend.result.ok, false);
    assert.equal(previousSend.sent, 0);

    const previousViewer = await resolveAgentSmsSendEligibility(
      db,
      makeCtx({ canSeeTeamLeads: true }),
      LEAD_A,
    );
    assert.equal(previousViewer?.enabled, false);
    assert.equal(previousViewer?.reason, "NOT_ASSIGNED");

    const next = await resolveAgentSmsSendEligibility(
      db,
      makeCtx({ userId: AGENT_B }),
      LEAD_A,
    );
    assert.equal(next?.enabled, true);
    const { result, sent } = await sendOk(
      db,
      makeCtx({ userId: AGENT_B }),
      "I have the file now",
    );
    assert.equal(result.ok, true);
    assert.equal(sent, 1);
  });
}

async function testStopLocksSending() {
  await withWorkspaceRead(async () => {
    const db = new FakeDb();
    readyLead(db);
    await handleInboundTwilioSms(inbound({ MessageSid: "SM_UNLOCK" }), {
      db,
      ...captureNotify().deps,
    });
    assert.equal(
      (await resolveAgentSmsSendEligibility(db, makeCtx(), LEAD_A))?.enabled,
      true,
    );
    await handleInboundTwilioSms(
      inbound({ Body: "STOP", MessageSid: "SM_STOP" }),
      { db },
    );
    assert.equal(await isPhoneSuppressed(WS_A, FROM, db), true);
    const eligibility = await resolveAgentSmsSendEligibility(
      db,
      makeCtx(),
      LEAD_A,
    );
    assert.equal(eligibility?.enabled, false);
    assert.equal(eligibility?.reason, "SUPPRESSED");
    const { result, sent } = await sendOk(db, makeCtx());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "SUPPRESSED");
    assert.equal(sent, 0);
  });
}

async function testStartClearsSuppressionWithoutEngagement() {
  await withWorkspaceRead(async () => {
    const db = new FakeDb();
    readyLead(db);
    const notify = captureNotify();
    const startOnly = await handleInboundTwilioSms(
      inbound({ Body: "START", MessageSid: "SM_START_ONLY" }),
      { db, ...notify.deps },
    );
    assert.equal(startOnly.outcome, "keyword_start");
    assert.equal(db.messages.length, 0);
    assert.equal(db.activities.length, 0);
    assert.equal(notify.pushes.length, 0);
    assert.equal(notify.agentSms.length, 0);
    assert.equal(
      (await resolveAgentSmsSendEligibility(db, makeCtx(), LEAD_A))?.enabled,
      true,
    );

    await handleInboundTwilioSms(inbound({ MessageSid: "SM_UNLOCK" }), {
      db,
      ...captureNotify().deps,
    });
    await handleInboundTwilioSms(
      inbound({ Body: "STOP", MessageSid: "SM_STOP" }),
      { db },
    );
    const afterStopActivities = db.activities.length;
    const afterStopMessages = db.messages.length;
    const start = await handleInboundTwilioSms(
      inbound({ Body: "START", MessageSid: "SM_START" }),
      { db, ...notify.deps },
    );
    assert.equal(start.outcome, "keyword_start");
    assert.equal(await isPhoneSuppressed(WS_A, FROM, db), false);
    assert.equal(db.messages.length, afterStopMessages);
    assert.equal(db.activities.length, afterStopActivities);
    assert.equal(
      (await resolveAgentSmsSendEligibility(db, makeCtx(), LEAD_A))?.enabled,
      true,
    );
  });
}

async function testInboundCreatesAgentNotification() {
  const db = new FakeDb();
  readyLead(db);
  const notify = captureNotify();
  const result = await handleInboundTwilioSms(inbound(), {
    db,
    ...notify.deps,
  });
  assert.equal(result.outcome, "persisted");
  assert.equal(notify.pushes.length, 1);
  assert.equal(notify.pushes[0]?.message.channel, "SMS");
  assert.equal(notify.pushes[0]?.message.senderKind, "CUSTOMER");
  assert.equal(notify.agentSms.length, 1);
  assert.equal(notify.agentSms[0]?.leadName, "Jordan Customer");
  assert.equal(notify.agentSms[0]?.replyBody, "Need a showing tomorrow");
  assert.equal(notify.agentSms[0]?.assignedAgentId, AGENT_A);
  assert.equal(notify.agentSms[0]?.leadId, LEAD_A);

  const text = formatAssignedAgentInboundSmsNotification({
    leadName: notify.agentSms[0]!.leadName,
    replyBody: notify.agentSms[0]!.replyBody,
    leadId: LEAD_A,
  });
  assert.ok(text.startsWith("Jordan Customer: Need a showing tomorrow"));
  assert.ok(text.includes(`/agent/chats?lead=${LEAD_A}`));
  assert.equal(
    resolveAssignedAgentNotifyToE164({
      agentPhoneE164: AGENT_CELL,
      agentPhone: null,
      leadPhoneE164: FROM,
    }),
    AGENT_CELL,
  );
  assert.equal(
    resolveAssignedAgentNotifyToE164({
      agentPhoneE164: FROM,
      agentPhone: null,
      leadPhoneE164: FROM,
    }),
    null,
  );
}

async function testTenantIsolation() {
  const db = new FakeDb();
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
  db.seedConversation({ id: "conv_a", workspaceId: WS_A, leadId: LEAD_A });
  db.seedConversation({ id: "conv_b", workspaceId: WS_B, leadId: LEAD_B });
  const result = await handleInboundTwilioSms(inbound({ To: TO_A }), {
    db,
    ...captureNotify().deps,
  });
  assert.equal(result.outcome, "persisted");
  assert.equal(db.messages.length, 1);
  assert.equal(db.messages[0]?.workspaceId, WS_A);
  assert.equal(db.messages[0]?.leadId, LEAD_A);
  assert.equal(
    db.messages.some((row) => row.workspaceId === WS_B || row.leadId === LEAD_B),
    false,
  );
  await withWorkspaceRead(async () => {
    const a = await resolveAgentSmsSendEligibility(db, makeCtx(), LEAD_A);
    assert.equal(a?.enabled, true);
    const bCtx = makeCtx({ workspaceId: WS_B });
    const b = await resolveAgentSmsSendEligibility(db, bCtx, LEAD_B);
    assert.equal(b?.enabled, true);
  });
}

function testEligibilityGates() {
  const ready = {
    viewerUserId: AGENT_A,
    assignedAgentId: AGENT_A,
    toE164: FROM,
    fromE164: TO_A,
    twilioSubaccountSid: SUB_A,
    twilioMessagingServiceSid: MG_A,
    suppressed: false,
  };
  assert.equal(evaluateAgentSmsEligibility(ready).enabled, true);
  assert.equal(
    evaluateAgentSmsEligibility({ ...ready, assignedAgentId: AGENT_B }).reason,
    "NOT_ASSIGNED",
  );
  assert.equal(
    evaluateAgentSmsEligibility({ ...ready, toE164: null }).reason,
    "NO_CUSTOMER_E164",
  );
  assert.equal(
    evaluateAgentSmsEligibility({
      ...ready,
      twilioMessagingServiceSid: null,
    }).reason,
    "NO_WORKSPACE_NUMBER",
  );
  assert.equal(
    evaluateAgentSmsEligibility({ ...ready, suppressed: true }).reason,
    "SUPPRESSED",
  );
}

async function main() {
  testEligibilityGates();
  await testAssignedAgentCanInitiateEligibleSms();
  await testLeadReplyUnlocksAndAssignedAgentCanReply();
  await testAnotherAgentCannot();
  await testReassignmentTransfersAccess();
  await testStopLocksSending();
  await testStartClearsSuppressionWithoutEngagement();
  await testInboundCreatesAgentNotification();
  await testTenantIsolation();
  console.log("sms-v1-conversation-access selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
