/**
 * V1 Customer Chat → assigned Agent FCM.
 *
 * Triggered only from the Customer Conversation send flow AFTER a newly
 * persisted CUSTOMER/CHAT/TEXT Message. Best-effort: Message success never
 * depends on push. Recipient is the Lead's current assignedAgentId at
 * dispatch time (re-read), authorized for that Lead/Workspace.
 *
 * Preference: missing `chat_message` key defaults ON (isPushTypeEnabled).
 * No Messages category UI row in V1 — an explicit stored
 * `{ chat_message: false }` is the only way to disable.
 *
 * Dedupe: `created === false` (idempotent/replayed writer result) skips.
 * One newly inserted Message.id → at most one schedule attempt.
 * Message.id is logged, not added to FCM data (existing payload is type+href).
 */
import { chatsPageHref } from "@/lib/agent/chats-inbox-query";
import { isPushTypeEnabled } from "@/lib/notifications/catalog";
import { sendPushToUser, type PushPayload } from "@/lib/notifications/push";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { authorizeStaffRecipientForLead } from "@/lib/workspace-notification-recipients";
import type {
  MessageChannel,
  MessageKind,
  MessageSenderKind,
} from "@prisma/client";

export const CUSTOMER_CHAT_PUSH_TYPE = "chat_message" as const;
export const CUSTOMER_CHAT_PUSH_PREVIEW_MAX = 120;
export const CUSTOMER_CHAT_PUSH_BODY_FALLBACK = "You received a new message";

export type CustomerChatAgentPushMessage = {
  id: string;
  channel: MessageChannel;
  kind: MessageKind;
  senderKind: MessageSenderKind;
  senderName: string;
  body: string | null;
};

export type NotifyAssignedAgentOfCustomerChatMessageInput = {
  leadId: string;
  trustedWorkspaceId: string;
  created: boolean;
  message: CustomerChatAgentPushMessage;
};

export type CustomerChatAgentPushLead = {
  id: string;
  workspaceId: string | null;
  assignedAgentId: string | null;
};

export type CustomerChatAgentPushAssignee = {
  id: string;
  disabledAt: Date | null;
  pushNotificationPrefs: unknown;
};

export type CustomerChatAgentPushDeps = {
  loadLead?: (
    leadId: string,
  ) => Promise<CustomerChatAgentPushLead | null>;
  loadAssignee?: (
    userId: string,
  ) => Promise<CustomerChatAgentPushAssignee | null>;
  authorizeStaffRecipientForLead?: typeof authorizeStaffRecipientForLead;
  sendPushToUser?: typeof sendPushToUser;
  scheduleWorkerSideEffect?: typeof scheduleWorkerSideEffect;
};

function defaultLoadLead(
  leadId: string,
): Promise<CustomerChatAgentPushLead | null> {
  return prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      workspaceId: true,
      assignedAgentId: true,
    },
  });
}

function defaultLoadAssignee(
  userId: string,
): Promise<CustomerChatAgentPushAssignee | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      disabledAt: true,
      pushNotificationPrefs: true,
    },
  });
}

export function isCustomerChatAgentPushEligible(
  input: NotifyAssignedAgentOfCustomerChatMessageInput,
): boolean {
  return (
    input.created === true &&
    input.message.channel === "CHAT" &&
    input.message.kind === "TEXT" &&
    input.message.senderKind === "CUSTOMER"
  );
}

export function customerChatPushTitle(senderName: string): string {
  const name = senderName.replace(/\s+/g, " ").trim();
  return `New message from ${name || "a customer"}`;
}

export function customerChatPushPreview(
  body: string | null | undefined,
): string {
  if (body == null) return CUSTOMER_CHAT_PUSH_BODY_FALLBACK;
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) return CUSTOMER_CHAT_PUSH_BODY_FALLBACK;
  if (normalized.length <= CUSTOMER_CHAT_PUSH_PREVIEW_MAX) {
    return normalized;
  }
  let end = CUSTOMER_CHAT_PUSH_PREVIEW_MAX;
  if (end > 0 && (normalized.charCodeAt(end - 1) & 0xfc00) === 0xd800) {
    end -= 1;
  }
  const sliced = normalized.slice(0, end).trimEnd();
  return sliced || CUSTOMER_CHAT_PUSH_BODY_FALLBACK;
}

export function buildCustomerChatAgentPushPayload(input: {
  leadId: string;
  senderName: string;
  body: string | null;
}): PushPayload {
  return {
    type: CUSTOMER_CHAT_PUSH_TYPE,
    title: customerChatPushTitle(input.senderName),
    body: customerChatPushPreview(input.body),
    href: chatsPageHref(input.leadId),
  };
}

function skipLog(
  reason: string,
  extra: Record<string, string | number | boolean | null | undefined>,
): void {
  console.info(`[staff-notify] chat_message skipped: ${reason}`, extra);
}

/**
 * Re-read current Lead owner, authorize, and send one staff FCM.
 * Never throws to callers. Does not mutate CRM/Chat rows.
 */
export async function notifyAssignedAgentOfCustomerChatMessage(
  input: NotifyAssignedAgentOfCustomerChatMessageInput,
  deps: CustomerChatAgentPushDeps = {},
): Promise<void> {
  try {
    if (!isCustomerChatAgentPushEligible(input)) {
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
    const agentId = lead.assignedAgentId;
    if (!agentId) {
      skipLog("unassigned", { messageId: input.message.id, leadId: lead.id });
      return;
    }

    const authorize =
      deps.authorizeStaffRecipientForLead ?? authorizeStaffRecipientForLead;
    const authorized = await authorize({
      userId: agentId,
      leadId: lead.id,
      event: CUSTOMER_CHAT_PUSH_TYPE,
    });
    if (!authorized) {
      skipLog("unauthorized recipient", {
        messageId: input.message.id,
        leadId: lead.id,
      });
      return;
    }

    const loadAssignee = deps.loadAssignee ?? defaultLoadAssignee;
    const assignee = await loadAssignee(agentId);
    if (!assignee || assignee.disabledAt) {
      skipLog("disabled or missing agent", {
        messageId: input.message.id,
        leadId: lead.id,
      });
      return;
    }
    if (
      !isPushTypeEnabled(assignee.pushNotificationPrefs, CUSTOMER_CHAT_PUSH_TYPE)
    ) {
      skipLog("preference off", {
        messageId: input.message.id,
        leadId: lead.id,
      });
      return;
    }

    const payload = buildCustomerChatAgentPushPayload({
      leadId: lead.id,
      senderName: input.message.senderName,
      body: input.message.body,
    });
    const send = deps.sendPushToUser ?? sendPushToUser;
    send(agentId, payload);
  } catch (error) {
    console.error("[staff-notify] chat_message failed", {
      messageId: input.message.id,
      leadId: input.leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Best-effort schedule. Returns immediately. One eligible Message → one
 * schedule. Callers must invoke this only after successful persistence.
 */
export function scheduleNotifyAssignedAgentOfCustomerChatMessage(
  input: NotifyAssignedAgentOfCustomerChatMessageInput,
  deps: CustomerChatAgentPushDeps = {},
): void {
  try {
    if (!isCustomerChatAgentPushEligible(input)) {
      if (input.created === false) {
        skipLog("replay", { messageId: input.message.id });
      }
      return;
    }
    const schedule = deps.scheduleWorkerSideEffect ?? scheduleWorkerSideEffect;
    schedule(
      notifyAssignedAgentOfCustomerChatMessage(input, deps).catch((error) => {
        console.error("[staff-notify] chat_message failed", {
          messageId: input.message.id,
          leadId: input.leadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  } catch (error) {
    console.error("[staff-notify] chat_message schedule failed", {
      messageId: input.message.id,
      leadId: input.leadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
