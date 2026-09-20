/**
 * Agent Mass SMS: eligibility, composer, AGENT_MASS send, idempotency, allowance.
 * Run: pnpm sms-mass:selftest
 *
 * No production writes. No Stripe SMS credits. No automation trigger wiring. No deploy.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ConversationStatus,
  OrgMembershipRole,
  PlanCode,
  Role,
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceStatus,
} from "@prisma/client";
import type { AgentOrgContext } from "../src/lib/agent";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import type {
  ConversationMessageRecord,
  ConversationMessageTx,
} from "../src/lib/conversations/create-conversation-message";
import { handleInboundTwilioSms } from "../src/lib/sms/inbound";
import { SMS_MASS_V1_MAX_RECIPIENTS } from "../src/lib/sms/mass/constants";
import {
  confirmMassSms,
  drainSmsMassBatch,
  listMassSafeSmsQuickTexts,
  previewMassSms,
  type MassSmsDb,
  type SmsMassBatchRow,
  type SmsMassRecipientRow,
} from "../src/lib/sms/mass/manage";
import { SMS_QUICK_TEXT_CATALOG } from "../src/lib/sms/quick-texts/catalog";
import {
  ensureSmsQuickTextCatalog,
  updateSmsQuickText,
  type SmsQuickTextRow,
} from "../src/lib/platform/sms-quick-texts";
import type { SmsUsageEventRow } from "../src/lib/sms/usage";
import type { SendSmsResult } from "../src/lib/sms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const ORG_A = "org_a";
const LEAD_1 = "lead_one";
const LEAD_2 = "lead_two";
const LEAD_SUPPRESSED = "lead_suppressed";
const LEAD_INVALID = "lead_invalid";
const LEAD_OTHER_AGENT = "lead_other_agent";
const LEAD_CROSS = "lead_cross_tenant";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const TO_1 = "+14165550101";
const TO_2 = "+14165550102";
const TO_SUPPRESSED = "+14165550103";
const FROM = "+16475550199";
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
    workspaceName: "Houzzat Workspace",
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

function readyTwilio() {
  return {
    name: "Houzzat Workspace",
    twilioPhoneE164: FROM,
    twilioSubaccountSid: SUB_A,
    twilioMessagingServiceSid: MG_A,
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
    name: string;
    twilioPhoneE164: string | null;
    twilioSubaccountSid: string | null;
    twilioMessagingServiceSid: string | null;
  } | null;
};

class FakeMassDb {
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
  batches: SmsMassBatchRow[] = [];
  recipients: SmsMassRecipientRow[] = [];
  events: SmsUsageEventRow[] = [];
  quickTexts = new Map<string, SmsQuickTextRow>();
  quarantines: Array<{ twilioMessageSid: string }> = [];
  persistFail = false;
  smsSendCalls = 0;
  sentBodies: Array<{ to: string; body: string }> = [];
  failTo = new Set<string>();
  nextConversationId = 1;
  nextMessageId = 1;
  nextBatchId = 1;
  nextRecipientId = 1;
  nextUsageId = 1;
  nextQt = 1;
  currentSubscriptionId: string | null = "sub_1";
  plan: {
    planCode: PlanCode | null;
    entitlementProfileCode: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  } | null = {
    planCode: "TEAM",
    entitlementProfileCode: "TEAM",
    currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
  };

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedLead(input: {
    id: string;
    assignedAgentId: string | null;
    phoneE164: string | null;
    name?: string;
    workspaceId?: string;
  }) {
    const workspaceId = input.workspaceId ?? WS_A;
    const row: FakeLead = {
      id: input.id,
      workspaceId,
      organizationId: ORG_A,
      assignedAgentId: input.assignedAgentId,
      customerId: `cust_${input.id}`,
      customer: {
        id: `cust_${input.id}`,
        name: input.name ?? "Jordan Customer",
        email: `${input.id}@test.local`,
        phoneE164: input.phoneE164,
      },
      workspace:
        workspaceId === WS_B
          ? {
              name: "Other Workspace",
              twilioPhoneE164: "+16475550999",
              twilioSubaccountSid: SUB_A,
              twilioMessagingServiceSid: MG_A,
            }
          : readyTwilio(),
    };
    this.leads.set(this.leadKey(row.workspaceId, row.id), row);
    return row;
  }

  seedEligiblePair() {
    this.seedLead({
      id: LEAD_1,
      assignedAgentId: AGENT_A,
      phoneE164: TO_1,
      name: "Jordan Customer",
    });
    this.seedLead({
      id: LEAD_2,
      assignedAgentId: AGENT_A,
      phoneE164: TO_2,
      name: "Sam Neighbor",
    });
  }

  lead: MassSmsDb["lead"] = {
    findUnique: async ({ where }) => {
      const pair = (
        where as { workspaceId_id?: { workspaceId: string; id: string } }
      ).workspaceId_id;
      if (pair) {
        return this.leads.get(this.leadKey(pair.workspaceId, pair.id)) ?? null;
      }
      const id = (where as { id?: string }).id;
      if (id) {
        return [...this.leads.values()].find((row) => row.id === id) ?? null;
      }
      return null;
    },
    findMany: async (args) => {
      const where = args.where as {
        id?: { in?: string[] };
        workspaceId?: string;
        customer?: { is?: { phoneE164?: string } };
      };
      return [...this.leads.values()].filter((row) => {
        if (where.id?.in && !where.id.in.includes(row.id)) return false;
        if (where.workspaceId && row.workspaceId !== where.workspaceId) {
          return false;
        }
        const phone = where.customer?.is?.phoneE164;
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
      const now = new Date("2026-09-20T14:00:00.000Z");
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
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
          typeof data.twilioMessageSid === "string" ? data.twilioMessageSid : null,
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
      this.deadLetters.push(data);
      return data;
    },
  };

  smsMassBatch: MassSmsDb["smsMassBatch"] = {
    findUnique: async ({ where }) => {
      if ("id" in where) {
        return this.batches.find((row) => row.id === where.id) ?? null;
      }
      const key = where.workspaceId_agentUserId_clientKey;
      return (
        this.batches.find(
          (row) =>
            row.workspaceId === key.workspaceId &&
            row.agentUserId === key.agentUserId &&
            row.clientKey === key.clientKey,
        ) ?? null
      );
    },
    create: async ({ data }) => {
      const clash = this.batches.find(
        (row) =>
          row.workspaceId === data.workspaceId &&
          row.agentUserId === data.agentUserId &&
          row.clientKey === data.clientKey,
      );
      if (clash) throw uniqueError();
      const now = new Date("2026-09-20T15:00:00.000Z");
      const row: SmsMassBatchRow = {
        id: data.id ?? `batch_${this.nextBatchId++}`,
        workspaceId: data.workspaceId,
        agentUserId: data.agentUserId,
        clientKey: data.clientKey,
        body: data.body,
        status: data.status,
        requestedCount: data.requestedCount,
        eligibleCount: data.eligibleCount,
        excludedCount: data.excludedCount,
        successfulCount: data.successfulCount,
        failedCount: data.failedCount,
        estimatedSegments: data.estimatedSegments,
        createdAt: now,
        updatedAt: now,
      };
      this.batches.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = this.batches.find((item) => item.id === where.id);
      if (!row) throw new Error("missing batch");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  smsMassBatchRecipient: MassSmsDb["smsMassBatchRecipient"] = {
    findMany: async ({ where }) =>
      this.recipients.filter((row) => row.batchId === where.batchId),
    create: async ({ data }) => {
      if (
        this.recipients.some(
          (row) => row.batchId === data.batchId && row.leadId === data.leadId,
        )
      ) {
        throw uniqueError();
      }
      const row: SmsMassRecipientRow = {
        id: data.id ?? `rec_${this.nextRecipientId++}`,
        batchId: data.batchId,
        leadId: data.leadId,
        status: data.status,
        excludeReason: data.excludeReason,
        twilioMessageSid: data.twilioMessageSid,
        messageId: data.messageId,
        segmentCount: data.segmentCount,
        errorCode: data.errorCode,
        processedAt: data.processedAt,
      };
      this.recipients.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = this.recipients.find((item) => item.id === where.id);
      if (!row) throw new Error("missing recipient");
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }) => {
      const allowed =
        where.status && typeof where.status === "object" && "in" in where.status
          ? where.status.in
          : where.status
            ? [where.status]
            : null;
      let count = 0;
      for (const row of this.recipients) {
        if (row.id !== where.id) continue;
        if (allowed && !allowed.includes(row.status)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
  };

  workspace = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      if (typeof where.twilioPhoneE164 === "string") {
        if (where.twilioPhoneE164 === FROM) {
          return { id: WS_A, twilioSubaccountSid: SUB_A, currentSubscriptionId: this.currentSubscriptionId };
        }
        return null;
      }
      if (where.id === WS_A) {
        return { currentSubscriptionId: this.currentSubscriptionId };
      }
      return { currentSubscriptionId: null };
    },
  };

  subscription = {
    findUnique: async () => this.plan,
  };

  smsUsageEvent: MassSmsDb["smsUsageEvent"] = {
    findUnique: async ({ where }) =>
      this.events.find((row) => row.twilioMessageSid === where.twilioMessageSid) ??
      null,
    findMany: async ({ where }) =>
      this.events.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.periodStart.getTime() === where.periodStart.getTime() &&
          row.periodEnd.getTime() === where.periodEnd.getTime(),
      ),
    create: async ({ data }) => {
      const now = new Date("2026-09-20T12:00:00.000Z");
      const row: SmsUsageEventRow = {
        id: data.id ?? `use_${this.nextUsageId++}`,
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
        createdAt: now,
        updatedAt: now,
      };
      this.events.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = this.events.find((item) => item.id === where.id);
      if (!row) throw new Error("missing usage");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  smsQuickText = {
    findUnique: async ({ where }: { where: { id?: string; key?: string } }) => {
      if (where.key) {
        return (
          [...this.quickTexts.values()].find((row) => row.key === where.key) ?? null
        );
      }
      return where.id ? this.quickTexts.get(where.id) ?? null : null;
    },
    findMany: async (args?: object) => {
      const where = (args as { where?: { active?: boolean } } | undefined)?.where;
      let rows = [...this.quickTexts.values()];
      if (where?.active != null) {
        rows = rows.filter((row) => row.active === where.active);
      }
      return rows.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    },
    create: async ({ data }: { data: Omit<SmsQuickTextRow, "id" | "createdAt" | "updatedAt"> & { id?: string } }) => {
      const now = new Date("2026-09-20T12:00:00.000Z");
      const row: SmsQuickTextRow = {
        id: data.id ?? `qt_${this.nextQt++}`,
        key: data.key,
        name: data.name,
        category: data.category,
        body: data.body,
        sortOrder: data.sortOrder,
        active: data.active,
        allowedVariables: [...data.allowedVariables],
        createdAt: now,
        updatedAt: now,
        createdByOperatorId: data.createdByOperatorId,
        updatedByOperatorId: data.updatedByOperatorId,
      };
      this.quickTexts.set(row.id, row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<SmsQuickTextRow>;
    }) => {
      const row = this.quickTexts.get(where.id);
      if (!row) throw new Error("missing quick text");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  inboundSmsQuarantine = {
    findUnique: async ({ where }: { where: { twilioMessageSid: string } }) =>
      this.quarantines.find((row) => row.twilioMessageSid === where.twilioMessageSid)
        ? { id: where.twilioMessageSid }
        : null,
    create: async ({ data }: { data: { twilioMessageSid: string } }) => {
      this.quarantines.push({ twilioMessageSid: data.twilioMessageSid });
      return data;
    },
  };

  async $transaction<T>(fn: (tx: ConversationMessageTx) => Promise<T>): Promise<T> {
    return fn({
      message: this.message,
      conversation: this.conversation,
    });
  }

  sendSms = async (input: { to: string; body: string }): Promise<SendSmsResult> => {
    this.smsSendCalls += 1;
    if (this.failTo.has(input.to)) return { status: "failed" };
    this.sentBodies.push({ to: input.to, body: input.body });
    return {
      status: "sent",
      sid: `SM_MASS_${this.smsSendCalls}`,
      providerStatus: "queued",
      numSegments: 1,
    };
  };
}

function asDb(db: FakeMassDb) {
  return db as unknown as MassSmsDb;
}

async function confirmAndDrain(
  db: FakeMassDb,
  ctx: AgentOrgContext,
  input: { clientKey: string; leadIds: string[]; body: string },
) {
  const result = await confirmMassSms(asDb(db), ctx, input, {
    sendSms: db.sendSms,
    tickSize: 1,
  });
  if (result.ok && result.continue) {
    await drainSmsMassBatch(asDb(db), ctx, result.summary.id, {
      sendSms: db.sendSms,
      tickSize: 1,
    });
    const latest = db.batches.find((row) => row.id === result.summary.id);
    if (latest) {
      result.summary.status = latest.status;
      result.summary.successfulCount = latest.successfulCount;
      result.summary.failedCount = latest.failedCount;
      result.summary.excludedCount = latest.excludedCount;
    }
  }
  return result;
}

function testFilesAndUx() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260920020000_sms_mass_batches/migration.sql",
  );
  assert.ok(schema.includes("model SmsMassBatch"));
  assert.ok(schema.includes("model SmsMassBatchRecipient"));
  assert.ok(schema.includes("AGENT_MASS"));
  assert.ok(migration.includes("NOT APPLIED"));
  assert.equal(SMS_MASS_V1_MAX_RECIPIENTS, 25);

  const table = read("src/components/agent/LeadsTableClient.tsx");
  assert.ok(table.includes("Send SMS"));
  assert.ok(table.includes("MassSmsForm"));
  const form = read("src/components/agent/MassSmsForm.tsx");
  assert.ok(form.includes("Send to"));
  assert.ok(form.includes("eligible lead"));
  assert.ok(form.includes("approximately"));
  assert.ok(form.includes("SMS segment"));
  assert.ok(form.includes("clientKey"));
  assert.ok(form.includes("confirm: true"));
  assert.ok(form.includes("setBody(quickText.body)"));
  assert.ok(form.includes("Confirm send"));
  assert.ok(form.includes("Review send"));

  const manage = read("src/lib/sms/mass/manage.ts");
  assert.ok(manage.includes('usageCategory: "AGENT_MASS"'));
  assert.ok(manage.includes("scheduleWorkerSideEffect") === false);
  const confirmRoute = read("src/app/api/agent/leads/sms-mass/route.ts");
  assert.ok(confirmRoute.includes("scheduleWorkerSideEffect"));
  assert.ok(confirmRoute.includes("drainSmsMassBatch"));
  assert.equal(manage.includes("redis"), false);
  assert.equal(manage.includes("kafka"), false);
  assert.equal(manage.includes("Stripe"), false);

  const automations = read("src/lib/platform/sms-automations/manage.ts");
  assert.equal(automations.includes("confirmMassSms"), false);
}

async function testSelectedEligibleSend() {
  const db = new FakeMassDb();
  db.seedEligiblePair();
  await withWorkspaceRead(async () => {
    const preview = await previewMassSms(asDb(db), makeCtx(), {
      leadIds: [LEAD_1, LEAD_2],
      body: "Hi {{firstName}}, it's {{agentName}} at {{workspaceName}}.",
    });
    assert.equal(preview.selectedCount, 2);
    assert.equal(preview.eligibleCount, 2);
    assert.equal(preview.excludedCount, 0);
    const result = await confirmAndDrain(db, makeCtx(), {
      clientKey: "client-key-eligible",
      leadIds: [LEAD_1, LEAD_2],
      body: "Hi {{firstName}}, it's {{agentName}} at {{workspaceName}}.",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.summary.successfulCount, 2);
    assert.equal(result.summary.failedCount, 0);
    assert.equal(db.smsSendCalls, 2);
    assert.equal(
      db.messages.filter((row) => row.channel === "SMS" && row.senderKind === "AGENT")
        .length,
      2,
    );
    assert.equal(
      db.activities.filter((row) => row.type === "SMS").length,
      2,
    );
    assert.ok(db.events.every((row) => row.category === "AGENT_MASS"));
    assert.equal(db.events.length, 2);
    assert.ok(db.messages.every((row) => row.twilioMessageSid?.startsWith("SM_MASS_")));
    const convs = [...db.conversations.values()];
    assert.equal(convs.length, 2);
    assert.ok(convs.some((row) => row.leadId === LEAD_1));
    assert.ok(convs.some((row) => row.leadId === LEAD_2));
  });
}

async function testExclusions() {
  const db = new FakeMassDb();
  db.seedEligiblePair();
  db.seedLead({
    id: LEAD_SUPPRESSED,
    assignedAgentId: AGENT_A,
    phoneE164: TO_SUPPRESSED,
  });
  db.suppressions.add(`${WS_A}::${TO_SUPPRESSED}`);
  db.seedLead({
    id: LEAD_INVALID,
    assignedAgentId: AGENT_A,
    phoneE164: "555-0100",
  });
  db.seedLead({
    id: LEAD_OTHER_AGENT,
    assignedAgentId: AGENT_B,
    phoneE164: "+14165550104",
  });
  db.seedLead({
    id: LEAD_CROSS,
    assignedAgentId: AGENT_A,
    phoneE164: "+14165550105",
    workspaceId: WS_B,
  });

  await withWorkspaceRead(async () => {
    const preview = await previewMassSms(asDb(db), makeCtx(), {
      leadIds: [
        LEAD_1,
        LEAD_SUPPRESSED,
        LEAD_INVALID,
        LEAD_OTHER_AGENT,
        LEAD_CROSS,
        "lead_missing",
      ],
      body: "Hello from {{workspaceName}}",
    });
    assert.equal(preview.eligibleCount, 1);
    const reasons = new Set(preview.exclusionReasons.map((row) => row.reason));
    assert.ok(reasons.has("SUPPRESSED"));
    assert.ok(reasons.has("NO_CUSTOMER_E164"));
    assert.ok(reasons.has("NOT_ASSIGNED"));
    assert.ok(reasons.has("CROSS_TENANT"));
    assert.ok(reasons.has("NOT_FOUND"));

    const teamCtx = makeCtx({ canSeeTeamLeads: true });
    const teamPreview = await previewMassSms(asDb(db), teamCtx, {
      leadIds: [LEAD_OTHER_AGENT],
      body: "Hello from {{workspaceName}}",
    });
    assert.equal(teamPreview.eligibleCount, 0);
    assert.equal(teamPreview.exclusionReasons[0]?.reason, "NOT_ASSIGNED");

    const result = await confirmAndDrain(db, makeCtx(), {
      clientKey: "client-key-exclude",
      leadIds: [LEAD_1, LEAD_SUPPRESSED, LEAD_INVALID, LEAD_OTHER_AGENT, LEAD_CROSS],
      body: "Hello from {{workspaceName}}",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.summary.successfulCount, 1);
    assert.equal(result.summary.excludedCount, 4);
    assert.equal(db.smsSendCalls, 1);
  });
}

async function testInactiveQuickTextUnavailable() {
  const db = new FakeMassDb();
  await ensureSmsQuickTextCatalog({ smsQuickText: db.smsQuickText });
  const intro = [...db.quickTexts.values()].find(
    (row) => row.key === "still_looking",
  );
  assert.ok(intro);
  await updateSmsQuickText({
    db: { smsQuickText: db.smsQuickText },
    operatorId: "op_1",
    id: intro!.id,
    active: false,
  });
  const listed = await listMassSafeSmsQuickTexts(asDb(db));
  assert.equal(
    listed.some((row) => row.key === "still_looking"),
    false,
  );
  assert.equal(
    listed.some((row) => row.key === "viewing_help"),
    false,
  );
  assert.ok(listed.some((row) => row.key === "new_lead_introduction"));
  assert.equal(
    SMS_QUICK_TEXT_CATALOG.some((row) => row.key === "viewing_help"),
    true,
  );

  const preview = await previewMassSms(asDb(db), makeCtx(), {
    leadIds: [LEAD_1],
    body: "See you at {{propertyAddress}}",
  });
  assert.equal(preview.bodyValid, false);
}

async function testVariableRendering() {
  const db = new FakeMassDb();
  db.seedEligiblePair();
  await withWorkspaceRead(async () => {
    const result = await confirmAndDrain(db, makeCtx(), {
      clientKey: "client-key-vars",
      leadIds: [LEAD_1, LEAD_2],
      body: "Hi {{firstName}} / {{leadName}} — {{agentName}} @ {{workspaceName}}",
    });
    assert.equal(result.ok, true);
    const jordan = db.sentBodies.find((row) => row.to === TO_1)?.body;
    const sam = db.sentBodies.find((row) => row.to === TO_2)?.body;
    assert.equal(
      jordan,
      "Hi Jordan / Jordan Customer — Ali Agent @ Houzzat Workspace",
    );
    assert.equal(
      sam,
      "Hi Sam / Sam Neighbor — Ali Agent @ Houzzat Workspace",
    );
  });
}

async function testAllowanceBlocksBeforeSend() {
  const db = new FakeMassDb();
  db.seedEligiblePair();
  db.events.push({
    id: "use_seed",
    workspaceId: WS_A,
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    category: "AGENT_INDIVIDUAL",
    recipientType: "LEAD",
    twilioMessageSid: "SM_SEED",
    messageId: null,
    segmentCount: 499,
    segmentCountSource: "ESTIMATED",
    finalized: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await withWorkspaceRead(async () => {
    const preview = await previewMassSms(asDb(db), makeCtx(), {
      leadIds: [LEAD_1, LEAD_2],
      body: "Hi there",
    });
    assert.equal(preview.estimatedTotalSegments, 2);
    assert.equal(preview.allowancePermitted, false);
    const result = await confirmAndDrain(db, makeCtx(), {
      clientKey: "client-key-allowance",
      leadIds: [LEAD_1, LEAD_2],
      body: "Hi there",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.summary.status, "BLOCKED");
    assert.equal(db.smsSendCalls, 0);
    assert.equal(db.messages.length, 0);
  });
}

async function testPartialProviderFailure() {
  const db = new FakeMassDb();
  db.seedEligiblePair();
  db.failTo.add(TO_2);
  await withWorkspaceRead(async () => {
    const result = await confirmAndDrain(db, makeCtx(), {
      clientKey: "client-key-partial",
      leadIds: [LEAD_1, LEAD_2],
      body: "Hello both",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.summary.successfulCount, 1);
    assert.equal(result.summary.failedCount, 1);
    assert.equal(db.smsSendCalls, 2);
    assert.equal(
      db.messages.filter((row) => row.senderKind === "AGENT").length,
      1,
    );
    assert.equal(db.events.length, 1);

    const retry = await confirmAndDrain(db, makeCtx(), {
      clientKey: "client-key-partial",
      leadIds: [LEAD_1, LEAD_2],
      body: "Hello both",
    });
    assert.equal(retry.ok, true);
    if (!retry.ok) return;
    assert.equal(db.smsSendCalls, 3);
    assert.equal(
      db.messages.filter((row) => row.senderKind === "AGENT" && row.leadId === LEAD_1)
        .length,
      1,
    );
  });
}

async function testIdempotentRetryDoesNotDuplicate() {
  const db = new FakeMassDb();
  db.seedEligiblePair();
  await withWorkspaceRead(async () => {
    const first = await confirmAndDrain(db, makeCtx(), {
      clientKey: "client-key-idem",
      leadIds: [LEAD_1, LEAD_2],
      body: "One send only",
    });
    assert.equal(first.ok, true);
    assert.equal(db.smsSendCalls, 2);
    const second = await confirmAndDrain(db, makeCtx(), {
      clientKey: "client-key-idem",
      leadIds: [LEAD_1, LEAD_2],
      body: "One send only",
    });
    assert.equal(second.ok, true);
    assert.equal(db.smsSendCalls, 2);
    assert.equal(db.messages.filter((row) => row.senderKind === "AGENT").length, 2);
    assert.equal(db.batches.length, 1);
  });
}

async function testBatchLimit() {
  const db = new FakeMassDb();
  const ids = Array.from({ length: SMS_MASS_V1_MAX_RECIPIENTS + 1 }, (_, i) => `lead_${i}`);
  const preview = await previewMassSms(asDb(db), makeCtx(), {
    leadIds: ids,
    body: "Too many",
  });
  assert.equal(preview.overLimit, true);
  const result = await confirmMassSms(
    asDb(db),
    makeCtx(),
    {
      clientKey: "client-key-limit",
      leadIds: ids,
      body: "Too many",
    },
    { sendSms: db.sendSms },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "BATCH_LIMIT");
  assert.equal(db.smsSendCalls, 0);
  assert.equal(db.batches.length, 0);
}

async function testInboundReplyRoutesToLeadConversation() {
  const db = new FakeMassDb();
  db.seedEligiblePair();
  await withWorkspaceRead(async () => {
    await confirmAndDrain(db, makeCtx(), {
      clientKey: "client-key-inbound",
      leadIds: [LEAD_1],
      body: "Mass hello {{firstName}}",
    });
    const outbound = db.messages.find((row) => row.leadId === LEAD_1);
    assert.ok(outbound);
    const inbound = await handleInboundTwilioSms(
      {
        MessageSid: "SM_IN_REPLY",
        AccountSid: SUB_A,
        From: TO_1,
        To: FROM,
        Body: "Thanks, still looking",
      },
      {
        db: db as never,
        scheduleNotify: () => {},
        scheduleAssignedAgentSmsNotify: () => {},
        twilioManagesKeywordReplies: true,
      },
    );
    assert.equal(inbound.outcome, "persisted");
    const reply = db.messages.find((row) => row.twilioMessageSid === "SM_IN_REPLY");
    assert.ok(reply);
    assert.equal(reply?.leadId, LEAD_1);
    assert.equal(reply?.conversationId, outbound?.conversationId);
    assert.equal(reply?.senderKind, "CUSTOMER");
  });
}

async function main() {
  testFilesAndUx();
  await testSelectedEligibleSend();
  await testExclusions();
  await testInactiveQuickTextUnavailable();
  await testVariableRendering();
  await testAllowanceBlocksBeforeSend();
  await testPartialProviderFailure();
  await testIdempotentRetryDoesNotDuplicate();
  await testBatchLimit();
  await testInboundReplyRoutesToLeadConversation();
  console.log("sms-mass selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
