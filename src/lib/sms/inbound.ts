/**
 * Canonical inbound Twilio SMS: workspace from To, Lead from From
 * inside that workspace, persist onto the existing Conversation, or
 * quarantine. Keywords are handled before CRM attach. Never creates a
 * Lead/User/Conversation for unknown senders.
 */
import type { PrismaClient } from "@prisma/client";
import { frozenCustomerChatDisplayName } from "@/lib/conversations/customer-chat-lead";
import {
  createConversationMessage,
  type ConversationMessageDb,
} from "@/lib/conversations/create-conversation-message";
import {
  recordSmsLeadActivity,
  type SmsLeadActivityDb,
} from "@/lib/conversations/sms-lead-activity";
import { prisma } from "@/lib/prisma";
import {
  scheduleNotifyAssignedAgentOfCustomerChatMessage,
  type NotifyAssignedAgentOfCustomerChatMessageInput,
} from "@/lib/notifications/customer-chat-agent-push";
import {
  scheduleNotifyAssignedAgentOfInboundSmsByCell,
  type AssignedAgentInboundSmsNotifyInput,
} from "@/lib/sms/assigned-agent-inbound-notify";
import { isE164, normalizeToE164 } from "@/lib/sms/e164";
import { isTwilioSid } from "@/lib/sms/sids";
import {
  classifyInboundSmsKeyword,
  emptyTwiml,
  keywordTwiml,
  twilioManagesKeywordReplies,
} from "@/lib/sms/keywords";
import {
  findInboundSmsQuarantineSid,
  quarantineInboundSms,
  type InboundSmsQuarantineDb,
} from "@/lib/sms/quarantine";
import {
  clearPhoneSuppression,
  suppressPhone,
  type SmsSuppressionDb,
} from "@/lib/sms/suppression";

export const INBOUND_SMS_TEXT_MAX_LENGTH = 1600;
export const INBOUND_TWILIO_SID_MAX_LENGTH = 64;

export type InboundSmsFields = {
  MessageSid?: string;
  SmsSid?: string;
  AccountSid?: string;
  From?: string;
  To?: string;
  Body?: string;
};

export type InboundSmsOutcome =
  | "duplicate"
  | "invalid_payload"
  | "unknown_workspace"
  | "account_mismatch"
  | "unknown_customer"
  | "ambiguous_customer"
  | "keyword_stop"
  | "keyword_start"
  | "keyword_help"
  | "persisted"
  | "persist_failed"
  | "body_too_long";

export type HandleInboundSmsResult = {
  outcome: InboundSmsOutcome;
  twiml: string;
  created: boolean;
};

type InboundLeadRow = {
  id: string;
  workspaceId: string | null;
  assignedAgentId: string | null;
  customerId: string | null;
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    phoneE164: string | null;
  } | null;
};

export type InboundSmsDb = ConversationMessageDb &
  InboundSmsQuarantineDb &
  SmsSuppressionDb &
  SmsLeadActivityDb & {
    workspace: Pick<PrismaClient["workspace"], "findUnique">;
    lead: Pick<PrismaClient["lead"], "findUnique" | "findMany">;
    message: Pick<
      PrismaClient["message"],
      "findUnique" | "findFirst" | "create"
    >;
  };

export type HandleInboundSmsDeps = {
  db?: InboundSmsDb;
  scheduleNotify?: (
    input: NotifyAssignedAgentOfCustomerChatMessageInput,
  ) => void;
  scheduleAssignedAgentSmsNotify?: (
    input: AssignedAgentInboundSmsNotifyInput,
  ) => void;
  recordLeadActivity?: typeof recordSmsLeadActivity;
  twilioManagesKeywordReplies?: boolean;
};

function defaultDb(): InboundSmsDb {
  return prisma as unknown as InboundSmsDb;
}

function resolveInboundSid(params: InboundSmsFields): string | null {
  const sid = (params.MessageSid ?? params.SmsSid ?? "").trim();
  if (!sid || sid.length > INBOUND_TWILIO_SID_MAX_LENGTH) return null;
  if (/\s/.test(sid)) return null;
  return sid;
}

async function alreadyProcessed(
  db: InboundSmsDb,
  sid: string,
): Promise<boolean> {
  const existing = await db.message.findUnique({
    where: { twilioMessageSid: sid },
    select: { id: true },
  });
  if (existing) return true;
  return findInboundSmsQuarantineSid(sid, db);
}

async function quarantine(
  db: InboundSmsDb,
  input: {
    sid: string;
    fromE164: string;
    toE164: string;
    reason: string;
    workspaceId?: string | null;
  },
): Promise<"created" | "duplicate" | "invalid"> {
  return quarantineInboundSms(
    {
      twilioMessageSid: input.sid,
      fromE164: input.fromE164,
      toE164: input.toE164,
      reason: input.reason,
      workspaceId: input.workspaceId ?? null,
    },
    db,
  );
}

async function findWorkspaceByTo(
  db: InboundSmsDb,
  toE164: string,
): Promise<{ id: string; twilioSubaccountSid: string | null } | null> {
  const workspace = await db.workspace.findUnique({
    where: { twilioPhoneE164: toE164 },
    select: { id: true, twilioSubaccountSid: true },
  });
  if (!workspace?.id) return null;
  return {
    id: workspace.id,
    twilioSubaccountSid: workspace.twilioSubaccountSid ?? null,
  };
}

function inboundAccountSidMatchesWorkspace(
  workspaceSubaccountSid: string | null,
  accountSid: string | null | undefined,
): boolean {
  if (!workspaceSubaccountSid) return true;
  return (
    isTwilioSid(accountSid, "AC") && accountSid === workspaceSubaccountSid
  );
}

async function findLeadsInWorkspaceByFrom(
  db: InboundSmsDb,
  workspaceId: string,
  fromE164: string,
): Promise<InboundLeadRow[]> {
  const rows = await db.lead.findMany({
    where: {
      workspaceId,
      customer: { is: { phoneE164: fromE164 } },
    },
    select: {
      id: true,
      workspaceId: true,
      assignedAgentId: true,
      customerId: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneE164: true,
        },
      },
    },
  });
  return rows.filter(
    (row) => row.workspaceId === workspaceId && row.customer?.phoneE164 === fromE164,
  );
}

async function lastOutboundLeadId(
  db: InboundSmsDb,
  workspaceId: string,
  fromE164: string,
  candidateLeadIds: string[],
): Promise<string | null> {
  if (candidateLeadIds.length === 0) return null;
  const latest = await db.message.findFirst({
    where: {
      workspaceId,
      channel: "SMS",
      smsTo: fromE164,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { leadId: true },
  });
  if (!latest?.leadId) return null;
  return candidateLeadIds.includes(latest.leadId) ? latest.leadId : null;
}

async function persistInboundCustomerSms(
  db: InboundSmsDb,
  input: {
    workspaceId: string;
    lead: InboundLeadRow;
    sid: string;
    fromE164: string;
    toE164: string;
    body: string;
  },
  deps: HandleInboundSmsDeps,
): Promise<"persisted" | "duplicate" | "persist_failed"> {
  const senderName = frozenCustomerChatDisplayName({
    name: input.lead.customer?.name ?? null,
    email: input.lead.customer?.email ?? null,
  });
  try {
    const created = await createConversationMessage(db, {
      workspaceId: input.workspaceId,
      leadId: input.lead.id,
      channel: "SMS",
      kind: "TEXT",
      senderKind: "CUSTOMER",
      senderUserId: input.lead.customer?.id ?? input.lead.customerId,
      senderName,
      body: input.body,
      smsSource: "TWILIO",
      twilioMessageSid: input.sid,
      smsFrom: input.fromE164,
      smsTo: input.toE164,
      providerStatus: "received",
    });
    if (!created.ok) {
      return "persist_failed";
    }
    if (!created.created) {
      return "duplicate";
    }
    try {
      const recordActivity =
        deps.recordLeadActivity ?? recordSmsLeadActivity;
      await recordActivity(db, {
        leadId: input.lead.id,
        workspaceId: input.workspaceId,
        messageId: created.message.id,
        body: input.body,
        direction: "inbound",
        userId: null,
      });
    } catch {
      // Persistence already succeeded.
    }
    try {
      const schedule =
        deps.scheduleNotify ?? scheduleNotifyAssignedAgentOfCustomerChatMessage;
      schedule({
        leadId: input.lead.id,
        trustedWorkspaceId: input.workspaceId,
        created: true,
        message: {
          id: created.message.id,
          channel: created.message.channel,
          kind: created.message.kind,
          senderKind: created.message.senderKind,
          senderName: created.message.senderName,
          body: created.message.body,
        },
      });
    } catch {
      // Persistence already succeeded.
    }
    try {
      const scheduleSms =
        deps.scheduleAssignedAgentSmsNotify ??
        scheduleNotifyAssignedAgentOfInboundSmsByCell;
      scheduleSms({
        workspaceId: input.workspaceId,
        leadId: input.lead.id,
        leadName: senderName,
        replyBody: input.body,
        leadPhoneE164: input.fromE164,
        assignedAgentId: input.lead.assignedAgentId,
      });
    } catch {
      // Persistence already succeeded.
    }
    return "persisted";
  } catch {
    return "persist_failed";
  }
}

/**
 * Process a signature-validated inbound Twilio SMS payload.
 * Always safe to answer 200 + TwiML. Does not throw CRM identity.
 */
export async function handleInboundTwilioSms(
  params: InboundSmsFields,
  deps: HandleInboundSmsDeps = {},
): Promise<HandleInboundSmsResult> {
  const db = deps.db ?? defaultDb();
  const managedReplies =
    deps.twilioManagesKeywordReplies ?? twilioManagesKeywordReplies();
  const empty = { twiml: emptyTwiml(), created: false as const };

  const sid = resolveInboundSid(params);
  if (!sid) {
    return { ...empty, outcome: "invalid_payload" };
  }
  if (await alreadyProcessed(db, sid)) {
    return { ...empty, outcome: "duplicate" };
  }

  const fromE164 = normalizeToE164(params.From);
  const toE164 = normalizeToE164(params.To);
  if (!fromE164 || !toE164 || !isE164(fromE164) || !isE164(toE164)) {
    return { ...empty, outcome: "invalid_payload" };
  }

  const rawBody = params.Body ?? "";
  if (rawBody.length > INBOUND_SMS_TEXT_MAX_LENGTH) {
    await quarantine(db, {
      sid,
      fromE164,
      toE164,
      reason: "body_too_long",
    });
    return { ...empty, outcome: "body_too_long" };
  }

  const workspace = await findWorkspaceByTo(db, toE164);
  const workspaceId = workspace?.id ?? null;
  if (
    workspace &&
    !inboundAccountSidMatchesWorkspace(
      workspace.twilioSubaccountSid,
      params.AccountSid,
    )
  ) {
    await quarantine(db, {
      sid,
      fromE164,
      toE164,
      reason: "account_mismatch",
      workspaceId,
    });
    return { ...empty, outcome: "account_mismatch" };
  }

  const keyword = classifyInboundSmsKeyword(rawBody);

  if (keyword) {
    if (!workspaceId) {
      await quarantine(db, {
        sid,
        fromE164,
        toE164,
        reason: "unknown_workspace",
      });
      return { ...empty, outcome: "unknown_workspace" };
    }
    if (keyword === "STOP") {
      await suppressPhone(
        {
          workspaceId,
          phoneE164: fromE164,
          keyword: "STOP",
          source: "twilio_inbound",
        },
        db,
      );
    } else if (keyword === "START") {
      await clearPhoneSuppression(
        { workspaceId, phoneE164: fromE164 },
        db,
      );
    }
    const reason =
      keyword === "STOP"
        ? "keyword_stop"
        : keyword === "START"
          ? "keyword_start"
          : "keyword_help";
    const q = await quarantine(db, {
      sid,
      fromE164,
      toE164,
      reason,
      workspaceId,
    });
    if (q === "duplicate") {
      return { ...empty, outcome: "duplicate" };
    }
    return {
      outcome: reason,
      twiml: keywordTwiml(keyword, managedReplies),
      created: false,
    };
  }

  if (!workspaceId) {
    await quarantine(db, {
      sid,
      fromE164,
      toE164,
      reason: "unknown_workspace",
    });
    return { ...empty, outcome: "unknown_workspace" };
  }

  const body = rawBody.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!body) {
    await quarantine(db, {
      sid,
      fromE164,
      toE164,
      reason: "empty_body",
      workspaceId,
    });
    return { ...empty, outcome: "unknown_customer" };
  }

  const matches = await findLeadsInWorkspaceByFrom(db, workspaceId, fromE164);
  let lead: InboundLeadRow | null = null;
  if (matches.length === 1) {
    lead = matches[0] ?? null;
  } else if (matches.length > 1) {
    const tied = await lastOutboundLeadId(
      db,
      workspaceId,
      fromE164,
      matches.map((row) => row.id),
    );
    lead = tied ? (matches.find((row) => row.id === tied) ?? null) : null;
    if (!lead) {
      await quarantine(db, {
        sid,
        fromE164,
        toE164,
        reason: "ambiguous_customer",
        workspaceId,
      });
      return { ...empty, outcome: "ambiguous_customer" };
    }
  }

  if (!lead) {
    await quarantine(db, {
      sid,
      fromE164,
      toE164,
      reason: "unknown_customer",
      workspaceId,
    });
    return { ...empty, outcome: "unknown_customer" };
  }

  const persisted = await persistInboundCustomerSms(
    db,
    {
      workspaceId,
      lead,
      sid,
      fromE164,
      toE164,
      body,
    },
    deps,
  );
  if (persisted === "duplicate") {
    return { ...empty, outcome: "duplicate" };
  }
  if (persisted === "persist_failed") {
    await quarantine(db, {
      sid,
      fromE164,
      toE164,
      reason: "persist_failed",
      workspaceId,
    });
    return { ...empty, outcome: "persist_failed" };
  }
  return { ...empty, outcome: "persisted", created: true };
}
