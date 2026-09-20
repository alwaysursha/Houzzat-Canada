/**
 * Best-effort staff SMS to the assigned Agent after a valid Lead inbound reply.
 * Does not persist onto the Lead conversation and does not create consent.
 */
import { chatsPageHref } from "@/lib/agent/chats-inbox-query";
import { SITE_URL } from "@/lib/constants";
import { customerChatPushPreview } from "@/lib/notifications/customer-chat-agent-push";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { isE164, normalizeToE164 } from "@/lib/sms/e164";
import { sendSms, type SmsTransportDeps } from "@/lib/sms/transport";
import type { SendSmsResult } from "@/lib/sms/types";

export type AssignedAgentInboundSmsNotifyInput = {
  workspaceId: string;
  leadId: string;
  leadName: string;
  replyBody: string;
  leadPhoneE164: string | null;
  assignedAgentId: string | null;
};

export type AssignedAgentInboundSmsNotifyDeps = {
  loadAssignee?: (
    userId: string,
  ) => Promise<{
    phoneE164: string | null;
    phone: string | null;
    disabledAt: Date | null;
  } | null>;
  sendSms?: (
    input: Parameters<typeof sendSms>[0],
    deps?: SmsTransportDeps,
  ) => Promise<SendSmsResult>;
  scheduleWorkerSideEffect?: typeof scheduleWorkerSideEffect;
};

export function assignedAgentInboundSmsConversationUrl(leadId: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}${chatsPageHref(leadId)}`;
}

export function formatAssignedAgentInboundSmsNotification(input: {
  leadName: string;
  replyBody: string;
  leadId: string;
}): string {
  const name = input.leadName.replace(/\s+/g, " ").trim() || "Lead";
  const preview = customerChatPushPreview(input.replyBody);
  const url = assignedAgentInboundSmsConversationUrl(input.leadId);
  return `${name}: ${preview}\n${url}`;
}

export type AssignedAgentNotifySkipReason =
  | "NO_AGENT_PHONE"
  | "AGENT_PHONE_IS_LEAD";

export type AssignedAgentNotifyDestination =
  | { to: string; reason: null }
  | { to: null; reason: AssignedAgentNotifySkipReason };

export function resolveAssignedAgentNotifyDestination(input: {
  agentPhoneE164: string | null | undefined;
  agentPhone: string | null | undefined;
  leadPhoneE164: string | null | undefined;
}): AssignedAgentNotifyDestination {
  const fromE164 = isE164(input.agentPhoneE164)
    ? input.agentPhoneE164
    : null;
  const to = fromE164 ?? normalizeToE164(input.agentPhone ?? null);
  if (!to || !isE164(to)) return { to: null, reason: "NO_AGENT_PHONE" };
  if (input.leadPhoneE164 && to === input.leadPhoneE164) {
    return { to: null, reason: "AGENT_PHONE_IS_LEAD" };
  }
  return { to, reason: null };
}

export function resolveAssignedAgentNotifyToE164(input: {
  agentPhoneE164: string | null | undefined;
  agentPhone: string | null | undefined;
  leadPhoneE164: string | null | undefined;
}): string | null {
  return resolveAssignedAgentNotifyDestination(input).to;
}

async function defaultLoadAssignee(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { phoneE164: true, phone: true, disabledAt: true },
  });
}

export async function notifyAssignedAgentOfInboundSmsByCell(
  input: AssignedAgentInboundSmsNotifyInput,
  deps: AssignedAgentInboundSmsNotifyDeps = {},
): Promise<void> {
  try {
    const agentId = input.assignedAgentId?.trim() || "";
    const workspaceId = input.workspaceId.trim();
    if (!agentId || !workspaceId || !input.leadId.trim()) return;

    const loadAssignee = deps.loadAssignee ?? defaultLoadAssignee;
    const assignee = await loadAssignee(agentId);
    if (!assignee || assignee.disabledAt) return;

    const to = resolveAssignedAgentNotifyToE164({
      agentPhoneE164: assignee.phoneE164,
      agentPhone: assignee.phone,
      leadPhoneE164: input.leadPhoneE164,
    });
    if (!to) return;

    const send = deps.sendSms ?? sendSms;
    await send({
      to,
      body: formatAssignedAgentInboundSmsNotification({
        leadName: input.leadName,
        replyBody: input.replyBody,
        leadId: input.leadId,
      }),
      smsClass: "staff",
      workspaceId,
    });
  } catch (error) {
    console.error("[sms:agent-notify] failed", {
      leadId: input.leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scheduleNotifyAssignedAgentOfInboundSmsByCell(
  input: AssignedAgentInboundSmsNotifyInput,
  deps: AssignedAgentInboundSmsNotifyDeps = {},
): void {
  try {
    const schedule = deps.scheduleWorkerSideEffect ?? scheduleWorkerSideEffect;
    schedule(
      notifyAssignedAgentOfInboundSmsByCell(input, deps).catch((error) => {
        console.error("[sms:agent-notify] failed", {
          leadId: input.leadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  } catch (error) {
    console.error("[sms:agent-notify] schedule failed", {
      leadId: input.leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
