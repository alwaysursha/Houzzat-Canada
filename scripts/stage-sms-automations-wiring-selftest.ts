/**
 * SMS automation production wiring.
 * Run: pnpm sms-automations-wiring:selftest
 *
 * No production writes. No MLS sync. No Stripe credits. No deploy.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ConversationStatus,
  PlanCode,
} from "@prisma/client";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import { conversationActivityHeadline } from "../src/lib/agent/conversation-activity";
import {
  smsAutomationDisplayName,
  smsAutomationTranscriptLabel,
} from "../src/lib/platform/sms-automations/catalog";
import type {
  ConversationMessageRecord,
  ConversationMessageTx,
} from "../src/lib/conversations/create-conversation-message";
import { handleInboundTwilioSms } from "../src/lib/sms/inbound";
import { selectLeadReturnedInactivityBucket } from "../src/lib/platform/sms-automations/buckets";
import { ensureSmsAutomationCatalog } from "../src/lib/platform/sms-automations";
import type {
  SmsAutomationDefinitionRow,
  SmsAutomationVersionRow,
} from "../src/lib/platform/sms-automations/manage";
import {
  completedInactiveDays,
  SMS_AUTOMATION_KEYS,
} from "../src/lib/sms/automations";
import { becameFirstValidCustomerE164, isRetryableCustomerIntroductionSkip } from "../src/lib/sms/automations/customer-introduction";
import { smsAutomationLeadProfileUrl } from "../src/lib/sms/automations/urls";
import { resolveAssignedAgentNotifyDestination } from "../src/lib/sms/assigned-agent-inbound-notify";
import { runInactiveLeadSmsAutomations } from "../src/lib/sms/automations/inactive";
import {
  runAgentNewLeadSignupSms,
  runCustomerIntroductionSmsAutomation,
  runLeadReturnedSmsAutomations,
  runSignupSmsAutomations,
  runUnsubscribeSmsAutomations,
  runViewingRequestedSmsAutomation,
} from "../src/lib/sms/automations/triggers";
import type {
  SmsAutomationDispatchRow,
  SmsAutomationExecuteDb,
} from "../src/lib/sms/automations/execute";
import type { LastCustomerActivityDb } from "../src/lib/sms/automations/activity";
import type { SmsUsageEventRow } from "../src/lib/sms/usage";
import {
  inspectSmsAllowance,
  SMS_MANUAL_USAGE_CATEGORIES,
} from "../src/lib/sms/usage";
import type { SendSmsResult } from "../src/lib/sms/types";

/** Test helper: agent signup SMS + customer welcome (product splits these). */
async function runSignupWithWelcome(
  leadId: string,
  deps: Parameters<typeof runSignupSmsAutomations>[1],
) {
  await runAgentNewLeadSignupSms(leadId, deps);
  await runCustomerIntroductionSmsAutomation(leadId, deps);
}

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_a";
const WS_B = "ws_b";
const LEAD_A = "lead_a";
const LEAD_B = "lead_b";
const CUST_A = "cust_a";
const AGENT_A = "agent_a";
const TO_LEAD = "+14165550101";
const TO_AGENT = "+16475550001";
const FROM = "+16475550199";
const SUB_A = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MG_A = "MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function uniqueError(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

type FakeLead = {
  id: string;
  workspaceId: string | null;
  assignedAgentId: string | null;
  customerId: string | null;
  createdAt: Date;
  listingMls: string | null;
  customer: {
    id?: string | null;
    name: string | null;
    email: string | null;
    phoneE164: string | null;
    phone: string | null;
  } | null;
  assignedAgent: {
    id: string;
    name: string | null;
    email: string;
    phoneE164: string | null;
    phone: string | null;
    disabledAt: Date | null;
  } | null;
  workspace: {
    id: string;
    name: string;
    twilioPhoneE164: string | null;
    twilioSubaccountSid: string | null;
    twilioMessagingServiceSid: string | null;
  } | null;
};

class FakeAutomationDb {
  leads = new Map<string, FakeLead>();
  conversations = new Map<string, LeadConversationRecord>();
  messages: ConversationMessageRecord[] = [];
  suppressions = new Set<string>();
  activities: Array<{ leadId: string; type: string; body: string | null; meta: unknown; userId: string | null }> =
    [];
  dispatches: SmsAutomationDispatchRow[] = [];
  definitions = new Map<string, SmsAutomationDefinitionRow>();
  versions: SmsAutomationVersionRow[] = [];
  events: SmsUsageEventRow[] = [];
  visitors = new Map<string, Date>();
  activityEvents: Array<{ userId: string; type: string; createdAt: Date }> = [];
  listings = new Map<string, { addressLine: string; city: string }>();
  smsSendCalls = 0;
  sent: Array<{ to: string; body: string; smsClass: string; workspaceId?: string | null }> =
    [];
  failNext = false;
  nextConv = 1;
  nextMsg = 1;
  nextDisp = 1;
  nextUse = 1;
  nextDef = 1;
  nextVer = 1;
  currentSubscriptionId: string | null = "sub_1";
  plan = {
    planCode: "TEAM" as PlanCode,
    entitlementProfileCode: "TEAM",
    currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
  };

  seedLead(overrides: Partial<FakeLead> = {}) {
    const row: FakeLead = {
      id: overrides.id ?? LEAD_A,
      workspaceId: overrides.workspaceId ?? WS_A,
      assignedAgentId: overrides.assignedAgentId ?? AGENT_A,
      customerId: overrides.customerId ?? CUST_A,
      createdAt: overrides.createdAt ?? new Date("2026-08-01T00:00:00.000Z"),
      listingMls: overrides.listingMls ?? "W1234567",
      customer: overrides.customer ?? {
        id: CUST_A,
        name: "Jordan Customer",
        email: "jordan@test.local",
        phoneE164: TO_LEAD,
        phone: TO_LEAD,
      },
      assignedAgent: overrides.assignedAgent ?? {
        id: AGENT_A,
        name: "Ali Agent",
        email: "agent@test.local",
        phoneE164: TO_AGENT,
        phone: TO_AGENT,
        disabledAt: null,
      },
      workspace: overrides.workspace ?? {
        id: WS_A,
        name: "Houzzat Workspace",
        twilioPhoneE164: FROM,
        twilioSubaccountSid: SUB_A,
        twilioMessagingServiceSid: MG_A,
      },
    };
    this.leads.set(row.id, row);
    return row;
  }

  lead = {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; workspaceId_id?: { workspaceId: string; id: string } };
    }) => {
      const compound = where.workspaceId_id;
      if (compound) {
        const row = this.leads.get(compound.id);
        if (!row || row.workspaceId !== compound.workspaceId) return null;
        return row;
      }
      return where.id ? this.leads.get(where.id) ?? null : null;
    },
    findMany: async (args: {
      where?: Record<string, unknown>;
      skip?: number;
      take?: number;
    }) => {
      const where = args.where ?? {};
      const customerFilter =
        where.customer &&
        typeof where.customer === "object" &&
        where.customer &&
        "is" in (where.customer as object)
          ? ((where.customer as { is?: { phoneE164?: string } }).is ?? null)
          : null;
      let rows = [...this.leads.values()].filter((row) => {
        if (typeof where.id === "string" && row.id !== where.id) return false;
        if (typeof where.customerId === "string" && row.customerId !== where.customerId) {
          return false;
        }
        if (typeof where.workspaceId === "string" && row.workspaceId !== where.workspaceId) {
          return false;
        }
        if (where.assignedAgentId && typeof where.assignedAgentId === "object") {
          if ("not" in (where.assignedAgentId as object) && !row.assignedAgentId) {
            return false;
          }
        }
        if (where.workspaceId && typeof where.workspaceId === "object") {
          if ("not" in (where.workspaceId as object) && !row.workspaceId) {
            return false;
          }
        }
        if (
          where.createdAt &&
          typeof where.createdAt === "object" &&
          where.createdAt &&
          "lte" in (where.createdAt as object)
        ) {
          const lte = (where.createdAt as { lte: Date }).lte;
          if (row.createdAt > lte) return false;
        }
        if (customerFilter?.phoneE164 && row.customer?.phoneE164 !== customerFilter.phoneE164) {
          return false;
        }
        return true;
      });
      rows.sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
      );
      if (args.skip) rows = rows.slice(args.skip);
      if (typeof args.take === "number") rows = rows.slice(0, args.take);
      return rows;
    },
  };

  listing = {
    findUnique: async ({ where }: { where: { mlsNumber: string } }) =>
      this.listings.get(where.mlsNumber) ?? null,
  };

  smsAutomationDefinition = {
    findUnique: async ({ where }: { where: { key?: string; id?: string } }) => {
      if (where.key) {
        return (
          [...this.definitions.values()].find((row) => row.key === where.key) ??
          null
        );
      }
      return where.id ? this.definitions.get(where.id) ?? null : null;
    },
    findMany: async () => [...this.definitions.values()],
    create: async ({ data }: { data: Omit<SmsAutomationDefinitionRow, "id" | "createdAt" | "updatedAt"> & { id?: string } }) => {
      const now = new Date();
      const row: SmsAutomationDefinitionRow = {
        id: data.id ?? `def_${this.nextDef++}`,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      this.definitions.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<SmsAutomationDefinitionRow> }) => {
      const row = this.definitions.get(where.id);
      if (!row) throw new Error("missing def");
      Object.assign(row, data);
      return row;
    },
  };

  smsAutomationVersion = {
    findMany: async ({ where }: { where: { definitionId: string; status?: string } }) =>
      this.versions.filter(
        (row) =>
          row.definitionId === where.definitionId &&
          (!where.status || row.status === where.status),
      ),
    findFirst: async ({ where }: { where: { definitionId: string; status?: string } }) =>
      this.versions.find(
        (row) =>
          row.definitionId === where.definitionId &&
          (!where.status || row.status === where.status),
      ) ?? null,
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.versions.find((row) => row.id === where.id) ?? null,
    create: async ({ data }: { data: Omit<SmsAutomationVersionRow, "id"> & { id?: string } }) => {
      const row: SmsAutomationVersionRow = {
        id: data.id ?? `ver_${this.nextVer++}`,
        ...data,
      };
      this.versions.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<SmsAutomationVersionRow> }) => {
      const row = this.versions.find((item) => item.id === where.id);
      if (!row) throw new Error("missing ver");
      Object.assign(row, data);
      return row;
    },
  };

  smsAutomationDispatch: SmsAutomationExecuteDb["smsAutomationDispatch"] = {
    findUnique: async ({ where }) => {
      const key = where.workspaceId_leadId_automationKey_cycleKey;
      return (
        this.dispatches.find(
          (row) =>
            row.workspaceId === key.workspaceId &&
            row.leadId === key.leadId &&
            row.automationKey === key.automationKey &&
            row.cycleKey === key.cycleKey,
        ) ?? null
      );
    },
    create: async ({ data }) => {
      const clash = this.dispatches.find(
        (row) =>
          row.workspaceId === data.workspaceId &&
          row.leadId === data.leadId &&
          row.automationKey === data.automationKey &&
          row.cycleKey === data.cycleKey,
      );
      if (clash) throw uniqueError();
      const now = new Date();
      const row: SmsAutomationDispatchRow = {
        id: data.id ?? `disp_${this.nextDisp++}`,
        workspaceId: data.workspaceId,
        leadId: data.leadId,
        automationKey: data.automationKey,
        cycleKey: data.cycleKey,
        status: data.status,
        twilioMessageSid: data.twilioMessageSid,
        messageId: data.messageId,
        errorCode: data.errorCode,
        createdAt: now,
        updatedAt: now,
        processedAt: data.processedAt,
      };
      this.dispatches.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = this.dispatches.find((item) => item.id === where.id);
      if (!row) throw new Error("missing dispatch");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
      updateMany: async ({ where, data }) => {
        const allowed = where.status?.in;
        let count = 0;
        for (const row of this.dispatches) {
          if (row.id !== where.id) continue;
          if (allowed && !allowed.includes(row.status)) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
      delete: async ({ where }) => {
        const idx = this.dispatches.findIndex((row) => row.id === where.id);
        if (idx < 0) throw new Error("missing dispatch");
        const [row] = this.dispatches.splice(idx, 1);
        return row;
      },
    };

  conversation = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const pair = where.workspaceId_leadId as
        | { workspaceId: string; leadId: string }
        | undefined;
      if (!pair) return null;
      return this.conversations.get(`${pair.workspaceId}:${pair.leadId}`) ?? null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const workspaceId = String(data.workspaceId);
      const leadId = String(data.leadId);
      const now = new Date();
      const row: LeadConversationRecord = {
        id: `conv_${this.nextConv++}`,
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
      this.conversations.set(`${workspaceId}:${leadId}`, row);
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
      const row = [...this.conversations.values()].find(
        (item) => item.workspaceId === pair?.workspaceId && item.id === pair.id,
      );
      if (!row) throw new Error("missing conv");
      Object.assign(row, data);
      return row;
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
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const rows = this.messages.filter((row) => {
        if (where.workspaceId && row.workspaceId !== where.workspaceId) return false;
        if (typeof where.leadId === "string" && row.leadId !== where.leadId) {
          return false;
        }
        if (
          where.leadId &&
          typeof where.leadId === "object" &&
          where.leadId &&
          "in" in (where.leadId as object)
        ) {
          if (!(where.leadId as { in: string[] }).in.includes(row.leadId)) {
            return false;
          }
        }
        if (where.channel && row.channel !== where.channel) return false;
        if (where.senderKind && row.senderKind !== where.senderKind) return false;
        if (where.smsTo && row.smsTo !== where.smsTo) return false;
        return true;
      });
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows[0] ?? null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: ConversationMessageRecord = {
        id: `msg_${this.nextMsg++}`,
        workspaceId: String(data.workspaceId),
        conversationId: String(data.conversationId),
        leadId: String(data.leadId),
        channel: data.channel as ConversationMessageRecord["channel"],
        kind: data.kind as ConversationMessageRecord["kind"],
        senderKind: data.senderKind as ConversationMessageRecord["senderKind"],
        senderUserId: typeof data.senderUserId === "string" ? data.senderUserId : null,
        senderName: String(data.senderName),
        createdByUserId:
          typeof data.createdByUserId === "string" ? data.createdByUserId : null,
        body: typeof data.body === "string" ? data.body : null,
        createdAt: new Date(),
        deliveredAt: null,
        smsSource: (data.smsSource ?? null) as ConversationMessageRecord["smsSource"],
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
    findFirst: async () => null,
    create: async ({
      data,
    }: {
      data: { leadId: string; type: string; body?: string | null; meta?: unknown; userId?: string | null };
    }) => {
      const row = {
        leadId: data.leadId,
        type: data.type,
        body: data.body ?? null,
        meta: data.meta ?? null,
        userId: data.userId ?? null,
      };
      this.activities.push(row);
      return row;
    },
  };

  smsSuppression = {
    findUnique: async ({
      where,
    }: {
      where: { workspaceId_phoneE164: { workspaceId: string; phoneE164: string } };
    }) => {
      const key = `${where.workspaceId_phoneE164.workspaceId}::${where.workspaceId_phoneE164.phoneE164}`;
      return this.suppressions.has(key) ? { id: key } : null;
    },
    upsert: async () => null,
    deleteMany: async () => ({ count: 0 }),
  };

  workspace = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      if (where.twilioPhoneE164 === FROM) {
        return { id: WS_A, twilioSubaccountSid: SUB_A, currentSubscriptionId: this.currentSubscriptionId };
      }
      if (where.id === WS_A) {
        return { currentSubscriptionId: this.currentSubscriptionId };
      }
      return { currentSubscriptionId: this.currentSubscriptionId };
    },
  };
  subscription = { findUnique: async () => this.plan };
  smsUsageEvent = {
    findUnique: async ({ where }: { where: { twilioMessageSid: string } }) =>
      this.events.find((row) => row.twilioMessageSid === where.twilioMessageSid) ??
      null,
    findMany: async ({ where }: { where: { workspaceId: string; periodStart: Date; periodEnd: Date } }) =>
      this.events.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.periodStart.getTime() === where.periodStart.getTime() &&
          row.periodEnd.getTime() === where.periodEnd.getTime(),
      ),
    create: async ({ data }: { data: Omit<SmsUsageEventRow, "id" | "createdAt" | "updatedAt"> & { id?: string } }) => {
      const now = new Date();
      const row: SmsUsageEventRow = {
        id: data.id ?? `use_${this.nextUse++}`,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      this.events.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<SmsUsageEventRow> }) => {
      const row = this.events.find((item) => item.id === where.id);
      if (!row) throw new Error("missing usage");
      Object.assign(row, data);
      return row;
    },
  };

  siteVisitor = {
    findFirst: async ({ where }: { where: { userId: string } }) => {
      const at = this.visitors.get(where.userId);
      return at ? { lastSeenAt: at } : null;
    },
  };
  activityEvent = {
    findFirst: async ({ where }: { where: { userId: string; createdAt?: { lt: Date } } }) => {
      const rows = this.activityEvents.filter((row) => {
        if (row.userId !== where.userId) return false;
        if (row.type === "HEARTBEAT") return false;
        if (where.createdAt?.lt && row.createdAt >= where.createdAt.lt) return false;
        return true;
      });
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows[0] ? { createdAt: rows[0].createdAt } : null;
    },
  };

  inboundSmsQuarantine = {
    findUnique: async () => null,
    create: async ({ data }: { data: { twilioMessageSid: string } }) => data,
  };

  async $transaction<T>(fn: (tx: ConversationMessageTx) => Promise<T>) {
    return fn({ message: this.message, conversation: this.conversation });
  }

  sendSms = async (input: {
    to: string;
    body: string;
    smsClass: string;
    workspaceId?: string | null;
  }): Promise<SendSmsResult> => {
    this.smsSendCalls += 1;
    if (this.failNext) {
      this.failNext = false;
      return { status: "failed" };
    }
    this.sent.push(input);
    return {
      status: "sent",
      sid: `SM_AUTO_${this.smsSendCalls}`,
      providerStatus: "queued",
      numSegments: 1,
    };
  };
}

function asDb(db: FakeAutomationDb) {
  return db as unknown as SmsAutomationExecuteDb;
}

function activityDb(db: FakeAutomationDb): LastCustomerActivityDb {
  return db as unknown as LastCustomerActivityDb;
}

async function seedCatalog(db: FakeAutomationDb) {
  await ensureSmsAutomationCatalog({
    smsAutomationDefinition: db.smsAutomationDefinition,
    smsAutomationVersion: db.smsAutomationVersion,
  } as never);
}

function testFilesAndWiring() {
  const intake = read("src/lib/agent/lead-intake.ts");
  assert.ok(intake.includes("scheduleAgentNewLeadSignupSms"));
  assert.ok(intake.includes('source === "SIGNUP"'));
  assert.ok(
    read("src/lib/sms/automations/triggers.ts").includes(
      "runAgentNewLeadSignupSms",
    ),
  );
  const prefs = read("src/app/api/account/preferences/route.ts");
  assert.ok(prefs.includes("scheduleUnsubscribeSmsAutomations"));
  assert.ok(prefs.includes("scheduleCustomerIntroductionIfFirstValidE164"));
  const leads = read("src/app/api/leads/route.ts");
  assert.ok(leads.includes("scheduleViewingRequestedSmsAutomation"));
  const staff = read("src/lib/notifications/staff-events.ts");
  assert.ok(staff.includes("scheduleLeadReturnedSmsAutomations"));
  const auth = read("src/lib/auth.ts");
  assert.equal(auth.includes("scheduleSignupSmsAutomations"), false);
  const execute = read("src/lib/sms/automations/execute.ts");
  assert.ok(execute.includes('category: "AUTOMATION"'));
  assert.ok(execute.includes('category: "AGENT_NOTIFICATION"'));
  assert.ok(execute.includes("smsAutomationLeadProfileUrl"));
  assert.ok(execute.includes("DEFERRED"));
  assert.ok(execute.includes("resolveAssignedAgentNotifyDestination"));
  const agentNotify = read("src/lib/sms/assigned-agent-inbound-notify.ts");
  assert.ok(agentNotify.includes("AGENT_PHONE_IS_LEAD"));
  const contact = read("src/app/api/account/contact/route.ts");
  assert.ok(contact.includes("scheduleCustomerIntroductionIfFirstValidE164"));
  const agentContact = read("src/app/api/agent/leads/contact/route.ts");
  assert.ok(agentContact.includes("scheduleCustomerIntroductionIfFirstValidE164"));
  const mobileContact = read(
    "src/app/api/mobile/v2/leads/[leadId]/contact/route.ts",
  );
  assert.ok(mobileContact.includes("scheduleCustomerIntroductionIfFirstValidE164"));
  const manual = read("src/lib/agent/create-manual-lead.ts");
  assert.ok(manual.includes("scheduleCustomerIntroductionSmsAutomationsForLead"));
  const cron = read("src/app/api/cron/sms-automations/route.ts");
  assert.ok(cron.includes("runInactiveLeadSmsAutomations"));
  assert.ok(cron.includes("beginSmsAutomationCronRun"));
  const plist = read("scripts/macos/com.houzzat.sms-automations.plist");
  assert.ok(plist.includes("com.houzzat.sms-automations"));
  assert.ok(plist.includes("<integer>7</integer>"));
  const agent = read("scripts/run-sms-automations-mac.sh");
  assert.ok(agent.includes("pnpm sms-automations:run"));
  assert.ok(agent.includes("houzzat-sms-automations.lock"));
  const migration = read(
    "prisma/migrations/20260920030000_sms_automation_dispatches/migration.sql",
  );
  assert.ok(migration.includes("NOT APPLIED"));
  assert.ok(smsAutomationLeadProfileUrl(LEAD_A).includes("/agent/open-lead/"));
}

function testBucketBoundaries() {
  assert.equal(selectLeadReturnedInactivityBucket(13), null);
  assert.equal(selectLeadReturnedInactivityBucket(14), 14);
  assert.equal(selectLeadReturnedInactivityBucket(29), 14);
  assert.equal(selectLeadReturnedInactivityBucket(30), 30);
  assert.equal(selectLeadReturnedInactivityBucket(44), 30);
  assert.equal(selectLeadReturnedInactivityBucket(45), 45);
  assert.equal(selectLeadReturnedInactivityBucket(59), 45);
  assert.equal(selectLeadReturnedInactivityBucket(60), 60);
  assert.equal(selectLeadReturnedInactivityBucket(63), 60);
  assert.equal(selectLeadReturnedInactivityBucket(119), 60);
  assert.equal(selectLeadReturnedInactivityBucket(120), 120);
  assert.equal(selectLeadReturnedInactivityBucket(179), 120);
  assert.equal(selectLeadReturnedInactivityBucket(180), 180);
  assert.equal(selectLeadReturnedInactivityBucket(190), 180);
  assert.equal(selectLeadReturnedInactivityBucket(364), 180);
  assert.equal(selectLeadReturnedInactivityBucket(365), 365);
  assert.equal(selectLeadReturnedInactivityBucket(400), 365);
  assert.equal(completedInactiveDays(new Date("2026-01-01"), new Date("2026-01-14")), 13);
  assert.equal(completedInactiveDays(new Date("2026-01-01"), new Date("2026-01-15")), 14);
}


async function testSignupAgentOnlyNoWelcome() {
  const db = new FakeAutomationDb();
  db.seedLead();
  await seedCatalog(db);
  await runSignupSmsAutomations(LEAD_A, { db: asDb(db), sendSms: db.sendSms });
  assert.equal(db.smsSendCalls, 1);
  assert.ok(db.sent.every((row) => row.to === TO_AGENT));
  assert.equal(db.messages.length, 0);
}

async function testSignupFiresOnce() {
  const db = new FakeAutomationDb();
  db.seedLead();
  await seedCatalog(db);
  await runSignupWithWelcome(LEAD_A, { db: asDb(db), sendSms: db.sendSms });
  assert.equal(db.smsSendCalls, 2);
  assert.ok(db.sent.some((row) => row.to === TO_AGENT && row.smsClass === "staff"));
  assert.ok(db.sent.some((row) => row.to === TO_LEAD && row.smsClass === "conversational"));
  assert.ok(db.events.some((row) => row.category === "AGENT_NOTIFICATION"));
  assert.ok(db.events.some((row) => row.category === "AUTOMATION"));
  assert.ok(db.messages.some((row) => row.leadId === LEAD_A && row.channel === "SMS"));
  assert.equal(db.activities.filter((row) => row.type === "SMS").length >= 2, true);
  assert.ok(
    db.activities.some(
      (row) =>
        row.type === "SMS" &&
        row.meta &&
        typeof row.meta === "object" &&
        "recipient" in row.meta &&
        (row.meta as { recipient?: string }).recipient === "AGENT",
    ),
  );
  const leadMessage = db.messages.find((row) => row.channel === "SMS");
  assert.deepEqual(leadMessage?.payload, {
    automationKey: "lead.welcome_new_signup",
  });
  assert.equal(db.messages.length, 1);
  assert.equal(
    smsAutomationDisplayName("lead.welcome_new_signup"),
    "Customer Introduction",
  );
  assert.equal(
    smsAutomationTranscriptLabel(leadMessage?.payload),
    "Automated · Customer Introduction",
  );
  const leadActivity = db.activities.find(
    (row) =>
      row.meta &&
      typeof row.meta === "object" &&
      (row.meta as { recipient?: string }).recipient === "LEAD",
  );
  const agentActivity = db.activities.find(
    (row) =>
      row.meta &&
      typeof row.meta === "object" &&
      (row.meta as { recipient?: string }).recipient === "AGENT",
  );
  assert.equal(
    conversationActivityHeadline({
      type: leadActivity?.type ?? "",
      meta: leadActivity?.meta,
    }),
    "Conversation · SMS · Automated",
  );
  assert.equal(
    conversationActivityHeadline({
      type: agentActivity?.type ?? "",
      meta: agentActivity?.meta,
    }),
    "SMS · Agent Notification",
  );
  await runSignupWithWelcome(LEAD_A, { db: asDb(db), sendSms: db.sendSms });
  assert.equal(db.smsSendCalls, 2);
}

async function testUnsubscribeAgentOnly() {
  const db = new FakeAutomationDb();
  db.seedLead();
  await seedCatalog(db);
  await runUnsubscribeSmsAutomations(CUST_A, new Date("2026-09-20T12:00:00.000Z"), {
    db: asDb(db),
    sendSms: db.sendSms,
  });
  assert.equal(db.sent.length, 1);
  assert.equal(db.sent[0]?.to, TO_AGENT);
  assert.equal(db.messages.length, 0);
}

async function testViewingPropertyOnce() {
  const db = new FakeAutomationDb();
  db.seedLead();
  await seedCatalog(db);
  await runViewingRequestedSmsAutomation(
    LEAD_A,
    "12 King St W, Toronto",
    { db: asDb(db), sendSms: db.sendSms },
  );
  assert.equal(db.sent.length, 1);
  assert.ok(db.sent[0]?.body.includes("12 King St W, Toronto"));
  await runViewingRequestedSmsAutomation(
    LEAD_A,
    "12 King St W, Toronto",
    { db: asDb(db), sendSms: db.sendSms },
  );
  assert.equal(db.sent.length, 1);
}

async function testInactiveOnceAndNewCycle() {
  const db = new FakeAutomationDb();
  db.seedLead({ createdAt: new Date("2026-08-01T00:00:00.000Z") });
  db.visitors.set(CUST_A, new Date("2026-08-20T00:00:00.000Z"));
  await seedCatalog(db);
  const now = new Date("2026-09-20T00:00:00.000Z");
  const first = await runInactiveLeadSmsAutomations({
    db: asDb(db),
    activityDb: activityDb(db),
    sendSms: db.sendSms,
    now,
  });
  assert.equal(first.sent, 1);
  const again = await runInactiveLeadSmsAutomations({
    db: asDb(db),
    activityDb: activityDb(db),
    sendSms: db.sendSms,
    now,
  });
  assert.equal(again.sent, 0);
  assert.equal(db.smsSendCalls, 1);
  db.visitors.set(CUST_A, new Date("2026-09-21T00:00:00.000Z"));
  const tooSoon = await runInactiveLeadSmsAutomations({
    db: asDb(db),
    activityDb: activityDb(db),
    sendSms: db.sendSms,
    now: new Date("2026-09-25T00:00:00.000Z"),
  });
  assert.equal(tooSoon.sent, 0);
  const later = await runInactiveLeadSmsAutomations({
    db: asDb(db),
    activityDb: activityDb(db),
    sendSms: db.sendSms,
    now: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(later.sent, 1);
}

async function testReturnOnceAndNoNavRepeat() {
  const db = new FakeAutomationDb();
  db.seedLead();
  await seedCatalog(db);
  const last = new Date("2026-08-01T00:00:00.000Z");
  const now = new Date("2026-09-20T00:00:00.000Z");
  const first = await runLeadReturnedSmsAutomations(CUST_A, last, {
    db: asDb(db),
    sendSms: db.sendSms,
    now,
  });
  assert.equal(first.bucket, 45);
  assert.ok(db.smsSendCalls >= 2);
  const calls = db.smsSendCalls;
  const again = await runLeadReturnedSmsAutomations(CUST_A, last, {
    db: asDb(db),
    sendSms: db.sendSms,
    now,
  });
  assert.equal(again.bucket, 45);
  assert.equal(db.smsSendCalls, calls);
  const nav = await runLeadReturnedSmsAutomations(
    CUST_A,
    new Date("2026-09-20T00:05:00.000Z"),
    { db: asDb(db), sendSms: db.sendSms, now: new Date("2026-09-20T00:06:00.000Z") },
  );
  assert.equal(nav.bucket, null);
  assert.equal(db.smsSendCalls, calls);
}

async function testEligibilityGates() {
  const db = new FakeAutomationDb();
  db.seedLead();
  await seedCatalog(db);
  const welcome = [...db.definitions.values()].find(
    (row) => row.key === SMS_AUTOMATION_KEYS.leadWelcome,
  )!;
  welcome.active = false;
  await runSignupWithWelcome(LEAD_A, { db: asDb(db), sendSms: db.sendSms });
  assert.equal(db.sent.filter((row) => row.to === TO_LEAD).length, 0);
  assert.equal(db.sent.filter((row) => row.to === TO_AGENT).length, 1);

  const db2 = new FakeAutomationDb();
  db2.seedLead();
  await seedCatalog(db2);
  const def = [...db2.definitions.values()].find(
    (row) => row.key === SMS_AUTOMATION_KEYS.leadWelcome,
  )!;
  for (const ver of db2.versions.filter((row) => row.definitionId === def.id)) {
    ver.status = "DRAFT";
  }
  await runSignupWithWelcome(LEAD_A, { db: asDb(db2), sendSms: db2.sendSms });
  assert.equal(db2.sent.filter((row) => row.to === TO_LEAD).length, 0);

  const db3 = new FakeAutomationDb();
  db3.seedLead();
  db3.suppressions.add(`${WS_A}::${TO_LEAD}`);
  await seedCatalog(db3);
  await runSignupWithWelcome(LEAD_A, { db: asDb(db3), sendSms: db3.sendSms });
  assert.equal(db3.sent.filter((row) => row.to === TO_LEAD).length, 0);

  const db4 = new FakeAutomationDb();
  db4.seedLead({
    customer: {
      name: "No Phone",
      email: "nophone@test.local",
      phoneE164: null,
      phone: "555-0100",
    },
  });
  await seedCatalog(db4);
  await runSignupWithWelcome(LEAD_A, { db: asDb(db4), sendSms: db4.sendSms });
  assert.equal(db4.sent.filter((row) => row.smsClass === "conversational").length, 0);
  assert.equal(
    db4.dispatches.filter(
      (row) => row.automationKey === SMS_AUTOMATION_KEYS.leadWelcome,
    ).length,
    0,
  );

  const db5 = new FakeAutomationDb();
  db5.seedLead({
    assignedAgent: {
      id: AGENT_A,
      name: "Ali Agent",
      email: "agent@test.local",
      phoneE164: null,
      phone: null,
      disabledAt: null,
    },
  });
  await seedCatalog(db5);
  await runSignupWithWelcome(LEAD_A, { db: asDb(db5), sendSms: db5.sendSms });
  assert.equal(db5.sent.filter((row) => row.smsClass === "staff").length, 0);
  assert.ok(db5.sent.some((row) => row.smsClass === "conversational"));

  const dbDrift = new FakeAutomationDb();
  dbDrift.seedLead({
    customer: {
      name: "Jordan Customer",
      email: "jordan@test.local",
      phoneE164: "+16473613654",
      phone: "416-555-0199",
    },
  });
  await seedCatalog(dbDrift);
  await runSignupWithWelcome(LEAD_A, {
    db: asDb(dbDrift),
    sendSms: dbDrift.sendSms,
  });
  assert.ok(
    dbDrift.sent.some(
      (row) => row.smsClass === "conversational" && row.to === "+14165550199",
    ),
  );
  assert.equal(
    dbDrift.sent.some((row) => row.to === "+16473613654"),
    false,
  );
}

async function testTenantIsolationAndFailureIsolation() {
  const db = new FakeAutomationDb();
  db.seedLead({
    id: LEAD_B,
    workspaceId: WS_B,
    workspace: {
      id: WS_B,
      name: "Other",
      twilioPhoneE164: "+16475550999",
      twilioSubaccountSid: SUB_A,
      twilioMessagingServiceSid: MG_A,
    },
  });
  await seedCatalog(db);
  await runSignupWithWelcome(LEAD_B, { db: asDb(db), sendSms: db.sendSms });
  assert.ok(db.sent.every((row) => row.workspaceId === WS_B));

  const dbFail = new FakeAutomationDb();
  dbFail.seedLead();
  await seedCatalog(dbFail);
  dbFail.failNext = true;
  await runSignupWithWelcome(LEAD_A, {
    db: asDb(dbFail),
    sendSms: dbFail.sendSms,
  });
  assert.ok(dbFail.dispatches.some((row) => row.status === "FAILED"));
  assert.ok(dbFail.dispatches.some((row) => row.status === "SENT"));
  const beforeRetry = dbFail.smsSendCalls;
  await runSignupWithWelcome(LEAD_A, {
    db: asDb(dbFail),
    sendSms: dbFail.sendSms,
  });
  assert.ok(dbFail.smsSendCalls > beforeRetry);
  assert.equal(
    dbFail.dispatches.filter((row) => row.status === "SENT").length >= 2,
    true,
  );
}

async function testManualAllowanceSplitAndInbound() {
  const db = new FakeAutomationDb();
  db.seedLead();
  await seedCatalog(db);
  db.events.push({
    id: "use_mass",
    workspaceId: WS_A,
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    category: "AGENT_MASS",
    recipientType: "LEAD",
    twilioMessageSid: "SM_MASS",
    messageId: null,
    segmentCount: 500,
    segmentCountSource: "ESTIMATED",
    finalized: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const manual = await inspectSmsAllowance(WS_A, {
    db: asDb(db),
    requestedSegments: 1,
    categories: SMS_MANUAL_USAGE_CATEGORIES,
  });
  assert.equal(manual.permitted, false);
  await runSignupWithWelcome(LEAD_A, { db: asDb(db), sendSms: db.sendSms });
  assert.ok(db.sent.some((row) => row.smsClass === "staff"));
  assert.ok(db.sent.some((row) => row.smsClass === "conversational"));

  const inbound = await handleInboundTwilioSms(
    {
      MessageSid: "SM_IN_AUTO",
      AccountSid: SUB_A,
      From: TO_LEAD,
      To: FROM,
      Body: "Thanks",
    },
    {
      db: db as never,
      scheduleNotify: () => {},
      scheduleAssignedAgentSmsNotify: () => {},
      twilioManagesKeywordReplies: true,
    },
  );
  assert.equal(inbound.outcome, "persisted");
  const reply = db.messages.find((row) => row.twilioMessageSid === "SM_IN_AUTO");
  assert.equal(reply?.leadId, LEAD_A);
}

function noPhoneCustomer() {
  return {
    name: "Hamida Hamdana",
    email: "nophone@test.local",
    phoneE164: null as string | null,
    phone: null as string | null,
  };
}

async function testCustomerIntroductionFirstPhoneOnce() {
  const db = new FakeAutomationDb();
  db.seedLead({
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    customer: noPhoneCustomer(),
  });
  await seedCatalog(db);
  await runSignupWithWelcome(LEAD_A, { db: asDb(db), sendSms: db.sendSms });
  assert.equal(db.sent.filter((row) => row.smsClass === "staff").length, 1);
  assert.equal(db.sent.filter((row) => row.smsClass === "conversational").length, 0);
  assert.equal(
    db.dispatches.filter(
      (row) => row.automationKey === SMS_AUTOMATION_KEYS.leadWelcome,
    ).length,
    0,
  );

  await runCustomerIntroductionSmsAutomation(LEAD_A, {
    db: asDb(db),
    sendSms: db.sendSms,
  });
  assert.equal(db.sent.filter((row) => row.smsClass === "conversational").length, 0);

  const lead = db.leads.get(LEAD_A)!;
  lead.customer = {
    ...noPhoneCustomer(),
    phone: TO_LEAD,
    phoneE164: TO_LEAD,
  };
  assert.equal(
    becameFirstValidCustomerE164({
      previousPhone: null,
      previousPhoneE164: null,
      nextPhone: TO_LEAD,
      nextPhoneE164: TO_LEAD,
    }),
    true,
  );
  await runCustomerIntroductionSmsAutomation(LEAD_A, {
    db: asDb(db),
    sendSms: db.sendSms,
  });
  assert.equal(db.sent.filter((row) => row.smsClass === "conversational").length, 1);
  assert.equal(
    db.sent.find((row) => row.smsClass === "conversational")?.to,
    TO_LEAD,
  );
  assert.ok(db.events.some((row) => row.category === "AUTOMATION"));
  assert.equal(db.messages.length, 1);
  assert.equal(
    smsAutomationTranscriptLabel(db.messages[0]?.payload),
    "Automated · Customer Introduction",
  );
  const leadActivity = db.activities.find(
    (row) =>
      row.meta &&
      typeof row.meta === "object" &&
      (row.meta as { recipient?: string }).recipient === "LEAD",
  );
  assert.equal(
    conversationActivityHeadline({
      type: leadActivity?.type ?? "",
      meta: leadActivity?.meta,
    }),
    "Conversation · SMS · Automated",
  );

  lead.customer = {
    ...lead.customer,
    phone: "+14165550999",
    phoneE164: "+14165550999",
  };
  assert.equal(
    becameFirstValidCustomerE164({
      previousPhone: TO_LEAD,
      previousPhoneE164: TO_LEAD,
      nextPhone: "+14165550999",
      nextPhoneE164: "+14165550999",
    }),
    false,
  );
  await runCustomerIntroductionSmsAutomation(LEAD_A, {
    db: asDb(db),
    sendSms: db.sendSms,
  });
  assert.equal(db.sent.filter((row) => row.smsClass === "conversational").length, 1);

  await Promise.all([
    runCustomerIntroductionSmsAutomation(LEAD_A, {
      db: asDb(db),
      sendSms: db.sendSms,
    }),
    runCustomerIntroductionSmsAutomation(LEAD_A, {
      db: asDb(db),
      sendSms: db.sendSms,
    }),
  ]);
  assert.equal(db.sent.filter((row) => row.smsClass === "conversational").length, 1);
}

async function testHistoricalSkippedNoCustomerE164IsRetryableNotBackfill() {
  assert.equal(
    isRetryableCustomerIntroductionSkip({
      automationKey: SMS_AUTOMATION_KEYS.leadWelcome,
      status: "SKIPPED",
      errorCode: "NO_CUSTOMER_E164",
    }),
    true,
  );
  assert.equal(
    isRetryableCustomerIntroductionSkip({
      automationKey: SMS_AUTOMATION_KEYS.leadWelcome,
      status: "SKIPPED",
      errorCode: "SUPPRESSED",
    }),
    false,
  );

  const alreadyHasPhone = new FakeAutomationDb();
  alreadyHasPhone.seedLead();
  await seedCatalog(alreadyHasPhone);
  alreadyHasPhone.dispatches.push({
    id: "hist_skip_has_phone",
    workspaceId: WS_A,
    leadId: LEAD_A,
    automationKey: SMS_AUTOMATION_KEYS.leadWelcome,
    cycleKey: "signup",
    status: "SKIPPED",
    twilioMessageSid: null,
    messageId: null,
    errorCode: "NO_CUSTOMER_E164",
    createdAt: new Date("2026-09-20T23:26:46.000Z"),
    updatedAt: new Date("2026-09-20T23:26:46.000Z"),
    processedAt: new Date("2026-09-20T23:26:46.000Z"),
  });
  assert.equal(
    becameFirstValidCustomerE164({
      previousPhone: TO_LEAD,
      previousPhoneE164: TO_LEAD,
      nextPhone: "+14165550999",
      nextPhoneE164: "+14165550999",
    }),
    false,
  );
  assert.equal(alreadyHasPhone.sent.length, 0);
  assert.equal(
    alreadyHasPhone.dispatches.find(
      (row) => row.automationKey === SMS_AUTOMATION_KEYS.leadWelcome,
    )?.status,
    "SKIPPED",
  );

  const stillPhoneless = new FakeAutomationDb();
  stillPhoneless.seedLead({ customer: noPhoneCustomer() });
  await seedCatalog(stillPhoneless);
  stillPhoneless.dispatches.push({
    id: "hist_skip_no_phone",
    workspaceId: WS_A,
    leadId: LEAD_A,
    automationKey: SMS_AUTOMATION_KEYS.leadWelcome,
    cycleKey: "signup",
    status: "SKIPPED",
    twilioMessageSid: null,
    messageId: null,
    errorCode: "NO_CUSTOMER_E164",
    createdAt: new Date("2026-09-20T23:26:46.000Z"),
    updatedAt: new Date("2026-09-20T23:26:46.000Z"),
    processedAt: new Date("2026-09-20T23:26:46.000Z"),
  });
  const lead = stillPhoneless.leads.get(LEAD_A)!;
  lead.customer = {
    ...noPhoneCustomer(),
    phone: TO_LEAD,
    phoneE164: TO_LEAD,
  };
  assert.equal(
    becameFirstValidCustomerE164({
      previousPhone: null,
      previousPhoneE164: null,
      nextPhone: TO_LEAD,
      nextPhoneE164: TO_LEAD,
    }),
    true,
  );
  await runCustomerIntroductionSmsAutomation(LEAD_A, {
    db: asDb(stillPhoneless),
    sendSms: stillPhoneless.sendSms,
  });
  assert.equal(
    stillPhoneless.sent.filter((row) => row.smsClass === "conversational").length,
    1,
  );
  assert.equal(
    stillPhoneless.dispatches.find(
      (row) => row.automationKey === SMS_AUTOMATION_KEYS.leadWelcome,
    )?.status,
    "SENT",
  );
}

async function testAgentNewLeadStaysAgentOnlyAndCollidesClosed() {
  assert.equal(
    resolveAssignedAgentNotifyDestination({
      agentPhoneE164: TO_AGENT,
      agentPhone: TO_AGENT,
      leadPhoneE164: TO_AGENT,
    }).reason,
    "AGENT_PHONE_IS_LEAD",
  );

  const db = new FakeAutomationDb();
  db.seedLead({
    customer: {
      name: "Hamida Hamdana",
      email: "same@test.local",
      phone: TO_AGENT,
      phoneE164: TO_AGENT,
    },
    assignedAgent: {
      id: AGENT_A,
      name: "Ali Agent",
      email: "agent@test.local",
      phoneE164: TO_AGENT,
      phone: TO_AGENT,
      disabledAt: null,
    },
  });
  await seedCatalog(db);
  await runSignupWithWelcome(LEAD_A, { db: asDb(db), sendSms: db.sendSms });
  assert.equal(db.sent.filter((row) => row.smsClass === "staff").length, 0);
  assert.equal(db.sent.filter((row) => row.smsClass === "conversational").length, 1);
  assert.equal(db.messages.length, 1);
  const agentDispatch = db.dispatches.find(
    (row) => row.automationKey === SMS_AUTOMATION_KEYS.agentNewLeadSignup,
  );
  assert.equal(agentDispatch?.status, "SKIPPED");
  assert.equal(agentDispatch?.errorCode, "AGENT_PHONE_IS_LEAD");
  assert.ok(db.events.every((row) => row.category !== "AGENT_NOTIFICATION"));
  assert.ok(db.events.some((row) => row.category === "AUTOMATION"));
}

async function testCustomerIntroductionSuppressedStaysTerminal() {
  const db = new FakeAutomationDb();
  db.seedLead({
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    customer: noPhoneCustomer(),
  });
  db.suppressions.add(`${WS_A}::${TO_LEAD}`);
  await seedCatalog(db);
  await runSignupWithWelcome(LEAD_A, { db: asDb(db), sendSms: db.sendSms });
  const lead = db.leads.get(LEAD_A)!;
  lead.customer = {
    ...noPhoneCustomer(),
    phone: TO_LEAD,
    phoneE164: TO_LEAD,
  };
  await runCustomerIntroductionSmsAutomation(LEAD_A, {
    db: asDb(db),
    sendSms: db.sendSms,
  });
  assert.equal(db.sent.filter((row) => row.smsClass === "conversational").length, 0);
  const intro = db.dispatches.find(
    (row) => row.automationKey === SMS_AUTOMATION_KEYS.leadWelcome,
  );
  assert.equal(intro?.status, "SKIPPED");
  assert.equal(intro?.errorCode, "SUPPRESSED");
  await runCustomerIntroductionSmsAutomation(LEAD_A, {
    db: asDb(db),
    sendSms: db.sendSms,
  });
  assert.equal(intro?.status, "SKIPPED");
}

async function main() {
  testFilesAndWiring();
  testBucketBoundaries();
  await testSignupAgentOnlyNoWelcome();
  await testSignupFiresOnce();
  await testCustomerIntroductionFirstPhoneOnce();
  await testHistoricalSkippedNoCustomerE164IsRetryableNotBackfill();
  await testAgentNewLeadStaysAgentOnlyAndCollidesClosed();
  await testCustomerIntroductionSuppressedStaysTerminal();
  await testUnsubscribeAgentOnly();
  await testViewingPropertyOnce();
  await testInactiveOnceAndNewCycle();
  await testReturnOnceAndNoNavRepeat();
  await testEligibilityGates();
  await testTenantIsolationAndFailureIsolation();
  await testManualAllowanceSplitAndInbound();
  console.log("sms-automations-wiring selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
