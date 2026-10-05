import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import {
  applyResendSuppressionEvent,
  classifyResendDeliveryEvent,
  type ResendDeliveryEvent,
} from "@/lib/communications/resend-delivery";
import {
  prismaEmailSuppressionStore,
  prismaPreferenceAuditStore,
} from "@/lib/communications/stores";
import { prisma as defaultPrisma } from "@/lib/prisma";

type EmailLogRow = {
  id: string;
  toEmail: string;
  workspaceId: string | null;
  leadId: string;
  lead: { workspaceId: string | null; customerId: string | null };
};

type EmailLogLookup = {
  findByProviderId(providerId: string): Promise<EmailLogRow | null>;
};

/**
 * Resolve bounce/complaint through LeadEmailLog only — never User.findFirst(email).
 */
export async function handleResendSuppressionWebhook(input: {
  event: ResendDeliveryEvent;
  webhookEventId?: string | null;
  db?: EmailLogLookup;
}): Promise<{ handled: boolean; suppressed: boolean }> {
  const classified = classifyResendDeliveryEvent(input.event);
  if (classified.action === "ignore" && classified.why === "not_delivery") {
    return { handled: false, suppressed: false };
  }
  if (classified.action === "ignore") {
    return { handled: true, suppressed: false };
  }

  const providerId = input.event.data?.email_id?.trim();
  if (!providerId) return { handled: true, suppressed: false };

  const lookup: EmailLogLookup = input.db ?? {
    findByProviderId: (id) =>
      defaultPrisma.leadEmailLog.findUnique({
        where: { providerId: id },
        select: {
          id: true,
          toEmail: true,
          workspaceId: true,
          leadId: true,
          lead: { select: { workspaceId: true, customerId: true } },
        },
      }),
  };
  const log = await lookup.findByProviderId(providerId);
  if (!log) return { handled: true, suppressed: false };

  const workspaceId = log.workspaceId ?? log.lead.workspaceId;
  if (!workspaceId) return { handled: true, suppressed: false };

  const fromLog = normalizeIdentityEmail(log.toEmail);
  const fromEvent = input.event.data?.to?.[0]
    ? normalizeIdentityEmail(input.event.data.to[0])
    : null;
  if (fromEvent && fromEvent !== fromLog) {
    return { handled: true, suppressed: false };
  }

  const result = await applyResendSuppressionEvent({
    event: input.event,
    webhookEventId: input.webhookEventId,
    context: {
      workspaceId,
      userId: log.lead.customerId,
      leadId: log.leadId,
      emailNormalized: fromLog,
      leadEmailLogId: log.id,
    },
    suppressionStore: prismaEmailSuppressionStore(),
    auditStore: prismaPreferenceAuditStore(),
  });

  return { handled: true, suppressed: result.suppressed };
}
