import { fromForStream, type EmailStream } from "@/lib/email/config";
import { isValidMailbox } from "@/lib/email/custom-sending-policy";
import { emailEnv } from "@/lib/email/env";
import { sendRenderedEmail } from "@/lib/email/send";
import { resolveEnabledCustomFrom } from "@/lib/platform/email/master-custom-sending";
import { prisma } from "@/lib/prisma";
import { sendSms as sendTwilioSms } from "@/lib/sms/transport";
import type { SmsClass } from "@/lib/sms/types";

type NotifyPayload = {
  toEmail?: string | null;
  toPhone?: string | null;
  subject: string;
  text: string;
  html?: string;
  stream?: EmailStream;
  smsText?: string;
  /** Workspace that owns this SMS (required for STOP isolation). */
  workspaceId?: string | null;
  /** SMS consent class. Ignored when smsText is omitted. */
  smsClass?: SmsClass;
  /** When set, also attempt WhatsApp via Twilio WhatsApp sender. */
  whatsappText?: string;
  preferWhatsApp?: boolean;
  /** Overrides the workspace email identity Reply-To. */
  replyTo?: string | null;
};

async function resolveWorkspaceReplyTo(workspaceId: string): Promise<string | null> {
  const row = await prisma.workspaceEmailIdentity.findUnique({
    where: { workspaceId },
    select: { replyToEmail: true },
  });
  const email = row?.replyToEmail?.trim().toLowerCase() ?? "";
  return isValidMailbox(email) ? email : null;
}

export async function sendNotification(payload: NotifyPayload) {
  const results = {
    email: "skipped" as "sent" | "skipped" | "failed",
    emailProviderId: undefined as string | undefined,
    sms: "skipped" as "sent" | "skipped" | "failed",
    whatsapp: "skipped" as "sent" | "skipped" | "failed",
  };

  if (payload.toEmail) {
    let customFrom: string | null = null;
    let replyTo = payload.replyTo?.trim() || null;
    if (payload.workspaceId) {
      try {
        customFrom = await resolveEnabledCustomFrom(payload.workspaceId);
        if (!replyTo) replyTo = await resolveWorkspaceReplyTo(payload.workspaceId);
      } catch (error) {
        console.error("[email:custom-from]", error);
      }
    }
    if (payload.html) {
      const sent = await sendRenderedEmail({
        to: payload.toEmail,
        stream: payload.stream ?? "notify",
        from: customFrom,
        replyTo,
        rendered: {
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          kind: "notify",
        },
      });
      results.email =
        sent.status === "sent"
          ? "sent"
          : sent.status === "skipped"
            ? "skipped"
            : "failed";
      if (sent.status === "sent") results.emailProviderId = sent.providerId;
    } else {
      const sent = await sendEmail({
        to: payload.toEmail,
        subject: payload.subject,
        text: payload.text,
        stream: payload.stream,
        from: customFrom,
        replyTo,
      });
      results.email = sent.status;
      results.emailProviderId = sent.providerId;
    }
  }

  const phone = payload.toPhone;
  if (phone && payload.whatsappText) {
    results.whatsapp = await sendWhatsApp({
      to: phone,
      body: payload.whatsappText,
    });
  }

  // SMS still sends unless WhatsApp was preferred and succeeded
  if (
    phone &&
    payload.smsText &&
    !(payload.preferWhatsApp && results.whatsapp === "sent")
  ) {
    const sent = await sendTwilioSms({
      to: phone,
      body: payload.smsText,
      workspaceId: payload.workspaceId,
      smsClass: payload.smsClass ?? "transactional",
    });
    results.sms = sent.status;
  }

  return results;
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  stream?: EmailStream;
  from?: string | null;
  replyTo?: string | null;
}): Promise<{ status: "sent" | "skipped" | "failed"; providerId?: string }> {
  const apiKey = emailEnv("RESEND_API_KEY");
  const from = input.from?.trim() || fromForStream(input.stream ?? "notify");

  if (!apiKey) {
    console.info("[notify:email:stub]", input.to, input.subject);
    return { status: "skipped" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[notify:email]", res.status);
      return { status: "failed" };
    }
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { status: "sent", providerId: body?.id };
  } catch (error) {
    console.error("[notify:email]", error);
    return { status: "failed" };
  }
}

async function sendWhatsApp(input: {
  to: string;
  body: string;
}): Promise<"sent" | "skipped" | "failed"> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    console.info("[notify:whatsapp:stub]", { reason: "missing_credentials" });
    return "skipped";
  }

  const to = input.to.startsWith("whatsapp:")
    ? input.to
    : `whatsapp:${input.to}`;
  const fromWa = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({
      To: to,
      From: fromWa,
      Body: input.body,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!res.ok) {
      console.error("[notify:whatsapp]", { httpStatus: res.status });
      return "failed";
    }
    return "sent";
  } catch {
    console.error("[notify:whatsapp]", { reason: "request_failed" });
    return "failed";
  }
}
