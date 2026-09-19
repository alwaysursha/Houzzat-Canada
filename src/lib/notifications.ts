import { fromForStream, type EmailStream } from "@/lib/email/config";
import { emailEnv } from "@/lib/email/env";
import { sendRenderedEmail } from "@/lib/email/send";
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
};

export async function sendNotification(payload: NotifyPayload) {
  const results = {
    email: "skipped" as "sent" | "skipped" | "failed",
    sms: "skipped" as "sent" | "skipped" | "failed",
    whatsapp: "skipped" as "sent" | "skipped" | "failed",
  };

  if (payload.toEmail) {
    if (payload.html) {
      const sent = await sendRenderedEmail({
        to: payload.toEmail,
        stream: payload.stream ?? "notify",
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
    } else {
      results.email = await sendEmail({
        to: payload.toEmail,
        subject: payload.subject,
        text: payload.text,
        stream: payload.stream,
      });
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
}): Promise<"sent" | "skipped" | "failed"> {
  const apiKey = emailEnv("RESEND_API_KEY");
  const from = fromForStream(input.stream ?? "notify");

  if (!apiKey) {
    console.info("[notify:email:stub]", input.to, input.subject);
    return "skipped";
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
      }),
    });
    if (!res.ok) {
      console.error("[notify:email]", await res.text());
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("[notify:email]", error);
    return "failed";
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
