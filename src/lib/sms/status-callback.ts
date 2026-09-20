import { prisma } from "@/lib/prisma";
import { parseTwilioNumSegments } from "@/lib/sms/segments";
import {
  finalizeSmsUsageFromProvider,
  hasSmsUsageDelegate,
  type SmsUsageDb,
} from "@/lib/sms/usage";

export const TWILIO_DELIVERED_STATUS = "delivered";

/**
 * Outbound SMS status ranks. Higher must not be overwritten by lower
 * (Twilio callbacks are not ordered). Terminal success is `delivered`.
 */
const TWILIO_PROVIDER_STATUS_RANK: Record<string, number> = {
  accepted: 10,
  scheduled: 10,
  queued: 20,
  sending: 30,
  sent: 40,
  undelivered: 50,
  failed: 50,
  canceled: 50,
  cancelled: 50,
  partially_delivered: 55,
  delivered: 60,
  read: 70,
};

export type TwilioStatusCallbackFields = {
  MessageSid?: string;
  MessageStatus?: string;
  SmsSid?: string;
  SmsStatus?: string;
  NumSegments?: string | number;
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
    updateMany: (args: {
      where: {
        id: string;
        OR?: Array<
          { providerStatus: null } | { providerStatus: { in: string[] } }
        >;
      };
      data: { providerStatus?: string; deliveredAt?: Date };
    }) => Promise<{ count: number }>;
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

export function twilioProviderStatusRank(
  status: string | null | undefined,
): number {
  if (!status) return 0;
  return TWILIO_PROVIDER_STATUS_RANK[status] ?? 0;
}

export function twilioProviderStatusesAtOrBelow(rank: number): string[] {
  return Object.entries(TWILIO_PROVIDER_STATUS_RANK)
    .filter(([, value]) => value <= rank)
    .map(([key]) => key);
}

export function shouldApplyTwilioProviderStatus(
  stored: string | null | undefined,
  incoming: string,
): boolean {
  const incomingRank = twilioProviderStatusRank(incoming);
  const storedRank = twilioProviderStatusRank(stored);
  if (incomingRank > storedRank) return true;
  if (incomingRank < storedRank) return false;
  return incoming !== (stored ?? "");
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
 * Status is monotonic; NumSegments finalizes usage even when status is ignored.
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

  const applyStatus = shouldApplyTwilioProviderStatus(
    existing.providerStatus,
    providerStatus,
  );
  const setDeliveredAt =
    providerStatus === TWILIO_DELIVERED_STATUS && !existing.deliveredAt;

  if (!applyStatus && !setDeliveredAt) {
    await reconcileSegments();
    return "unchanged";
  }

  const allowedStatuses = twilioProviderStatusesAtOrBelow(
    twilioProviderStatusRank(applyStatus ? providerStatus : existing.providerStatus),
  );
  const result = await db.message.updateMany({
    where: {
      id: existing.id,
      OR: [
        { providerStatus: null },
        { providerStatus: { in: allowedStatuses } },
      ],
    },
    data: {
      ...(applyStatus ? { providerStatus } : {}),
      ...(setDeliveredAt ? { deliveredAt: new Date() } : {}),
    },
  });
  await reconcileSegments();
  return result.count > 0 ? "updated" : "unchanged";
}
