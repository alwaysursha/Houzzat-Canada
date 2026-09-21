import type { PrismaClient } from "@prisma/client";
import { frozenAgentSenderName } from "@/lib/conversations/agent-conversation-send";
import { SYSTEM_SENDER_NAME } from "@/lib/conversations/create-conversation-message";
import { createConversationMessage } from "@/lib/conversations/create-conversation-message";
import { smsAutomationMessagePayload } from "@/lib/conversations/sms-automation-payload";
import {
  recordSmsLeadActivity,
  type SmsLeadActivityDb,
} from "@/lib/conversations/sms-lead-activity";
import {
  resolvePublishedSmsAutomation,
  ensureSmsAutomationCatalog,
  type SmsAutomationDb,
} from "@/lib/platform/sms-automations";
import { renderSmsTemplate } from "@/lib/platform/sms-automations/variables";
import { firstNameFromLeadName } from "@/lib/sms/quick-texts/render";
import { isE164, resolveCommunicationsE164 } from "@/lib/sms/e164";
import { isPhoneSuppressed, type SmsSuppressionDb } from "@/lib/sms/suppression";
import { resolveAssignedAgentNotifyDestination } from "@/lib/sms/assigned-agent-inbound-notify";
import {
  CUSTOMER_INTRODUCTION_MISSING_PHONE,
  isCustomerIntroductionAutomationKey,
  isRetryableCustomerIntroductionSkip,
} from "./customer-introduction";
import { estimateSmsSegmentCount } from "@/lib/sms/segments";
import { sendSms, type SmsTransportDeps } from "@/lib/sms/transport";
import type { SendSmsResult } from "@/lib/sms/types";
import {
  hasSmsUsageDelegate,
  inspectSmsAllowance,
  recordSmsUsageEvent,
  SMS_AUTOMATION_USAGE_CATEGORIES,
  type SmsUsageDb,
} from "@/lib/sms/usage";
import { SMS_AUTOMATION_TEXT_MAX_LENGTH } from "./constants";
import { smsAutomationLeadProfileUrl } from "./urls";

export type SmsAutomationDispatchStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "SKIPPED"
  | "FAILED";

export type SmsAutomationDispatchRow = {
  id: string;
  workspaceId: string;
  leadId: string;
  automationKey: string;
  cycleKey: string;
  status: SmsAutomationDispatchStatus;
  twilioMessageSid: string | null;
  messageId: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
};

export type AutomationLeadRow = {
  id: string;
  workspaceId: string | null;
  assignedAgentId: string | null;
  customerId: string | null;
  createdAt: Date;
  listingMls: string | null;
  customer: {
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

export type SmsAutomationExecuteDb = SmsAutomationDb &
  SmsSuppressionDb &
  SmsLeadActivityDb &
  SmsUsageDb & {
    lead: {
      findUnique: (args: {
        where: { id: string };
        select: Record<string, unknown>;
      }) => Promise<AutomationLeadRow | null>;
      findMany: (args: object) => Promise<AutomationLeadRow[]>;
    };
    listing?: {
      findUnique: (args: {
        where: { mlsNumber: string };
        select: { addressLine: true; city: true };
      }) => Promise<{ addressLine: string | null; city: string | null } | null>;
    };
    smsAutomationDispatch: {
      findUnique: (args: {
        where: {
          workspaceId_leadId_automationKey_cycleKey: {
            workspaceId: string;
            leadId: string;
            automationKey: string;
            cycleKey: string;
          };
        };
      }) => Promise<SmsAutomationDispatchRow | null>;
      create: (args: {
        data: Omit<SmsAutomationDispatchRow, "id" | "createdAt" | "updatedAt"> & {
          id?: string;
        };
      }) => Promise<SmsAutomationDispatchRow>;
      update: (args: {
        where: { id: string };
        data: Partial<SmsAutomationDispatchRow>;
      }) => Promise<SmsAutomationDispatchRow>;
      updateMany: (args: {
        where: {
          id: string;
          status?: { in: SmsAutomationDispatchStatus[] };
        };
        data: Partial<SmsAutomationDispatchRow>;
      }) => Promise<{ count: number }>;
      delete: (args: { where: { id: string } }) => Promise<unknown>;
    };
    conversation: {
      findUnique: (args: object) => Promise<unknown>;
      create: (args: object) => Promise<unknown>;
      update: (args: object) => Promise<unknown>;
    };
    message: {
      findUnique: (args: object) => Promise<unknown>;
      findFirst: (args: object) => Promise<unknown>;
      create: (args: object) => Promise<unknown>;
    };
    $transaction: <T>(
      fn: (tx: {
        message: { create: (args: object) => Promise<unknown> };
        conversation: { update: (args: object) => Promise<unknown> };
      }) => Promise<T>,
    ) => Promise<T>;
  };

export type DispatchSmsAutomationResult = {
  status:
    | SmsAutomationDispatchStatus
    | "DUPLICATE"
    | "NO_WORKSPACE"
    | "DEFERRED";
  reason?: string | null;
};

export type DispatchSmsAutomationInput = {
  key: string;
  leadId: string;
  cycleKey: string;
  propertyAddress?: string | null;
};

export type SmsAutomationExecuteDeps = {
  sendSms?: (
    input: Parameters<typeof sendSms>[0],
    deps?: SmsTransportDeps,
  ) => Promise<SendSmsResult>;
  now?: Date;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

const LEAD_SELECT = {
  id: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
  createdAt: true,
  listingMls: true,
  customer: {
    select: { name: true, email: true, phoneE164: true, phone: true },
  },
  assignedAgent: {
    select: {
      id: true,
      name: true,
      email: true,
      phoneE164: true,
      phone: true,
      disabledAt: true,
    },
  },
  workspace: {
    select: {
      id: true,
      name: true,
      twilioPhoneE164: true,
      twilioSubaccountSid: true,
      twilioMessagingServiceSid: true,
    },
  },
};

export function hasSmsAutomationDispatchDelegate(
  db: unknown,
): db is SmsAutomationExecuteDb {
  return Boolean(
    db &&
      typeof db === "object" &&
      "smsAutomationDispatch" in db &&
      (db as SmsAutomationExecuteDb).smsAutomationDispatch,
  );
}

async function loadLead(db: SmsAutomationExecuteDb, leadId: string) {
  return db.lead.findUnique({
    where: { id: leadId },
    select: LEAD_SELECT,
  });
}

async function resolvePropertyAddress(
  db: SmsAutomationExecuteDb,
  lead: AutomationLeadRow,
  explicit?: string | null,
): Promise<string> {
  const given = explicit?.replace(/\s+/g, " ").trim() || "";
  if (given) return given;
  const mls = lead.listingMls?.trim() || "";
  if (!mls || !db.listing?.findUnique) return "";
  const listing = await db.listing.findUnique({
    where: { mlsNumber: mls },
    select: { addressLine: true, city: true },
  });
  if (!listing) return "";
  return [listing.addressLine, listing.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

async function finish(
  db: SmsAutomationExecuteDb,
  id: string,
  patch: Partial<SmsAutomationDispatchRow>,
) {
  return db.smsAutomationDispatch.update({
    where: { id },
    data: { ...patch, processedAt: new Date(), updatedAt: new Date() },
  });
}

async function releaseUnsentDispatch(
  db: SmsAutomationExecuteDb,
  id: string,
) {
  try {
    await db.smsAutomationDispatch.delete({ where: { id } });
  } catch {
    await finish(db, id, {
      status: "FAILED",
      errorCode: CUSTOMER_INTRODUCTION_MISSING_PHONE,
    }).catch(() => undefined);
  }
}

export async function dispatchSmsAutomation(
  db: SmsAutomationExecuteDb,
  input: DispatchSmsAutomationInput,
  deps: SmsAutomationExecuteDeps = {},
): Promise<DispatchSmsAutomationResult> {
  const leadId = input.leadId.trim();
  const key = input.key.trim();
  const cycleKey = input.cycleKey.trim();
  if (!leadId || !key || !cycleKey) {
    return { status: "SKIPPED", reason: "INVALID_INPUT" };
  }

  const lead = await loadLead(db, leadId);
  const workspaceId = lead?.workspaceId?.trim() || "";
  if (!lead || !workspaceId) {
    return { status: "NO_WORKSPACE", reason: "NO_WORKSPACE" };
  }

  if (isCustomerIntroductionAutomationKey(key)) {
    const toE164 = resolveCommunicationsE164(
      lead.customer?.phone,
      lead.customer?.phoneE164,
    );
    if (!toE164 || !isE164(toE164)) {
      return {
        status: "DEFERRED",
        reason: CUSTOMER_INTRODUCTION_MISSING_PHONE,
      };
    }
  }

  let row: SmsAutomationDispatchRow;
  try {
    row = await db.smsAutomationDispatch.create({
      data: {
        workspaceId,
        leadId,
        automationKey: key,
        cycleKey,
        status: "PENDING",
        twilioMessageSid: null,
        messageId: null,
        errorCode: null,
        processedAt: null,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await db.smsAutomationDispatch.findUnique({
      where: {
        workspaceId_leadId_automationKey_cycleKey: {
          workspaceId,
          leadId,
          automationKey: key,
          cycleKey,
        },
      },
    });
    if (!existing) return { status: "DUPLICATE", reason: "P2002" };
    if (existing.status === "SENT") {
      return { status: "DUPLICATE", reason: existing.status };
    }
    const retryableSkip = isRetryableCustomerIntroductionSkip(existing);
    if (existing.status === "SKIPPED" && !retryableSkip) {
      return { status: "DUPLICATE", reason: existing.status };
    }
    if (existing.status === "PENDING" || existing.status === "PROCESSING") {
      return { status: "DUPLICATE", reason: existing.status };
    }
    const claimFrom: SmsAutomationDispatchStatus[] = retryableSkip
      ? ["SKIPPED"]
      : ["FAILED"];
    const claimed = await db.smsAutomationDispatch.updateMany({
      where: { id: existing.id, status: { in: claimFrom } },
      data: { status: "PROCESSING", errorCode: null, processedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return { status: "DUPLICATE", reason: existing.status };
    }
    row = { ...existing, status: "PROCESSING" };
  }

  const claimed = await db.smsAutomationDispatch.updateMany({
    where: { id: row.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PROCESSING", processedAt: new Date() },
  });
  if (claimed.count !== 1 && row.status !== "PROCESSING") {
    return { status: "DUPLICATE", reason: "CLAIM" };
  }

  try {
    try {
      await ensureSmsAutomationCatalog(db);
    } catch {
      // Catalog seed is best-effort; resolve still fail-closes.
    }
    const published = await resolvePublishedSmsAutomation(db, key);
    if (!published) {
      await finish(db, row.id, {
        status: "SKIPPED",
        errorCode: "NOT_PUBLISHED",
      });
      return { status: "SKIPPED", reason: "NOT_PUBLISHED" };
    }

    const recipient = published.definition.recipient;
    const agentName = lead.assignedAgent
      ? frozenAgentSenderName(lead.assignedAgent)
      : "";
    const leadName = lead.customer?.name?.trim() || lead.customer?.email || "";
    const propertyAddress = await resolvePropertyAddress(
      db,
      lead,
      input.propertyAddress,
    );
    const rendered = renderSmsTemplate(published.version.body, {
      firstName: firstNameFromLeadName(leadName),
      leadName,
      agentName,
      workspaceName: lead.workspace?.name ?? "",
      propertyAddress,
      leadProfileUrl: smsAutomationLeadProfileUrl(lead.id),
    }).trim();

    if (!rendered || rendered.length > SMS_AUTOMATION_TEXT_MAX_LENGTH) {
      await finish(db, row.id, {
        status: "SKIPPED",
        errorCode: "INVALID_BODY",
      });
      return { status: "SKIPPED", reason: "INVALID_BODY" };
    }

    if (recipient === "AGENT") {
      return sendAgentNotification(db, row, lead, rendered, deps);
    }
    return sendLeadAutomation(db, row, lead, key, rendered, deps);
  } catch (error) {
    await finish(db, row.id, {
      status: "FAILED",
      errorCode: "EXCEPTION",
    }).catch(() => undefined);
    console.error("[sms:automation] failed", {
      key,
      error: error instanceof Error ? error.name : "ERROR",
    });
    return { status: "FAILED", reason: "EXCEPTION" };
  }
}

async function sendAgentNotification(
  db: SmsAutomationExecuteDb,
  row: SmsAutomationDispatchRow,
  lead: AutomationLeadRow,
  body: string,
  deps: SmsAutomationExecuteDeps,
): Promise<DispatchSmsAutomationResult> {
  const workspaceId = lead.workspaceId!;
  const agent = lead.assignedAgent;
  if (!agent || agent.disabledAt) {
    await finish(db, row.id, {
      status: "SKIPPED",
      errorCode: "NO_ASSIGNEE",
    });
    return { status: "SKIPPED", reason: "NO_ASSIGNEE" };
  }
  const destination = resolveAssignedAgentNotifyDestination({
    agentPhoneE164: agent.phoneE164,
    agentPhone: agent.phone,
    leadPhoneE164: resolveCommunicationsE164(
      lead.customer?.phone,
      lead.customer?.phoneE164,
    ),
  });
  if (!destination.to) {
    await finish(db, row.id, {
      status: "SKIPPED",
      errorCode: destination.reason,
    });
    return { status: "SKIPPED", reason: destination.reason };
  }
  const to = destination.to;

  const send = deps.sendSms ?? sendSms;
  const sent = await send({
    to,
    body,
    workspaceId,
    smsClass: "staff",
  });
  if (sent.status !== "sent") {
    await finish(db, row.id, {
      status: "FAILED",
      errorCode: sent.status === "skipped" ? sent.reason : "SMS_SEND_FAILED",
    });
    return { status: "FAILED", reason: "SMS_SEND_FAILED" };
  }

  if (hasSmsUsageDelegate(db)) {
    try {
      await recordSmsUsageEvent(
        {
          workspaceId,
          category: "AGENT_NOTIFICATION",
          recipientType: "AGENT",
          twilioMessageSid: sent.sid,
          body,
          segmentCount: sent.numSegments ?? estimateSmsSegmentCount(body),
          segmentCountSource: sent.numSegments ? "PROVIDER" : "ESTIMATED",
        },
        db,
      );
    } catch {
      // Send already succeeded.
    }
  }

  try {
    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: agent.id,
        type: "SMS",
        body,
        meta: {
          channel: "SMS",
          direction: "outbound",
          recipient: "AGENT",
          automationKey: row.automationKey,
          workspaceId,
          twilioMessageSid: sent.sid,
        },
      },
    });
  } catch {
    // Timeline is best-effort after send.
  }

  await finish(db, row.id, {
    status: "SENT",
    twilioMessageSid: sent.sid,
    errorCode: null,
  });
  return { status: "SENT" };
}

async function sendLeadAutomation(
  db: SmsAutomationExecuteDb,
  row: SmsAutomationDispatchRow,
  lead: AutomationLeadRow,
  key: string,
  body: string,
  deps: SmsAutomationExecuteDeps,
): Promise<DispatchSmsAutomationResult> {
  const workspaceId = lead.workspaceId!;
  const toE164 = resolveCommunicationsE164(
    lead.customer?.phone,
    lead.customer?.phoneE164,
  );
  const fromE164 = isE164(lead.workspace?.twilioPhoneE164)
    ? lead.workspace?.twilioPhoneE164
    : null;

  if (!toE164 || !isE164(toE164)) {
    if (isCustomerIntroductionAutomationKey(key)) {
      await releaseUnsentDispatch(db, row.id);
      return {
        status: "DEFERRED",
        reason: CUSTOMER_INTRODUCTION_MISSING_PHONE,
      };
    }
    await finish(db, row.id, {
      status: "SKIPPED",
      errorCode: CUSTOMER_INTRODUCTION_MISSING_PHONE,
    });
    return { status: "SKIPPED", reason: CUSTOMER_INTRODUCTION_MISSING_PHONE };
  }
  if (
    !fromE164 ||
    !lead.workspace?.twilioSubaccountSid ||
    !lead.workspace.twilioMessagingServiceSid
  ) {
    await finish(db, row.id, {
      status: "SKIPPED",
      errorCode: "NO_WORKSPACE_NUMBER",
    });
    return { status: "SKIPPED", reason: "NO_WORKSPACE_NUMBER" };
  }

  const suppressed = await isPhoneSuppressed(workspaceId, toE164, db);
  if (suppressed) {
    await finish(db, row.id, {
      status: "SKIPPED",
      errorCode: "SUPPRESSED",
    });
    return { status: "SKIPPED", reason: "SUPPRESSED" };
  }

  if (hasSmsUsageDelegate(db)) {
    try {
      const allowance = await inspectSmsAllowance(workspaceId, {
        db,
        requestedSegments: Math.max(1, estimateSmsSegmentCount(body)),
        categories: SMS_AUTOMATION_USAGE_CATEGORIES,
      });
      if (!allowance.permitted) {
        await finish(db, row.id, {
          status: "SKIPPED",
          errorCode: allowance.reason ?? "ALLOWANCE_NOT_CONFIGURED",
        });
        return {
          status: "SKIPPED",
          reason: allowance.reason ?? "ALLOWANCE_NOT_CONFIGURED",
        };
      }
    } catch {
      await finish(db, row.id, {
        status: "SKIPPED",
        errorCode: "ALLOWANCE_NOT_CONFIGURED",
      });
      return { status: "SKIPPED", reason: "ALLOWANCE_NOT_CONFIGURED" };
    }
  }

  const send = deps.sendSms ?? sendSms;
  const sent = await send({
    to: toE164,
    fromE164,
    body,
    workspaceId,
    smsClass: "conversational",
  });
  if (sent.status !== "sent") {
    await finish(db, row.id, {
      status: "FAILED",
      errorCode: sent.status === "skipped" ? sent.reason : "SMS_SEND_FAILED",
    });
    return { status: "FAILED", reason: "SMS_SEND_FAILED" };
  }

  let messageId: string | null = null;
  try {
    const senderName = lead.assignedAgent
      ? frozenAgentSenderName(lead.assignedAgent)
      : SYSTEM_SENDER_NAME;
    const created = await createConversationMessage(db as never, {
      workspaceId,
      leadId: lead.id,
      channel: "SMS",
      kind: "TEXT",
      senderKind: lead.assignedAgent ? "AGENT" : "SYSTEM",
      senderUserId: lead.assignedAgent?.id ?? null,
      createdByUserId: lead.assignedAgent?.id ?? null,
      senderName,
      body,
      payload: smsAutomationMessagePayload(key),
      smsSource: "TWILIO",
      twilioMessageSid: sent.sid,
      smsFrom: fromE164,
      smsTo: toE164,
      providerStatus: sent.providerStatus || "queued",
    });
    if (created.ok && created.created) {
      messageId = created.message.id;
      await recordSmsLeadActivity(db, {
        leadId: lead.id,
        workspaceId,
        messageId: created.message.id,
        body,
        direction: "outbound",
        userId: lead.assignedAgent?.id ?? null,
        automationKey: key,
        recipient: "LEAD",
      });
    } else {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: lead.assignedAgent?.id ?? null,
          type: "SMS",
          body,
          meta: {
            channel: "SMS",
            direction: "outbound",
            recipient: "LEAD",
            automationKey: key,
            workspaceId,
            twilioMessageSid: sent.sid,
          },
        },
      });
    }
  } catch {
    try {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: lead.assignedAgent?.id ?? null,
          type: "SMS",
          body,
          meta: {
            channel: "SMS",
            direction: "outbound",
            recipient: "LEAD",
            automationKey: key,
            workspaceId,
            twilioMessageSid: sent.sid,
          },
        },
      });
    } catch {
      // Timeline is best-effort after send.
    }
  }

  if (hasSmsUsageDelegate(db)) {
    try {
      await recordSmsUsageEvent(
        {
          workspaceId,
          category: "AUTOMATION",
          recipientType: "LEAD",
          twilioMessageSid: sent.sid,
          messageId,
          body,
          segmentCount: sent.numSegments ?? estimateSmsSegmentCount(body),
          segmentCountSource: sent.numSegments ? "PROVIDER" : "ESTIMATED",
        },
        db,
      );
    } catch {
      // Send already succeeded.
    }
  }

  await finish(db, row.id, {
    status: "SENT",
    twilioMessageSid: sent.sid,
    messageId,
    errorCode: null,
  });
  return { status: "SENT" };
}

export function prismaSmsAutomationExecuteDb(
  prisma: PrismaClient,
): SmsAutomationExecuteDb {
  return prisma as unknown as SmsAutomationExecuteDb;
}
