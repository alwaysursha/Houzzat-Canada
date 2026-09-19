/**
 * Assigned-Agent outbound SMS on the existing Lead Conversation.
 *
 * CHAT send stays in agent-conversation-send.ts. This module is SMS-only:
 * workspace-number From, customer phoneE164 To, conversational class,
 * Phase-1 STOP suppression, no marketing-alert preference. Twilio first,
 * then persist.
 * Persist failure after Twilio success records a dead-letter and does not
 * resend.
 */
import type { PrismaClient } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import {
  frozenAgentSenderName,
  normalizeAgentChatText,
  presentSentMessage,
  type AgentChatSendPayload,
  type AgentConversationSendDb,
} from "@/lib/conversations/agent-conversation-send";
import { loadAccessibleAgentConversationLead } from "@/lib/conversations/agent-conversation-read";
import { createConversationMessage } from "@/lib/conversations/create-conversation-message";
import { isE164 } from "@/lib/sms/e164";
import { isTwilioSid } from "@/lib/sms/sids";
import {
  recordOutboundSmsDeadLetter,
  type OutboundSmsDeadLetterDb,
} from "@/lib/sms/dead-letter";
import { isPhoneSuppressed, type SmsSuppressionDb } from "@/lib/sms/suppression";
import { sendSms, type SmsTransportDeps } from "@/lib/sms/transport";
import type { SendSmsResult } from "@/lib/sms/types";

export const AGENT_SMS_TEXT_MAX_LENGTH = 1600;

export type AgentSmsBlockedReason =
  | "NOT_ASSIGNED"
  | "NO_CUSTOMER_E164"
  | "NO_WORKSPACE_NUMBER"
  | "SUPPRESSED";

export type AgentSmsSendEligibility = {
  enabled: boolean;
  reason: AgentSmsBlockedReason | null;
  toE164: string | null;
  fromE164: string | null;
};

export type SendAgentLeadSmsResult =
  | { ok: true; data: AgentChatSendPayload }
  | {
      ok: false;
      reason:
        | "LEAD_NOT_FOUND"
        | "FORBIDDEN"
        | "INVALID_BODY"
        | AgentSmsBlockedReason
        | "SMS_TRANSPORT_UNAVAILABLE"
        | "SMS_SEND_FAILED"
        | "SMS_SENT_NOT_SAVED";
    };

export type AgentSmsEligibilityDb = SmsSuppressionDb & {
  lead: Pick<PrismaClient["lead"], "findUnique">;
};

export type AgentSmsContextDb = AgentConversationSendDb &
  AgentSmsEligibilityDb &
  OutboundSmsDeadLetterDb;

export type AgentSmsSendDeps = {
  sendSms?: (
    input: Parameters<typeof sendSms>[0],
    deps?: SmsTransportDeps,
  ) => Promise<SendSmsResult>;
  isPhoneSuppressed?: typeof isPhoneSuppressed;
  recordOutboundSmsDeadLetter?: typeof recordOutboundSmsDeadLetter;
};

type SmsLeadRow = {
  id: string;
  workspaceId: string | null;
  organizationId: string | null;
  assignedAgentId: string | null;
  customer: { phoneE164: string | null } | null;
  workspace: {
    twilioPhoneE164: string | null;
    twilioSubaccountSid: string | null;
    twilioMessagingServiceSid: string | null;
  } | null;
};

const SMS_LEAD_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customer: { select: { phoneE164: true } },
  workspace: {
    select: {
      twilioPhoneE164: true,
      twilioSubaccountSid: true,
      twilioMessagingServiceSid: true,
    },
  },
} as const;

export function agentSmsBlockedCopy(
  reason: AgentSmsBlockedReason | null,
): string | null {
  switch (reason) {
    case "NOT_ASSIGNED":
      return "Only the assigned agent can send SMS.";
    case "NO_CUSTOMER_E164":
      return "SMS is unavailable — this lead has no valid mobile number.";
    case "NO_WORKSPACE_NUMBER":
      return "SMS is unavailable — this workspace has no Twilio number.";
    case "SUPPRESSED":
      return "SMS is unavailable — this number has opted out of SMS.";
    default:
      return null;
  }
}

export function evaluateAgentSmsEligibility(input: {
  viewerUserId: string;
  assignedAgentId: string | null;
  toE164: string | null;
  fromE164: string | null;
  twilioSubaccountSid?: string | null;
  twilioMessagingServiceSid?: string | null;
  suppressed: boolean;
}): AgentSmsSendEligibility {
  const toE164 = input.toE164 && isE164(input.toE164) ? input.toE164 : null;
  const fromE164 =
    input.fromE164 && isE164(input.fromE164) ? input.fromE164 : null;
  const twilioReady =
    Boolean(fromE164) &&
    isTwilioSid(input.twilioSubaccountSid, "AC") &&
    isTwilioSid(input.twilioMessagingServiceSid, "MG");

  if (!input.assignedAgentId || input.assignedAgentId !== input.viewerUserId) {
    return {
      enabled: false,
      reason: "NOT_ASSIGNED",
      toE164,
      fromE164,
    };
  }
  if (!toE164) {
    return {
      enabled: false,
      reason: "NO_CUSTOMER_E164",
      toE164: null,
      fromE164,
    };
  }
  if (!twilioReady) {
    return {
      enabled: false,
      reason: "NO_WORKSPACE_NUMBER",
      toE164,
      fromE164: fromE164,
    };
  }
  if (input.suppressed) {
    return {
      enabled: false,
      reason: "SUPPRESSED",
      toE164,
      fromE164,
    };
  }
  return { enabled: true, reason: null, toE164, fromE164 };
}

async function loadSmsLead(
  db: AgentSmsEligibilityDb,
  ctx: AgentOrgContext,
  leadId: string,
): Promise<SmsLeadRow | null> {
  const id = leadId.trim();
  if (!id) return null;
  const lead = ctx.workspaceId
    ? await db.lead.findUnique({
        where: {
          workspaceId_id: { workspaceId: ctx.workspaceId, id },
        },
        select: SMS_LEAD_SELECT,
      })
    : await db.lead.findUnique({
        where: { id },
        select: SMS_LEAD_SELECT,
      });
  return lead;
}

export async function resolveAgentSmsSendEligibility(
  db: AgentSmsEligibilityDb,
  ctx: AgentOrgContext,
  leadId: string,
  deps: AgentSmsSendDeps = {},
): Promise<AgentSmsSendEligibility | null> {
  const accessible = await loadAccessibleAgentConversationLead(db, ctx, leadId);
  if (!accessible?.workspaceId) return null;

  const lead = await loadSmsLead(db, ctx, accessible.id);
  if (!lead?.workspaceId || lead.workspaceId !== accessible.workspaceId) {
    return null;
  }

  const toE164 = lead.customer?.phoneE164 ?? null;
  const fromE164 = lead.workspace?.twilioPhoneE164 ?? null;
  const suppressedCheck = deps.isPhoneSuppressed ?? isPhoneSuppressed;
  const suppressed =
    isE164(toE164) && isE164(fromE164)
      ? await suppressedCheck(lead.workspaceId, toE164, db)
      : false;

  return evaluateAgentSmsEligibility({
    viewerUserId: ctx.user.id,
    assignedAgentId: lead.assignedAgentId,
    toE164,
    fromE164,
    twilioSubaccountSid: lead.workspace?.twilioSubaccountSid ?? null,
    twilioMessagingServiceSid: lead.workspace?.twilioMessagingServiceSid ?? null,
    suppressed,
  });
}

function normalizeAgentSmsText(raw: string): string | null {
  const text = normalizeAgentChatText(raw);
  if (!text) return null;
  if (text.length > AGENT_SMS_TEXT_MAX_LENGTH) return null;
  return text;
}

export async function sendAgentLeadSmsMessage(
  db: AgentSmsContextDb,
  ctx: AgentOrgContext,
  leadId: string,
  body: string,
  deps: AgentSmsSendDeps = {},
): Promise<SendAgentLeadSmsResult> {
  const text = normalizeAgentSmsText(body);
  if (!text) return { ok: false, reason: "INVALID_BODY" };

  const senderName = frozenAgentSenderName(ctx.user);
  if (!senderName) return { ok: false, reason: "INVALID_BODY" };

  const accessible = await loadAccessibleAgentConversationLead(db, ctx, leadId);
  if (!accessible?.workspaceId) {
    return { ok: false, reason: "LEAD_NOT_FOUND" };
  }
  if (!accessible.assignedAgentId || accessible.assignedAgentId !== ctx.user.id) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const eligibility = await resolveAgentSmsSendEligibility(db, ctx, leadId, deps);
  if (!eligibility) return { ok: false, reason: "LEAD_NOT_FOUND" };
  if (!eligibility.enabled || !eligibility.toE164 || !eligibility.fromE164) {
    return { ok: false, reason: eligibility.reason ?? "FORBIDDEN" };
  }

  const send = deps.sendSms ?? sendSms;
  const sent = await send({
    to: eligibility.toE164,
    fromE164: eligibility.fromE164,
    body: text,
    workspaceId: accessible.workspaceId,
    smsClass: "conversational",
  });

  if (sent.status === "skipped") {
    if (sent.reason === "suppressed") {
      return { ok: false, reason: "SUPPRESSED" };
    }
    if (sent.reason === "invalid_to") {
      return { ok: false, reason: "NO_CUSTOMER_E164" };
    }
    if (
      sent.reason === "invalid_from" ||
      sent.reason === "missing_workspace" ||
      sent.reason === "missing_subaccount" ||
      sent.reason === "missing_messaging_service"
    ) {
      return { ok: false, reason: "NO_WORKSPACE_NUMBER" };
    }
    return { ok: false, reason: "SMS_TRANSPORT_UNAVAILABLE" };
  }
  if (sent.status !== "sent") {
    return { ok: false, reason: "SMS_SEND_FAILED" };
  }

  try {
    const created = await createConversationMessage(db, {
      workspaceId: accessible.workspaceId,
      leadId: accessible.id,
      channel: "SMS",
      kind: "TEXT",
      senderKind: "AGENT",
      senderUserId: ctx.user.id,
      createdByUserId: ctx.user.id,
      senderName,
      body: text,
      smsSource: "TWILIO",
      twilioMessageSid: sent.sid,
      smsFrom: eligibility.fromE164,
      smsTo: eligibility.toE164,
      providerStatus: sent.providerStatus || "queued",
    });

    if (created.ok) {
      return {
        ok: true,
        data: {
          conversation: {
            id: created.conversation.id,
            leadId: created.conversation.leadId,
            lastMessageAt: created.conversation.lastMessageAt
              ? created.conversation.lastMessageAt.toISOString()
              : null,
            created: created.conversationCreated,
          },
          message: presentSentMessage(created.message),
        },
      };
    }
  } catch (error) {
    console.error("[sms:persist]", {
      reason: "exception",
      sid: sent.sid,
      error: error instanceof Error ? error.message : "failed",
    });
  }

  const recordDeadLetter =
    deps.recordOutboundSmsDeadLetter ?? recordOutboundSmsDeadLetter;
  try {
    await recordDeadLetter(
      {
        twilioMessageSid: sent.sid,
        workspaceId: accessible.workspaceId,
        leadId: accessible.id,
        fromE164: eligibility.fromE164,
        toE164: eligibility.toE164,
        reason: "persist_failed_after_send",
      },
      db,
    );
  } catch (error) {
    console.error("[sms:dead-letter]", {
      sid: sent.sid,
      error: error instanceof Error ? error.message : "failed",
    });
  }

  return { ok: false, reason: "SMS_SENT_NOT_SAVED" };
}
