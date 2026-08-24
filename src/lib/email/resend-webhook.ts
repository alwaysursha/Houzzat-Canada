import { Resend } from "resend";
import { isPropertyAlertEmailKind } from "@/lib/agent/email-alert-kinds";
import { openLeadProfileHref } from "@/lib/agent/lead-profile-query";
import { emailEnv } from "@/lib/email/env";
import { sendPushToUser } from "@/lib/notifications/push";
import { prisma } from "@/lib/prisma";

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
      subject: true,
      kind: true,
      openedAt: true,
      openCount: true,
      clickCount: true,
      lead: { select: { assignedAgentId: true } },
    },
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
          previewPath: `/agent/emails/${log.id}`,
        },
      },
    });
    if (isPropertyAlertEmailKind(log.kind) && log.lead.assignedAgentId) {
      void sendPushToUser(log.lead.assignedAgentId, {
        type: "alert_engagement",
        title: "Property alert opened",
        body: log.subject,
        href: openLeadProfileHref(log.leadId),
      });
    }
  }

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
          previewPath: `/agent/emails/${log.id}`,
          inferredFromClick: true,
        },
      },
    });
  }

  if (isFirstClick && isPropertyAlertEmailKind(log.kind) && log.lead.assignedAgentId) {
    void sendPushToUser(log.lead.assignedAgentId, {
      type: "alert_engagement",
      title: "Property alert clicked",
      body: log.subject,
      href: openLeadProfileHref(log.leadId),
    });
  }

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
  if (type !== "email.opened" && type !== "email.clicked") {
    return { ok: true, handled: false, type };
  }

  const providerId = event.data.email_id?.trim();
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
