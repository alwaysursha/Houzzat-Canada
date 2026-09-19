import { prisma } from "@/lib/prisma";
import { isE164 } from "@/lib/sms/e164";

export type QuarantineInboundSmsInput = {
  twilioMessageSid: string;
  fromE164: string;
  toE164: string;
  reason: string;
  workspaceId?: string | null;
  receivedAt?: Date;
};

export type QuarantineInboundSmsResult = "created" | "duplicate" | "invalid";

export type InboundSmsQuarantineDb = {
  inboundSmsQuarantine: {
    findUnique: (args: {
      where: { twilioMessageSid: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
    create: (args: {
      data: {
        twilioMessageSid: string;
        fromE164: string;
        toE164: string;
        reason: string;
        workspaceId?: string | null;
        receivedAt: Date;
      };
    }) => Promise<unknown>;
  };
};

function defaultDb(): InboundSmsQuarantineDb {
  return prisma as unknown as InboundSmsQuarantineDb;
}

/**
 * Persist unknown inbound SMS metadata. Never creates a Lead or Conversation.
 * Body is intentionally not stored.
 */
export async function findInboundSmsQuarantineSid(
  twilioMessageSid: string,
  db: InboundSmsQuarantineDb = defaultDb(),
): Promise<boolean> {
  const sid = twilioMessageSid.trim();
  if (!sid) return false;
  const row = await db.inboundSmsQuarantine.findUnique({
    where: { twilioMessageSid: sid },
    select: { id: true },
  });
  return Boolean(row);
}

export async function quarantineInboundSms(
  input: QuarantineInboundSmsInput,
  db: InboundSmsQuarantineDb = defaultDb(),
): Promise<QuarantineInboundSmsResult> {
  const sid = input.twilioMessageSid.trim();
  const reason = input.reason.trim();
  if (!sid || !reason) return "invalid";
  if (!isE164(input.fromE164) || !isE164(input.toE164)) return "invalid";

  try {
    await db.inboundSmsQuarantine.create({
      data: {
        twilioMessageSid: sid,
        fromE164: input.fromE164,
        toE164: input.toE164,
        reason,
        workspaceId: input.workspaceId ?? null,
        receivedAt: input.receivedAt ?? new Date(),
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
