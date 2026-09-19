import { prisma } from "@/lib/prisma";
import { isE164 } from "@/lib/sms/e164";

export type OutboundSmsDeadLetterInput = {
  twilioMessageSid: string;
  workspaceId: string;
  leadId: string;
  conversationId?: string | null;
  fromE164: string;
  toE164: string;
  reason: string;
};

export type OutboundSmsDeadLetterDb = {
  outboundSmsDeadLetter: {
    create: (args: {
      data: {
        twilioMessageSid: string;
        workspaceId: string;
        leadId: string;
        conversationId?: string | null;
        fromE164: string;
        toE164: string;
        reason: string;
      };
    }) => Promise<unknown>;
  };
};

function defaultDb(): OutboundSmsDeadLetterDb {
  return prisma as unknown as OutboundSmsDeadLetterDb;
}

/**
 * Record a Twilio-accepted SMS that could not be persisted as a Message.
 * Unique on MessageSid — a retry of this write is not a resend.
 */
export async function recordOutboundSmsDeadLetter(
  input: OutboundSmsDeadLetterInput,
  db: OutboundSmsDeadLetterDb = defaultDb(),
): Promise<"created" | "duplicate" | "invalid"> {
  const twilioMessageSid = input.twilioMessageSid.trim();
  const workspaceId = input.workspaceId.trim();
  const leadId = input.leadId.trim();
  const reason = input.reason.trim();
  if (!twilioMessageSid || !workspaceId || !leadId || !reason) {
    return "invalid";
  }
  if (!isE164(input.fromE164) || !isE164(input.toE164)) return "invalid";

  try {
    await db.outboundSmsDeadLetter.create({
      data: {
        twilioMessageSid,
        workspaceId,
        leadId,
        conversationId: input.conversationId?.trim() || null,
        fromE164: input.fromE164,
        toE164: input.toE164,
        reason,
      },
    });
    return "created";
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return "duplicate";
    }
    throw error;
  }
}
