/**
 * Twilio Two-Way SMS — Phase 2 outbound + status + Agent UI.
 * Run: pnpm sms-phase-2-outbound:selftest
 *
 * No production writes. No Twilio network. No MLS sync. No deploy.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  agentChatSendRequestSchema,
  agentConversationSendRequestSchema,
  sendAgentLeadChatMessage,
} from "../src/lib/conversations/agent-conversation-send";
import {
  evaluateAgentSmsEligibility,
  sendAgentLeadSmsMessage,
  type AgentSmsContextDb,
} from "../src/lib/conversations/agent-conversation-sms";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import type {
  ConversationMessageRecord,
  ConversationMessageTx,
} from "../src/lib/conversations/create-conversation-message";
import { applyTwilioStatusCallback } from "../src/lib/sms/status-callback";
import type { SmsUsageEventRow } from "../src/lib/sms/usage";
import {
  parseTwilioFormBody,
  validateTwilioRequestSignature,
} from "../src/lib/sms/signature";
import { recordOutboundSmsDeadLetter } from "../src/lib/sms/dead-letter";
import { v2SmsDeliveryLabel } from "../src/lib/agent/lead-profile-v2/chat-query";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const ORG_A = "org_a";
const LEAD_A = "lead_in_workspace_a";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const TO = "+14165550100";
const FROM = "+16475550199";
const SUB_A = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MG_A = "MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function readyTwilio(phoneE164: string | null = FROM) {
  return {
    twilioPhoneE164: phoneE164,
    twilioSubaccountSid: phoneE164 ? SUB_A : null,
    twilioMessagingServiceSid: phoneE164 ? MG_A : null,
  };
}

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

type FakeLead = {
  id: string;
  workspaceId: string;
  organizationId: string | null;
  assignedAgentId: string | null;
  customer: { phoneE164: string | null; phone?: string | null } | null;
  workspace: {
    twilioPhoneE164: string | null;
    twilioSubaccountSid: string | null;
    twilioMessagingServiceSid: string | null;
  } | null;
};

class FakeSmsDb implements AgentSmsContextDb {
  leads = new Map<string, FakeLead>();
  conversations = new Map<string, LeadConversationRecord>();
  messages: ConversationMessageRecord[] = [];
  suppressions = new Set<string>();
  activities: Array<{
    leadId: string;
    userId: string | null;
    type: string;
    body: string | null;
    meta: unknown;
  }> = [];
  deadLetters: Array<{ twilioMessageSid: string; workspaceId: string; leadId: string }> =
    [];
  usageEvents: Array<{
    id: string;
    workspaceId: string;
    category: string;
    recipientType: string;
    twilioMessageSid: string | null;
    messageId: string | null;
    segmentCount: number;
    segmentCountSource: string;
    finalized: boolean;
    periodStart: Date;
    periodEnd: Date;
  }> = [];
  persistFail = false;
  smsSendCalls = 0;
  nextConversationId = 1;
  nextMessageId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedInboundCustomerSms(input: {
    leadId?: string;
    workspaceId?: string;
    conversationId?: string;
    fromE164?: string;
    toE164?: string;
    body?: string;
  } = {}) {
    const workspaceId = input.workspaceId ?? WS_A;
    const leadId = input.leadId ?? LEAD_A;
    const conversation =
      this.conversations.get(this.leadKey(workspaceId, leadId)) ??
      this.seedConversation({
        id: input.conversationId ?? "conv_existing",
        workspaceId,
        leadId,
      });
    const row: ConversationMessageRecord = {
      id: `msg_${this.nextMessageId++}`,
      workspaceId,
      conversationId: conversation.id,
      leadId,
      channel: "SMS",
      kind: "TEXT",
      senderKind: "CUSTOMER",
      senderUserId: "cust_a",
      senderName: "Jordan Customer",
      createdByUserId: null,
      body: input.body ?? "Earlier inbound",
      createdAt: new Date("2026-09-19T13:00:00.000Z"),
      deliveredAt: null,
      smsSource: "TWILIO",
      twilioMessageSid: `SM_IN_${this.nextMessageId}`,
      providerStatus: "received",
      smsFrom: input.fromE164 ?? TO,
      smsTo: input.toE164 ?? FROM,
      payload: null,
    };
    this.messages.push(row);
    return row;
  }

  seedLead(input: Partial<FakeLead> & { assignedAgentId: string | null }) {
    const row: FakeLead = {
      id: input.id ?? LEAD_A,
      workspaceId: input.workspaceId ?? WS_A,
      organizationId: input.organizationId ?? ORG_A,
      assignedAgentId: input.assignedAgentId,
      customer: input.customer ?? { phoneE164: TO },
      workspace: input.workspace ?? readyTwilio(FROM),
    };
    this.leads.set(this.leadKey(row.workspaceId, row.id), row);
    return row;
  }

  seedConversation(
    overrides: Partial<LeadConversationRecord> &
      Pick<LeadConversationRecord, "id" | "workspaceId" | "leadId">,
  ) {
    const now = new Date("2026-09-19T14:00:00.000Z");
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

  lead: AgentSmsContextDb["lead"] = {
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
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const workspaceId = String(data.workspaceId);
      const leadId = String(data.leadId);
      const now = new Date("2026-09-19T14:00:00.000Z");
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
        (item) =>
          item.workspaceId === pair.workspaceId && item.id === pair.id,
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
      const rows = this.messages.filter((row) => {
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

  leadActivity = {
    create: async ({
      data,
    }: {
      data: {
        leadId: string;
        userId?: string | null;
        type: string;
        body?: string | null;
        meta?: unknown;
      };
    }) => {
      const row = {
        leadId: data.leadId,
        userId: data.userId ?? null,
        type: data.type,
        body: data.body ?? null,
        meta: data.meta ?? null,
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
    upsert: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };

  outboundSmsDeadLetter = {
    create: async ({
      data,
    }: {
      data: { twilioMessageSid: string; workspaceId: string; leadId: string };
    }) => {
      if (this.deadLetters.some((row) => row.twilioMessageSid === data.twilioMessageSid)) {
        throw uniqueError();
      }
      this.deadLetters.push({
        twilioMessageSid: data.twilioMessageSid,
        workspaceId: data.workspaceId,
        leadId: data.leadId,
      });
      return data;
    },
  };

  workspace = {
    findUnique: async ({
      where,
    }: {
      where: { id: string };
    }) =>
      where.id
        ? { currentSubscriptionId: "sub_legacy" }
        : null,
  };

  subscription = {
    findUnique: async () => ({
      planCode: null,
      entitlementProfileCode: "HOUZZAT_LEGACY",
      currentPeriodStart: null,
      currentPeriodEnd: null,
    }),
  };

  smsUsageEvent = {
    findUnique: async ({
      where,
    }: {
      where: { twilioMessageSid: string };
    }) =>
      this.usageEvents.find((row) => row.twilioMessageSid === where.twilioMessageSid) ??
      null,
    findMany: async ({
      where,
    }: {
      where: { workspaceId: string; periodStart: Date; periodEnd: Date };
    }) =>
      this.usageEvents.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.periodStart.getTime() === where.periodStart.getTime() &&
          row.periodEnd.getTime() === where.periodEnd.getTime(),
      ),
    create: async ({
      data,
    }: {
      data: {
        id?: string;
        workspaceId: string;
        periodStart: Date;
        periodEnd: Date;
        category: string;
        recipientType: string;
        twilioMessageSid: string | null;
        messageId: string | null;
        segmentCount: number;
        segmentCountSource: string;
        finalized: boolean;
      };
    }) => {
      const row = {
        id: data.id ?? `use_${this.usageEvents.length + 1}`,
        workspaceId: data.workspaceId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        category: data.category,
        recipientType: data.recipientType,
        twilioMessageSid: data.twilioMessageSid,
        messageId: data.messageId,
        segmentCount: data.segmentCount,
        segmentCountSource: data.segmentCountSource,
        finalized: data.finalized,
      };
      this.usageEvents.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<{
        segmentCount: number;
        segmentCountSource: string;
        finalized: boolean;
        messageId: string | null;
      }>;
    }) => {
      const row = this.usageEvents.find((item) => item.id === where.id);
      if (!row) throw new Error("missing usage");
      Object.assign(row, data);
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

function testSchemaAndBoundaries() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260919193000_sms_phase2_outbound_dead_letter/migration.sql",
  );
  assert.ok(schema.includes("model OutboundSmsDeadLetter"));
  assert.ok(schema.includes("twilioMessageSid String   @unique"));
  assert.ok(migration.includes("NOT APPLIED"));
  assert.equal(
    /model OutboundSmsDeadLetter[\s\S]*?body\s+String/.test(
      schema.split("model OutboundSmsDeadLetter")[1]?.split("model ")[0] ?? "",
    ),
    false,
  );
  assert.equal(
    existsSync(join(root, "src/app/api/webhooks/twilio/inbound/route.ts")),
    true,
  );
  assert.ok(
    existsSync(join(root, "src/app/api/webhooks/twilio/status/route.ts")),
  );
  const statusRoute = read("src/app/api/webhooks/twilio/status/route.ts");
  assert.ok(statusRoute.includes("NumSegments: params.NumSegments"));
  const callback = read("src/lib/sms/status-callback.ts");
  assert.ok(callback.includes("shouldApplyTwilioProviderStatus"));
  assert.ok(callback.includes("updateMany"));

  const send = read("src/lib/conversations/agent-conversation-send.ts");
  assert.ok(send.includes('channel: "CHAT"'));
  assert.ok(send.includes("agentConversationSendRequestSchema"));
  const sms = read("src/lib/conversations/agent-conversation-sms.ts");
  assert.ok(sms.includes('smsClass: "conversational"'));
  assert.equal(sms.includes("smsAlertsEnabled"), false);
  const route = read(
    "src/app/api/agent/leads/[id]/conversation/messages/route.ts",
  );
  assert.ok(route.includes('parsed.data.channel ?? "CHAT"'));
  assert.ok(route.includes("sendAgentLeadSmsMessage"));

  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.ok(pane.includes('useState<"CHAT" | "SMS">("CHAT")'));
  assert.ok(pane.includes(">Chat</button>") || pane.includes("Chat"));
  assert.ok(pane.includes(">SMS</button>") || pane.includes("SMS"));
  const customer = read("src/lib/conversations/customer-conversation.ts");
  assert.ok(customer.includes('channel: "CHAT"'));
  const customerUi = read("src/components/customer-chat/CustomerChatScreen.tsx");
  assert.equal(customerUi.includes("Send SMS"), false);
  const agentRead = read("src/lib/conversations/agent-conversation-read.ts");
  assert.equal(agentRead.includes('channel: "CHAT"'), false);
}

function testChatSchemaDefault() {
  const omitted = agentConversationSendRequestSchema.safeParse({
    body: "Hello",
  });
  assert.equal(omitted.success, true);
  if (omitted.success) assert.equal(omitted.data.channel, undefined);
  const chat = agentConversationSendRequestSchema.safeParse({
    body: "Hello",
    channel: "CHAT",
  });
  assert.equal(chat.success, true);
  const sms = agentConversationSendRequestSchema.safeParse({
    body: "Hello",
    channel: "SMS",
  });
  assert.equal(sms.success, true);
  const customer = agentChatSendRequestSchema.safeParse({
    body: "Hello",
    channel: "SMS",
  });
  assert.equal(customer.success, false);
}

function unlockedReady(overrides: {
  viewerUserId?: string;
  assignedAgentId?: string | null;
  toE164?: string | null;
  fromE164?: string | null;
  twilioSubaccountSid?: string | null;
  twilioMessagingServiceSid?: string | null;
  suppressed?: boolean;
} = {}) {
  return {
    viewerUserId: AGENT_A,
    assignedAgentId: AGENT_A,
    toE164: TO,
    fromE164: FROM,
    twilioSubaccountSid: SUB_A,
    twilioMessagingServiceSid: MG_A,
    suppressed: false,
    ...overrides,
  };
}

function testEligibility() {
  const assigned = evaluateAgentSmsEligibility(unlockedReady());
  assert.equal(assigned.enabled, true);
  assert.equal(
    evaluateAgentSmsEligibility(
      unlockedReady({ viewerUserId: AGENT_B }),
    ).reason,
    "NOT_ASSIGNED",
  );
  assert.equal(
    evaluateAgentSmsEligibility(unlockedReady({ toE164: null })).reason,
    "NO_CUSTOMER_E164",
  );
  assert.equal(
    evaluateAgentSmsEligibility(
      unlockedReady({
        fromE164: null,
        twilioSubaccountSid: undefined,
        twilioMessagingServiceSid: undefined,
      }),
    ).reason,
    "NO_WORKSPACE_NUMBER",
  );
  assert.equal(
    evaluateAgentSmsEligibility(
      unlockedReady({
        twilioSubaccountSid: undefined,
        twilioMessagingServiceSid: undefined,
      }),
    ).reason,
    "NO_WORKSPACE_NUMBER",
  );
  assert.equal(
    evaluateAgentSmsEligibility(unlockedReady({ suppressed: true })).reason,
    "SUPPRESSED",
  );
}

function sign(url: string, params: Record<string, string>, token: string) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

function testSignatureAndStatus() {
  const url = "https://houzzat.com/api/webhooks/twilio/status";
  const params = { MessageSid: "SM1", MessageStatus: "delivered" };
  const token = "auth-token";
  assert.equal(
    validateTwilioRequestSignature({
      authToken: token,
      signature: sign(url, params, token),
      url,
      params,
    }),
    true,
  );
  assert.equal(
    validateTwilioRequestSignature({
      authToken: token,
      signature: sign(url, params, "other"),
      url,
      params,
    }),
    false,
  );
  const parsed = parseTwilioFormBody("MessageSid=SM1&MessageStatus=sent");
  assert.equal(parsed.MessageSid, "SM1");
}

async function testStatusCallbackUpdates() {
  const rows = new Map<
    string,
    {
      id: string;
      workspaceId: string;
      deliveredAt: Date | null;
      providerStatus: string | null;
    }
  >();
  const usageEvents: SmsUsageEventRow[] = [];
  rows.set("SM1", {
    id: "msg_1",
    workspaceId: WS_A,
    deliveredAt: null,
    providerStatus: "queued",
  });
  const db = {
    message: {
      findUnique: async ({ where }: { where: { twilioMessageSid: string } }) =>
        rows.get(where.twilioMessageSid) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          OR?: Array<
            { providerStatus: null } | { providerStatus: { in: string[] } }
          >;
        };
        data: { providerStatus?: string; deliveredAt?: Date };
      }) => {
        const row = [...rows.values()].find((item) => item.id === where.id);
        if (!row) return { count: 0 };
        const allowed = where.OR;
        if (allowed) {
          const ok = allowed.some((clause) => {
            if ("providerStatus" in clause && clause.providerStatus === null) {
              return row.providerStatus == null;
            }
            if (
              "providerStatus" in clause &&
              clause.providerStatus &&
              typeof clause.providerStatus === "object" &&
              "in" in clause.providerStatus
            ) {
              return (
                row.providerStatus != null &&
                clause.providerStatus.in.includes(row.providerStatus)
              );
            }
            return false;
          });
          if (!ok) return { count: 0 };
        }
        if (data.providerStatus) row.providerStatus = data.providerStatus;
        if (data.deliveredAt) row.deliveredAt = data.deliveredAt;
        return { count: 1 };
      },
    },
    smsUsageEvent: {
      findUnique: async ({ where }: { where: { twilioMessageSid: string } }) =>
        usageEvents.find((row) => row.twilioMessageSid === where.twilioMessageSid) ??
        null,
      findMany: async () => usageEvents,
      create: async () => {
        throw new Error("status callback must not create usage");
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<SmsUsageEventRow>;
      }) => {
        const row = usageEvents.find((item) => item.id === where.id);
        if (!row) throw new Error("missing usage");
        Object.assign(row, data);
        return row;
      },
    },
  };

  assert.equal(
    await applyTwilioStatusCallback({ MessageSid: "SM_UNKNOWN", MessageStatus: "sent" }, db),
    "unknown",
  );
  assert.equal(
    await applyTwilioStatusCallback({ MessageSid: "SM1", MessageStatus: "sent" }, db),
    "updated",
  );
  assert.equal(rows.get("SM1")?.providerStatus, "sent");
  assert.equal(rows.get("SM1")?.deliveredAt, null);
  assert.equal(
    await applyTwilioStatusCallback({ MessageSid: "SM1", MessageStatus: "delivered" }, db),
    "updated",
  );
  const deliveredAt = rows.get("SM1")?.deliveredAt;
  assert.ok(deliveredAt);
  assert.equal(rows.get("SM1")?.providerStatus, "delivered");
  assert.equal(
    await applyTwilioStatusCallback({ MessageSid: "SM1", MessageStatus: "delivered" }, db),
    "unchanged",
  );
  assert.equal(rows.get("SM1")?.deliveredAt, deliveredAt);

  assert.equal(
    await applyTwilioStatusCallback({ MessageSid: "SM1", MessageStatus: "queued" }, db),
    "unchanged",
  );
  assert.equal(rows.get("SM1")?.providerStatus, "delivered");
  assert.equal(rows.get("SM1")?.deliveredAt, deliveredAt);
  assert.equal(
    await applyTwilioStatusCallback({ MessageSid: "SM1", MessageStatus: "sent" }, db),
    "unchanged",
  );
  assert.equal(rows.get("SM1")?.providerStatus, "delivered");
  assert.equal(
    await applyTwilioStatusCallback({ MessageSid: "SM1", MessageStatus: "failed" }, db),
    "unchanged",
  );
  assert.equal(rows.get("SM1")?.providerStatus, "delivered");
  assert.equal(rows.get("SM1")?.deliveredAt, deliveredAt);

  rows.set("SM2", {
    id: "msg_2",
    workspaceId: WS_A,
    deliveredAt: null,
    providerStatus: "queued",
  });
  assert.equal(
    await applyTwilioStatusCallback(
      { MessageSid: "SM2", MessageStatus: "undelivered" },
      db,
    ),
    "updated",
  );
  assert.equal(rows.get("SM2")?.providerStatus, "undelivered");
  assert.equal(rows.get("SM2")?.deliveredAt, null);
  assert.equal(
    await applyTwilioStatusCallback({ MessageSid: "SM2", MessageStatus: "queued" }, db),
    "unchanged",
  );
  assert.equal(rows.get("SM2")?.providerStatus, "undelivered");

  rows.set("SM3", {
    id: "msg_3",
    workspaceId: WS_A,
    deliveredAt: null,
    providerStatus: "queued",
  });
  usageEvents.push({
    id: "use_3",
    workspaceId: WS_A,
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    category: "AGENT_INDIVIDUAL",
    recipientType: "LEAD",
    twilioMessageSid: "SM3",
    messageId: "msg_3",
    segmentCount: 1,
    segmentCountSource: "ESTIMATED",
    finalized: false,
    createdAt: new Date("2026-09-20T15:27:33.000Z"),
    updatedAt: new Date("2026-09-20T15:27:33.000Z"),
  });
  assert.equal(
    await applyTwilioStatusCallback(
      {
        MessageSid: "SM3",
        MessageStatus: "delivered",
        NumSegments: "2",
      },
      db,
    ),
    "updated",
  );
  assert.equal(rows.get("SM3")?.providerStatus, "delivered");
  assert.equal(usageEvents[0]?.segmentCount, 2);
  assert.equal(usageEvents[0]?.segmentCountSource, "PROVIDER");
  assert.equal(usageEvents[0]?.finalized, true);
  assert.equal(usageEvents.length, 1);
  assert.equal(
    await applyTwilioStatusCallback(
      {
        MessageSid: "SM3",
        MessageStatus: "queued",
        NumSegments: "2",
      },
      db,
    ),
    "unchanged",
  );
  assert.equal(rows.get("SM3")?.providerStatus, "delivered");
  assert.equal(usageEvents.length, 1);
  assert.equal(usageEvents[0]?.segmentCount, 2);

  rows.set("SM4", {
    id: "msg_4",
    workspaceId: WS_A,
    deliveredAt: new Date("2026-09-20T15:27:34.000Z"),
    providerStatus: "delivered",
  });
  assert.equal(
    await applyTwilioStatusCallback({ MessageSid: "SM4", MessageStatus: "queued" }, db),
    "unchanged",
  );
  assert.equal(rows.get("SM4")?.providerStatus, "delivered");
  assert.ok(rows.get("SM4")?.deliveredAt);
}

async function sendSmsOk() {
  return {
    status: "sent" as const,
    sid: "SM_OUT",
    providerStatus: "queued",
  };
}

async function testAgentOutboundSms() {
  await withWorkspaceRead(async () => {
    const db = new FakeSmsDb();
    db.seedLead({ assignedAgentId: AGENT_A });
    db.seedConversation({
      id: "conv_existing",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    db.seedInboundCustomerSms();

    const locked = new FakeSmsDb();
    locked.seedLead({ assignedAgentId: AGENT_A });
    locked.seedConversation({
      id: "conv_existing",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    const beforeReply = await sendAgentLeadSmsMessage(
      locked,
      makeCtx(),
      LEAD_A,
      "Hello SMS",
      {
        sendSms: async () => {
          locked.smsSendCalls += 1;
          return sendSmsOk();
        },
      },
    );
    assert.equal(beforeReply.ok, true);
    assert.equal(locked.smsSendCalls, 1);

    const chat = await sendAgentLeadChatMessage(
      db,
      makeCtx(),
      LEAD_A,
      "Chat stays default",
    );
    assert.equal(chat.ok, true);
    if (chat.ok) assert.equal(chat.data.message.channel, "CHAT");

    const sms = await sendAgentLeadSmsMessage(db, makeCtx(), LEAD_A, "Hello SMS", {
      sendSms: async () => {
        db.smsSendCalls += 1;
        return sendSmsOk();
      },
    });
    assert.equal(sms.ok, true);
    if (!sms.ok) return;
    assert.equal(sms.data.conversation.id, "conv_existing");
    assert.equal(sms.data.message.channel, "SMS");
    assert.equal(sms.data.message.smsSource, "TWILIO");
    assert.equal(sms.data.message.providerStatus, "queued");
    const smsRows = db.messages.filter(
      (row) => row.channel === "SMS" && row.senderKind === "AGENT",
    );
    assert.equal(smsRows.length, 1);
    assert.equal(smsRows[0]?.twilioMessageSid, "SM_OUT");
    assert.equal(smsRows[0]?.conversationId, "conv_existing");
    assert.equal(db.usageEvents.length, 1);
    assert.equal(db.usageEvents[0]?.category, "AGENT_INDIVIDUAL");
    assert.equal(db.usageEvents[0]?.twilioMessageSid, "SM_OUT");
    assert.equal(db.usageEvents[0]?.messageId, sms.data.message.id);
    assert.equal(db.usageEvents[0]?.segmentCount >= 1, true);
    assert.equal(
      db.activities.filter((row) => row.type === "SMS" && row.userId === AGENT_A)
        .length,
      1,
    );
    assert.equal(db.messages.some((row) => row.channel === "CHAT"), true);

    const drifted = new FakeSmsDb();
    drifted.seedLead({
      assignedAgentId: AGENT_A,
      customer: { phone: "416-555-0199", phoneE164: "+16473613654" },
    });
    let driftedTo: string | null = null;
    const driftedSend = await sendAgentLeadSmsMessage(
      drifted,
      makeCtx(),
      LEAD_A,
      "Use the current number",
      {
        sendSms: async (input) => {
          driftedTo = input.to;
          return sendSmsOk();
        },
      },
    );
    assert.equal(driftedSend.ok, true);
    assert.equal(driftedTo, "+14165550199");

    const staleUnparseable = new FakeSmsDb();
    staleUnparseable.seedLead({
      assignedAgentId: AGENT_A,
      customer: { phone: "64722214949", phoneE164: "+16473613654" },
    });
    const blockedStale = await sendAgentLeadSmsMessage(
      staleUnparseable,
      makeCtx(),
      LEAD_A,
      "Do not use leftover E.164",
      { sendSms: async () => sendSmsOk() },
    );
    assert.equal(blockedStale.ok, false);
    if (!blockedStale.ok) assert.equal(blockedStale.reason, "NO_CUSTOMER_E164");


    const duplicateSid = await sendAgentLeadSmsMessage(
      db,
      makeCtx(),
      LEAD_A,
      "Hello SMS again",
      {
        sendSms: async () => {
          db.smsSendCalls += 1;
          return sendSmsOk();
        },
      },
    );
    assert.equal(duplicateSid.ok, true);
    assert.equal(
      db.messages.filter(
        (row) => row.channel === "SMS" && row.senderKind === "AGENT",
      ).length,
      1,
    );
    assert.equal(db.usageEvents.length, 1);

    const unauthorized = await sendAgentLeadSmsMessage(
      db,
      makeCtx({ userId: AGENT_B }),
      LEAD_A,
      "Nope",
      {
        sendSms: async () => {
          throw new Error("sms must not send");
        },
      },
    );
    assert.equal(unauthorized.ok, false);
    if (!unauthorized.ok) assert.equal(unauthorized.reason, "LEAD_NOT_FOUND");

    const viewerForbidden = await sendAgentLeadSmsMessage(
      db,
      makeCtx({
        userId: AGENT_B,
        canSeeTeamLeads: true,
        user: {
          id: AGENT_B,
          email: "admin@test.local",
          name: "Admin",
          image: null,
          phone: null,
          role: "ADMIN" as Role,
        },
      }),
      LEAD_A,
      "Nope",
      {
        sendSms: async () => {
          throw new Error("sms must not send");
        },
      },
    );
    assert.equal(viewerForbidden.ok, false);
    if (!viewerForbidden.ok) assert.equal(viewerForbidden.reason, "FORBIDDEN");

    const noPhone = new FakeSmsDb();
    noPhone.seedLead({
      assignedAgentId: AGENT_A,
      customer: { phoneE164: null },
    });
    const blockedPhone = await sendAgentLeadSmsMessage(
      noPhone,
      makeCtx(),
      LEAD_A,
      "Hi",
      { sendSms: async () => sendSmsOk() },
    );
    assert.equal(blockedPhone.ok, false);
    if (!blockedPhone.ok) assert.equal(blockedPhone.reason, "NO_CUSTOMER_E164");

    const noFrom = new FakeSmsDb();
    noFrom.seedLead({
      assignedAgentId: AGENT_A,
      workspace: readyTwilio(null),
    });
    const blockedFrom = await sendAgentLeadSmsMessage(
      noFrom,
      makeCtx(),
      LEAD_A,
      "Hi",
      { sendSms: async () => sendSmsOk() },
    );
    assert.equal(blockedFrom.ok, false);
    if (!blockedFrom.ok) {
      assert.equal(blockedFrom.reason, "NO_WORKSPACE_NUMBER");
    }

    const suppressed = new FakeSmsDb();
    suppressed.seedLead({ assignedAgentId: AGENT_A });
    suppressed.suppressions.add(`${WS_A}::${TO}`);
    const blockedStop = await sendAgentLeadSmsMessage(
      suppressed,
      makeCtx(),
      LEAD_A,
      "Hi",
      { sendSms: async () => sendSmsOk() },
    );
    assert.equal(blockedStop.ok, false);
    if (!blockedStop.ok) assert.equal(blockedStop.reason, "SUPPRESSED");

    const isolated = new FakeSmsDb();
    isolated.seedLead({
      assignedAgentId: AGENT_A,
      workspaceId: WS_B,
      id: LEAD_A,
    });
    const otherWs = await sendAgentLeadSmsMessage(
      isolated,
      makeCtx(),
      LEAD_A,
      "Hi",
      { sendSms: async () => sendSmsOk() },
    );
    assert.equal(otherWs.ok, false);
    if (!otherWs.ok) assert.equal(otherWs.reason, "LEAD_NOT_FOUND");

    const inner = new FakeSmsDb();
    inner.seedLead({ assignedAgentId: AGENT_A });
    inner.seedConversation({
      id: "conv_proxy",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    const proxy = new Proxy({} as FakeSmsDb, {
      get(_target, prop) {
        const value = inner[prop as keyof FakeSmsDb];
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(inner)
          : value;
      },
    });
    assert.equal("smsUsageEvent" in proxy, false);
    const proxied = await sendAgentLeadSmsMessage(
      proxy,
      makeCtx(),
      LEAD_A,
      "Proxy usage SMS",
      {
        sendSms: async () => ({
          status: "sent" as const,
          sid: "SM_PROXY",
          providerStatus: "queued",
          numSegments: 1,
        }),
      },
    );
    assert.equal(proxied.ok, true);
    assert.equal(inner.usageEvents.length, 1);
    assert.equal(inner.usageEvents[0]?.category, "AGENT_INDIVIDUAL");
    assert.equal(inner.usageEvents[0]?.twilioMessageSid, "SM_PROXY");
    assert.equal(inner.usageEvents[0]?.segmentCount, 1);
    assert.equal(inner.usageEvents[0]?.segmentCountSource, "PROVIDER");
  });
}

async function testDeadLetterNoResend() {
  await withWorkspaceRead(async () => {
    const db = new FakeSmsDb();
    db.seedLead({ assignedAgentId: AGENT_A });
    db.seedConversation({
      id: "conv_existing",
      workspaceId: WS_A,
      leadId: LEAD_A,
    });
    db.seedInboundCustomerSms();
    db.persistFail = true;
    const result = await sendAgentLeadSmsMessage(
      db,
      makeCtx(),
      LEAD_A,
      "Hello SMS",
      {
        sendSms: async () => {
          db.smsSendCalls += 1;
          return sendSmsOk();
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "SMS_SENT_NOT_SAVED");
    assert.equal(db.smsSendCalls, 1);
    assert.equal(
      db.messages.filter((row) => row.senderKind === "AGENT").length,
      0,
    );
    assert.equal(db.deadLetters.length, 1);
    assert.equal(db.deadLetters[0]?.twilioMessageSid, "SM_OUT");

    const dup = await recordOutboundSmsDeadLetter(
      {
        twilioMessageSid: "SM_OUT",
        workspaceId: WS_A,
        leadId: LEAD_A,
        fromE164: FROM,
        toE164: TO,
        reason: "persist_failed_after_send",
      },
      db,
    );
    assert.equal(dup, "duplicate");
  });
}

function testUiHelpers() {
  assert.equal(
    v2SmsDeliveryLabel({
      channel: "CHAT",
      deliveredAt: null,
      providerStatus: "sent",
    }),
    null,
  );
  assert.equal(
    v2SmsDeliveryLabel({
      channel: "SMS",
      deliveredAt: null,
      providerStatus: "sent",
    }),
    "Sent",
  );
  assert.equal(
    v2SmsDeliveryLabel({
      channel: "SMS",
      deliveredAt: "2026-09-19T14:00:00.000Z",
      providerStatus: "failed",
    }),
    "Delivered",
  );
}

async function main() {
  testSchemaAndBoundaries();
  testChatSchemaDefault();
  testEligibility();
  testSignatureAndStatus();
  await testStatusCallbackUpdates();
  await testAgentOutboundSms();
  await testDeadLetterNoResend();
  testUiHelpers();
  console.log("sms-phase-2-outbound selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
