import { Resend } from "resend";
import {
  fromForStream,
  isResendConfigured,
  type EmailStream,
} from "@/lib/email/config";
import type { RenderedEmail } from "@/lib/email/templates";

export type SendEmailResult =
  | { ok: true; status: "sent"; providerId?: string }
  | { ok: true; status: "skipped" }
  | { ok: false; status: "failed"; error: string };

let resendClient: Resend | null = null;

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export async function sendRenderedEmail(input: {
  to: string;
  rendered: RenderedEmail;
  stream?: EmailStream;
  replyTo?: string | null;
}): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    console.info(
      "[email:stub]",
      input.to,
      input.rendered.kind,
      input.rendered.subject,
    );
    return { ok: true, status: "skipped" };
  }

  const resend = getResend();
  if (!resend) return { ok: true, status: "skipped" };

  try {
    const { data, error } = await resend.emails.send({
      from: fromForStream(input.stream ?? "notify"),
      to: [input.to],
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      tags: [{ name: "kind", value: input.rendered.kind.slice(0, 50) }],
    });

    if (error) {
      console.error("[email:resend]", error);
      return { ok: false, status: "failed", error: error.message };
    }

    console.info(
      "[email:resend] sent",
      input.rendered.kind,
      input.to,
      data?.id ?? "",
    );
    return { ok: true, status: "sent", providerId: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "send failed";
    console.error("[email:resend]", error);
    return { ok: false, status: "failed", error: message };
  }
}
