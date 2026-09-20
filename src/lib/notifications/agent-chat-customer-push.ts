/**
 * V1 Agent Chat → Customer FCM.
 *
 * Triggered after a newly persisted AGENT TEXT Message on CHAT.
 * Best-effort: Chat persist never depends on push. SMS is not pushed —
 * the SMS itself is the notification.
 *
 * Type `agent_chat` is consumer-only (houzzat shell). Do not reuse the
 * staff Chat-to-Agent push type. Deep link is `/account/chat`.
 *
 * Dedupe: `created === false` skips. One newly inserted Message.id → at
 * most one outer schedule.
 */
import { CUSTOMER_CHAT_PAGE_HREF } from "@/lib/customer-chat/query";
import { isPushTypeEnabled } from "@/lib/notifications/catalog";
import {
  deliverPushToUsersNow,
  type PushDeliveryResult,
  type PushPayload,
} from "@/lib/notifications/push";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import type {
  MessageChannel,
  MessageKind,
  MessageSenderKind,
} from "@prisma/client";

export const AGENT_CHAT_CUSTOMER_PUSH_TYPE = "agent_chat" as const;
export const AGENT_CHAT_CUSTOMER_PUSH_PREVIEW_MAX = 120;
export const AGENT_CHAT_CUSTOMER_PUSH_TITLE = "New message from your agent";
export const AGENT_CHAT_CUSTOMER_PUSH_BODY_FALLBACK = "You received a new message";

export type AgentChatCustomerPushMessage = {
  id: string;
  channel: MessageChannel;
  kind: MessageKind;
  senderKind: MessageSenderKind;
  senderName: string;
  body: string | null;
};

export type NotifyCustomerOfAgentChatMessageInput = {
  leadId: string;
  trustedWorkspaceId: string;
  created: boolean;
  message: AgentChatCustomerPushMessage;
};

export type AgentChatCustomerPushLead = {
  id: string;
  workspaceId: string | null;
  customerId: string | null;
};

export type AgentChatCustomerPushRecipient = {
  id: string;
  disabledAt: Date | null;
  pushNotificationPrefs: unknown;
};

export type AgentChatCustomerPushDeps = {
  loadLead?: (leadId: string) => Promise<AgentChatCustomerPushLead | null>;
  loadCustomer?: (
    userId: string,
  ) => Promise<AgentChatCustomerPushRecipient | null>;
  deliverPushToUsersNow?: typeof deliverPushToUsersNow;
  scheduleWorkerSideEffect?: typeof scheduleWorkerSideEffect;
};

const ID_PREFIX_LEN = 8;

function idPrefix(id: string): string {
  return id.slice(0, ID_PREFIX_LEN);
}

export function isAgentChatCustomerPushEligible(
  input: NotifyCustomerOfAgentChatMessageInput,
): boolean {
  return (
    input.created === true &&
    input.message.channel === "CHAT" &&
    input.message.kind === "TEXT" &&
    input.message.senderKind === "AGENT"
  );
}

export function agentChatCustomerPushPreview(
  body: string | null | undefined,
): string {
  if (body == null) return AGENT_CHAT_CUSTOMER_PUSH_BODY_FALLBACK;
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) return AGENT_CHAT_CUSTOMER_PUSH_BODY_FALLBACK;
  if (normalized.length <= AGENT_CHAT_CUSTOMER_PUSH_PREVIEW_MAX) {
    return normalized;
  }
  let end = AGENT_CHAT_CUSTOMER_PUSH_PREVIEW_MAX;
  if (end > 0 && (normalized.charCodeAt(end - 1) & 0xfc00) === 0xd800) {
    end -= 1;
  }
  const sliced = normalized.slice(0, end).trimEnd();
  return sliced || AGENT_CHAT_CUSTOMER_PUSH_BODY_FALLBACK;
}

export function buildAgentChatCustomerPushPayload(input: {
  body: string | null;
}): PushPayload {
  return {
    type: AGENT_CHAT_CUSTOMER_PUSH_TYPE,
    title: AGENT_CHAT_CUSTOMER_PUSH_TITLE,
    body: agentChatCustomerPushPreview(input.body),
    href: CUSTOMER_CHAT_PAGE_HREF,
  };
}

function skipLog(
  reason: string,
  extra: Record<string, string | number | boolean | null | undefined>,
): void {
  console.info(`[customer-notify] agent_chat skipped: ${reason}`, extra);
}

function defaultLoadLead(
  leadId: string,
): Promise<AgentChatCustomerPushLead | null> {
  return prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, workspaceId: true, customerId: true },
  });
}

function defaultLoadCustomer(
  userId: string,
): Promise<AgentChatCustomerPushRecipient | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, disabledAt: true, pushNotificationPrefs: true },
  });
}

export function formatAgentChatCustomerEnqueueLog(input: {
  messageId: string;
  leadId: string;
  recipientUserId: string;
}): string {
  return `[customer-notify] agent_chat enqueue messageId=${input.messageId} leadIdPrefix=${idPrefix(input.leadId)} recipientPrefix=${idPrefix(input.recipientUserId)}`;
}

export function formatAgentChatCustomerFcmResultLog(
  userId: string,
  result: Pick<
    PushDeliveryResult,
    | "status"
    | "deviceCount"
    | "sentCount"
    | "failedCount"
    | "skippedCount"
    | "unregisteredCount"
  >,
): string {
  const prefix = idPrefix(userId);
  if (typeof result.deviceCount !== "number") {
    return `[push:fcm] result type=agent_chat userPrefix=${prefix} shell=houzzat status=${result.status}`;
  }
  return `[push:fcm] result type=agent_chat userPrefix=${prefix} shell=houzzat devices=${result.deviceCount} sent=${result.sentCount ?? 0} failed=${result.failedCount ?? 0} skipped=${result.skippedCount ?? 0} unregistered=${result.unregisteredCount ?? 0} status=${result.status}`;
}

export async function notifyCustomerOfAgentChatMessage(
  input: NotifyCustomerOfAgentChatMessageInput,
  deps: AgentChatCustomerPushDeps = {},
): Promise<void> {
  try {
    if (!isAgentChatCustomerPushEligible(input)) {
      if (input.created === false) {
        skipLog("replay", { messageId: input.message.id });
      }
      return;
    }

    const loadLead = deps.loadLead ?? defaultLoadLead;
    const lead = await loadLead(input.leadId);
    if (!lead) {
      skipLog("lead missing", { messageId: input.message.id });
      return;
    }
    if (!lead.workspaceId || lead.workspaceId !== input.trustedWorkspaceId) {
      skipLog("workspace mismatch", {
        messageId: input.message.id,
        leadId: lead.id,
      });
      return;
    }
    const customerId = lead.customerId?.trim() || "";
    if (!customerId) {
      skipLog("no customer", { messageId: input.message.id, leadId: lead.id });
      return;
    }

    const loadCustomer = deps.loadCustomer ?? defaultLoadCustomer;
    const customer = await loadCustomer(customerId);
    if (!customer || customer.disabledAt) {
      skipLog("disabled or missing customer", {
        messageId: input.message.id,
        leadId: lead.id,
      });
      return;
    }
    if (
      !isPushTypeEnabled(customer.pushNotificationPrefs, AGENT_CHAT_CUSTOMER_PUSH_TYPE)
    ) {
      skipLog("preference off", {
        messageId: input.message.id,
        leadId: lead.id,
      });
      return;
    }

    const payload = buildAgentChatCustomerPushPayload({
      body: input.message.body,
    });
    console.info(
      formatAgentChatCustomerEnqueueLog({
        messageId: input.message.id,
        leadId: lead.id,
        recipientUserId: customerId,
      }),
    );
    const deliver = deps.deliverPushToUsersNow ?? deliverPushToUsersNow;
    const results = await deliver([customerId], payload);
    const row = results[0];
    if (row) {
      console.info(formatAgentChatCustomerFcmResultLog(customerId, row));
    } else {
      console.info(
        formatAgentChatCustomerFcmResultLog(customerId, { status: "no_device" }),
      );
    }
  } catch (error) {
    console.error("[customer-notify] agent_chat failed", {
      messageId: input.message.id,
      leadId: input.leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scheduleNotifyCustomerOfAgentChatMessage(
  input: NotifyCustomerOfAgentChatMessageInput,
  deps: AgentChatCustomerPushDeps = {},
): void {
  try {
    if (!isAgentChatCustomerPushEligible(input)) {
      if (input.created === false) {
        skipLog("replay", { messageId: input.message.id });
      }
      return;
    }
    const schedule = deps.scheduleWorkerSideEffect ?? scheduleWorkerSideEffect;
    schedule(
      notifyCustomerOfAgentChatMessage(input, deps).catch((error) => {
        console.error("[customer-notify] agent_chat failed", {
          messageId: input.message.id,
          leadId: input.leadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  } catch (error) {
    console.error("[customer-notify] agent_chat schedule failed", {
      messageId: input.message.id,
      leadId: input.leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
