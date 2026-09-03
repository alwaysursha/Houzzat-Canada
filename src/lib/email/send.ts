import { Resend } from "resend";
import {
  fromForStream,
  isResendConfigured,
  type EmailStream,
} from "@/lib/email/config";
import { emailEnv } from "@/lib/email/env";
import type { RenderedEmail } from "@/lib/email/templates";

export type SendEmailResult =
  | { ok: true; status: "sent"; providerId?: string }
  | { ok: true; status: "skipped" }
  | { ok: false; status: "failed"; error: string };

let resendClient: Resend | null = null;
let resendClientKey: string | null = null;

function getResend() {
  const key = emailEnv("RESEND_API_KEY");
  if (!key) return null;
  // Recreate if Worker binding key differs from a stale singleton.
  if (!resendClient || resendClientKey !== key) {
    resendClient = new Resend(key);
    resendClientKey = key;
  }
  return resendClient;
}

export async function sendRenderedEmail(input: {
  to: string;
  rendered: RenderedEmail;
  stream?: EmailStream;
  replyTo?: string | null;
  /** Optional absolute From override (e.g. HouzzatPRO platform sales). */
  from?: string | null;
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
      from: input.from?.trim() || fromForStream(input.stream ?? "notify"),
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
