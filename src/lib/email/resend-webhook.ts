import { Resend } from "resend";
import { openLeadHandoffHref } from "@/lib/agent/lead-profile-query";
import { handleResendSuppressionWebhook } from "@/lib/communications/resend-webhook-suppression";
import type { ResendDeliveryEvent } from "@/lib/communications/resend-delivery";
import {
  emailClickNotificationCopy,
  emailOpenNotificationCopy,
  shouldNotifyAgentOnEmailOpen,
} from "@/lib/email/email-open-notification";
import { emailEnv } from "@/lib/email/env";
import { sendPushToUser } from "@/lib/notifications/push";
import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { verifyCustomerEmailFromLeadEmailOpen } from "@/lib/auth/email-open-verification";
import { authorizeStaffRecipientForLead } from "@/lib/workspace-notification-recipients";

export type ResendWebhookHandleResult =
  | { ok: true; handled: boolean; type?: string }
  | { ok: false; error: string; status: number };

function getWebhookSecret() {
  return emailEnv("RESEND_WEBHOOK_SECRET");
}

function verifyPayload(rawBody: string, headers: Headers) {
  const webhookSecret = getWebhookSecret();
  if (!webhookSecret) {
    throw new Error("RESEND_WEBHOOK_SECRET is not configured");
  }

  const apiKey = emailEnv("RESEND_API_KEY") || "re_webhook_verify";
  const resend = new Resend(apiKey);
  return resend.webhooks.verify({
    payload: rawBody,
    headers: {
      id: headers.get("svix-id") ?? "",
      timestamp: headers.get("svix-timestamp") ?? "",
      signature: headers.get("svix-signature") ?? "",
    },
    webhookSecret,
  });
}

async function findEmailLog(providerId: string) {
  return prisma.leadEmailLog.findUnique({
    where: { providerId },
    select: {
      id: true,
      leadId: true,
      workspaceId: true,
      subject: true,
      kind: true,
      mlsNumber: true,
      openedAt: true,
      openCount: true,
      clickCount: true,
      lead: {
        select: {
          assignedAgentId: true,
          workspaceId: true,
          customer: { select: { name: true } },
        },
      },
    },
  });
}

/** Address only when this email log carries an MLS# — never from other lead properties. */
async function propertyAddressForEmailMls(
  mlsNumber: string | null | undefined,
): Promise<string | null> {
  const mls = mlsNumber?.trim();
  if (!mls) return null;
  const listing = await prisma.listing.findFirst({
    where: {
      AND: [{ mlsNumber: mls }, excludeStagingSnapshotWhere()],
    },
    select: { addressLine: true },
  });
  const line = listing?.addressLine?.trim();
  return line || null;
}

async function notifyEmailEngagement(input: {
  leadId: string;
  assigneeId: string;
  title: string;
  body: string;
  pushType: "alert_engagement" | "email_engagement";
}) {
  const ok = await authorizeStaffRecipientForLead({
    userId: input.assigneeId,
    leadId: input.leadId,
    event: input.pushType,
  });
  if (!ok) return;
  sendPushToUser(input.assigneeId, {
    type: input.pushType,
    title: input.title,
    body: input.body,
    href: openLeadHandoffHref(input.leadId),
  });
}

async function maybeNotifyFirstOpen(log: NonNullable<
  Awaited<ReturnType<typeof findEmailLog>>
>) {
  if (!shouldNotifyAgentOnEmailOpen(log.kind)) return;
  if (!log.lead.assignedAgentId) return;

  const propertyAddress = await propertyAddressForEmailMls(log.mlsNumber);
  const copy = emailOpenNotificationCopy({
    kind: log.kind,
    subject: log.subject,
    leadName: log.lead.customer?.name ?? null,
    propertyAddress,
  });
  void notifyEmailEngagement({
    leadId: log.leadId,
    assigneeId: log.lead.assignedAgentId,
    title: copy.title,
    body: copy.body,
    pushType: copy.pushType,
  });
}

async function recordOpened(providerId: string, at: Date) {
  const log = await findEmailLog(providerId);
  if (!log) return false;

  const isFirstOpen = !log.openedAt;
  await prisma.leadEmailLog.update({
    where: { id: log.id },
    data: {
      openedAt: log.openedAt ?? at,
      openCount: { increment: 1 },
    },
  });

  if (isFirstOpen) {
    await prisma.leadActivity.create({
      data: {
        leadId: log.leadId,
        type: "email_opened",
        body: `Opened email: ${log.subject}`,
        meta: {
          emailLogId: log.id,
          providerId,
          kind: log.kind,
          previewPath: `/agent/emails/${log.id}`,
        },
      },
    });
    await maybeNotifyFirstOpen(log);
  }

  await verifyCustomerEmailFromLeadEmailOpen({ providerId, at });

  return true;
}

async function recordClicked(
  providerId: string,
  at: Date,
  link: string | null,
) {
  const log = await findEmailLog(providerId);
  if (!log) return false;

  const url = link?.trim().slice(0, 2000) || null;
  const isFirstOpen = !log.openedAt;
  const isFirstClick = log.clickCount === 0;

  await prisma.leadEmailLog.update({
    where: { id: log.id },
    data: {
      clickedAt: at,
      clickCount: { increment: 1 },
      ...(url ? { lastClickedUrl: url } : {}),
      // A click implies the message was opened.
      openedAt: log.openedAt ?? at,
      ...(isFirstOpen ? { openCount: { increment: 1 } } : {}),
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: log.leadId,
      type: "email_clicked",
      body: url
        ? `Clicked link in “${log.subject}”: ${url}`
        : `Clicked a link in “${log.subject}”`,
      meta: {
        emailLogId: log.id,
        providerId,
        url,
        kind: log.kind,
        previewPath: `/agent/emails/${log.id}`,
      },
    },
  });

  if (isFirstOpen) {
    await prisma.leadActivity.create({
      data: {
        leadId: log.leadId,
        type: "email_opened",
        body: `Opened email: ${log.subject}`,
        meta: {
          emailLogId: log.id,
          providerId,
          kind: log.kind,
          previewPath: `/agent/emails/${log.id}`,
          inferredFromClick: true,
        },
      },
    });
    await maybeNotifyFirstOpen(log);
  }

  if (isFirstClick && log.lead.assignedAgentId) {
    const propertyAddress = await propertyAddressForEmailMls(log.mlsNumber);
    const copy = emailClickNotificationCopy({
      kind: log.kind,
      subject: log.subject,
      leadName: log.lead.customer?.name ?? null,
      propertyAddress,
    });
    if (copy) {
      void notifyEmailEngagement({
        leadId: log.leadId,
        assigneeId: log.lead.assignedAgentId,
        title: copy.title,
        body: copy.body,
        pushType: copy.pushType,
      });
    }
  }

  await verifyCustomerEmailFromLeadEmailOpen({ providerId, at });

  return true;
}

/**
 * Verify + apply Resend open/click webhooks to LeadEmailLog + Activity.
 */
export async function handleResendWebhook(
  rawBody: string,
  headers: Headers,
): Promise<ResendWebhookHandleResult> {
  if (!getWebhookSecret()) {
    return {
      ok: false,
      error: "Webhook secret not configured",
      status: 503,
    };
  }

  let event: ReturnType<typeof verifyPayload>;
  try {
    event = verifyPayload(rawBody, headers);
  } catch (err) {
    console.error("[resend:webhook] verify failed", err);
    return { ok: false, error: "Invalid signature", status: 400 };
  }

  const type = event.type;
  const providerId =
    event.data && "email_id" in event.data
      ? String(event.data.email_id ?? "").trim() || undefined
      : undefined;
  const webhookEventId = headers.get("svix-id");

  if (type === "email.opened" || type === "email.clicked") {
    if (!providerId) {
      return { ok: true, handled: false, type };
    }

    const at = new Date(event.created_at || Date.now());
    try {
      if (type === "email.opened") {
        const handled = await recordOpened(providerId, at);
        return { ok: true, handled, type };
      }

      const link =
        "click" in event.data && event.data.click
          ? event.data.click.link
          : null;
      const clickAt =
        "click" in event.data && event.data.click?.timestamp
          ? new Date(event.data.click.timestamp)
          : at;
      const handled = await recordClicked(providerId, clickAt, link);
      return { ok: true, handled, type };
    } catch (err) {
      console.error("[resend:webhook] handle failed", type, providerId, err);
      return { ok: false, error: "Handler failed", status: 500 };
    }
  }

  try {
    const delivery = await handleResendSuppressionWebhook({
      event: event as ResendDeliveryEvent,
      webhookEventId,
    });
    if (delivery.handled) {
      return { ok: true, handled: true, type };
    }
  } catch (err) {
    console.error("[resend:webhook] suppression failed", type, providerId, err);
    return { ok: false, error: "Handler failed", status: 500 };
  }

  return { ok: true, handled: false, type };
}
