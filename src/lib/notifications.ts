type NotifyPayload = {
  toEmail?: string | null;
  toPhone?: string | null;
  subject: string;
  text: string;
  smsText?: string;
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
    results.email = await sendEmail({
      to: payload.toEmail,
      subject: payload.subject,
      text: payload.text,
    });
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
    results.sms = await sendSms({
      to: phone,
      body: payload.smsText,
    });
  }

  return results;
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<"sent" | "skipped" | "failed"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Houzzat <noreply@houzzat.ca>";

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

async function sendSms(input: {
  to: string;
  body: string;
}): Promise<"sent" | "skipped" | "failed"> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    console.info("[notify:sms:stub]", input.to, input.body);
    return "skipped";
  }

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({
      To: input.to,
      From: from,
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
      console.error("[notify:sms]", await res.text());
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("[notify:sms]", error);
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
    console.info("[notify:whatsapp:stub]", input.to, input.body);
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
      console.error("[notify:whatsapp]", await res.text());
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("[notify:whatsapp]", error);
    return "failed";
  }
}
