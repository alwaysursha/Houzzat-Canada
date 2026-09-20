import { prisma } from "@/lib/prisma";
import { parseTwilioNumSegments } from "@/lib/sms/segments";
import {
  finalizeSmsUsageFromProvider,
  hasSmsUsageDelegate,
  type SmsUsageDb,
} from "@/lib/sms/usage";

export const TWILIO_DELIVERED_STATUS = "delivered";

export type TwilioStatusCallbackFields = {
  MessageSid?: string;
  MessageStatus?: string;
  SmsSid?: string;
  SmsStatus?: string;
  NumSegments?: string;
};

export type TwilioStatusCallbackDb = {
  message: {
    findUnique: (args: {
      where: { twilioMessageSid: string };
      select: {
        id: true;
        workspaceId: true;
        deliveredAt: true;
        providerStatus: true;
      };
    }) => Promise<{
      id: string;
      workspaceId: string;
      deliveredAt: Date | null;
      providerStatus: string | null;
    } | null>;
    update: (args: {
      where: { id: string };
      data: { providerStatus: string; deliveredAt?: Date };
    }) => Promise<unknown>;
  };
  smsUsageEvent?: SmsUsageDb["smsUsageEvent"];
};

function defaultDb(): TwilioStatusCallbackDb {
  return prisma as unknown as TwilioStatusCallbackDb;
}

export function normalizeTwilioMessageStatus(
  raw: string | null | undefined,
): string | null {
  const status = raw?.trim().toLowerCase() ?? "";
  return status || null;
}

export function resolveTwilioCallbackSid(
  params: TwilioStatusCallbackFields,
): string | null {
  const sid = (params.MessageSid ?? params.SmsSid ?? "").trim();
  return sid || null;
}

/**
 * Apply a Twilio delivery callback to the existing Message.
 * Workspace is taken only from the stored row — never from callback From/To.
 */
export async function applyTwilioStatusCallback(
  params: TwilioStatusCallbackFields,
  db: TwilioStatusCallbackDb = defaultDb(),
): Promise<"updated" | "unchanged" | "unknown"> {
  const sid = resolveTwilioCallbackSid(params);
  const providerStatus = normalizeTwilioMessageStatus(
    params.MessageStatus ?? params.SmsStatus,
  );
  if (!sid || !providerStatus) return "unknown";

  const numSegments = parseTwilioNumSegments(params.NumSegments);
  const reconcileSegments = async () => {
    if (numSegments && hasSmsUsageDelegate(db)) {
      try {
        await finalizeSmsUsageFromProvider(sid, numSegments, db);
      } catch {
        // Usage finalize must not fail the delivery callback.
      }
    }
  };

  const existing = await db.message.findUnique({
    where: { twilioMessageSid: sid },
    select: {
      id: true,
      workspaceId: true,
      deliveredAt: true,
      providerStatus: true,
    },
  });
  if (!existing) {
    await reconcileSegments();
    return "unknown";
  }

  const delivered =
    providerStatus === TWILIO_DELIVERED_STATUS && !existing.deliveredAt
      ? new Date()
      : undefined;
  const sameStatus = existing.providerStatus === providerStatus;
  if (sameStatus && !delivered) {
    await reconcileSegments();
    return "unchanged";
  }

  await db.message.update({
    where: { id: existing.id },
    data: {
      providerStatus,
      ...(delivered ? { deliveredAt: delivered } : {}),
    },
  });
  await reconcileSegments();
  return "updated";
}
