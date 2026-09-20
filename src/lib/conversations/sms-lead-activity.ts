/**
 * Lead Activity Timeline rows for persisted Conversation Chat/SMS messages.
 * Callers write this after Conversation/Message success. Keywords, quarantine,
 * and staff notify SMS must not create engagement/consent activity here.
 */
import type { PrismaClient } from "@prisma/client";

export type ConversationLeadActivityChannel = "CHAT" | "SMS";
export type ConversationLeadActivityDirection = "inbound" | "outbound";

export type ConversationLeadActivityDb = {
  leadActivity: Pick<PrismaClient["leadActivity"], "create" | "findFirst">;
};

/** @deprecated Use ConversationLeadActivityDb. */
export type SmsLeadActivityDb = ConversationLeadActivityDb;

export type RecordConversationLeadActivityInput = {
  leadId: string;
  workspaceId: string;
  messageId: string;
  body: string;
  channel: ConversationLeadActivityChannel;
  direction: ConversationLeadActivityDirection;
  userId?: string | null;
  automationKey?: string | null;
  recipient?: "LEAD" | "AGENT";
};

export type RecordSmsLeadActivityInput = Omit<
  RecordConversationLeadActivityInput,
  "channel"
>;

export function conversationLeadActivityLookupWhere(input: {
  leadId: string;
  channel: ConversationLeadActivityChannel;
  messageId: string;
}) {
  return {
    leadId: input.leadId,
    type: input.channel,
    meta: {
      path: ["messageId"],
      equals: input.messageId,
    },
  };
}

export async function recordConversationLeadActivity(
  db: ConversationLeadActivityDb,
  input: RecordConversationLeadActivityInput,
): Promise<{ created: boolean }> {
  const leadId = input.leadId.trim();
  const workspaceId = input.workspaceId.trim();
  const messageId = input.messageId.trim();
  const channel = input.channel;
  if (!leadId || !workspaceId || !messageId) return { created: false };
  if (channel !== "CHAT" && channel !== "SMS") return { created: false };

  const existing = await db.leadActivity.findFirst({
    where: conversationLeadActivityLookupWhere({
      leadId,
      channel,
      messageId,
    }),
    select: { id: true },
  });
  if (existing?.id) return { created: false };

  await db.leadActivity.create({
    data: {
      leadId,
      userId: input.userId?.trim() || null,
      type: channel,
      body: input.body,
      meta: {
        channel,
        direction: input.direction,
        messageId,
        workspaceId,
        ...(input.automationKey ? { automationKey: input.automationKey } : {}),
        ...(input.recipient ? { recipient: input.recipient } : {}),
      },
    },
  });
  return { created: true };
}

export async function recordSmsLeadActivity(
  db: ConversationLeadActivityDb,
  input: RecordSmsLeadActivityInput,
): Promise<void> {
  await recordConversationLeadActivity(db, {
    ...input,
    channel: "SMS",
  });
}
