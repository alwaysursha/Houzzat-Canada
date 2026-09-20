/**
 * Lead Activity Timeline rows for persisted SMS conversation messages.
 * Callers write this after Conversation/Message success. Keywords, quarantine,
 * and staff notify SMS must not create engagement/consent activity here.
 */
import type { PrismaClient } from "@prisma/client";

export type SmsLeadActivityDirection = "inbound" | "outbound";

export type SmsLeadActivityDb = {
  leadActivity: Pick<PrismaClient["leadActivity"], "create">;
};

export type RecordSmsLeadActivityInput = {
  leadId: string;
  workspaceId: string;
  messageId: string;
  body: string;
  direction: SmsLeadActivityDirection;
  userId?: string | null;
  automationKey?: string | null;
  recipient?: "LEAD" | "AGENT";
};

export async function recordSmsLeadActivity(
  db: SmsLeadActivityDb,
  input: RecordSmsLeadActivityInput,
): Promise<void> {
  const leadId = input.leadId.trim();
  const workspaceId = input.workspaceId.trim();
  const messageId = input.messageId.trim();
  if (!leadId || !workspaceId || !messageId) return;

  await db.leadActivity.create({
    data: {
      leadId,
      userId: input.userId?.trim() || null,
      type: "SMS",
      body: input.body,
      meta: {
        channel: "SMS",
        direction: input.direction,
        messageId,
        workspaceId,
        ...(input.automationKey ? { automationKey: input.automationKey } : {}),
        ...(input.recipient ? { recipient: input.recipient } : {}),
      },
    },
  });
}
