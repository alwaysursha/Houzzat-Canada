import { sendAndLogClientEmail } from "@/lib/email/client-send";
import { isResendConfigured } from "@/lib/email/config";
import { renderPasswordResetEmail } from "@/lib/email/templates";

export async function sendPasswordResetEmail(input: {
  email: string;
  name?: string | null;
  resetUrl: string;
  customerId?: string | null;
  siteName?: string;
}): Promise<"sent" | "skipped" | "failed"> {
  if (!isResendConfigured()) return "skipped";

  const rendered = renderPasswordResetEmail({
    name: input.name,
    resetUrl: input.resetUrl,
    siteName: input.siteName,
  });

  const result = await sendAndLogClientEmail({
    to: input.email.trim().toLowerCase(),
    rendered,
    stream: "notify",
    customerId: input.customerId,
    logToCrm: true,
  });

  return result.status === "sent"
    ? "sent"
    : result.status === "skipped"
      ? "skipped"
      : "failed";
}
