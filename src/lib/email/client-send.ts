import {
  evaluateOptionalEmailSuppression,
  resolveEmailSendWorkspace,
} from "@/lib/communications/send-enforcement";
import {
  emailPreferencesUrl,
  logClientEmail,
  sendRenderedEmail,
  type EmailStream,
  type RenderedEmail,
  type SendEmailResult,
} from "@/lib/email";

/**
 * Send a templated email to a client and attach it to their CRM lead activity
 * (with Preview Email link) whenever a lead exists for that customer.
 */
export async function sendAndLogClientEmail(input: {
  to: string;
  rendered: RenderedEmail;
  stream?: EmailStream;
  customerId?: string | null;
  leadId?: string | null;
  sentById?: string | null;
  mlsNumber?: string | null;
  organizationId?: string | null;
  replyTo?: string | null;
  /** When false, still send but skip CRM log (e.g. verify before lead exists). */
  logToCrm?: boolean;
}): Promise<
  SendEmailResult & { emailLogId?: string; leadId?: string }
> {
  try {
    const workspaceId = await resolveEmailSendWorkspace({
      customerId: input.customerId,
      leadId: input.leadId,
    });
    const suppression = await evaluateOptionalEmailSuppression({
      to: input.to,
      kind: input.rendered.kind,
      workspaceId,
      userId: input.customerId,
    });
    if (suppression.blocked) {
      return { ok: true, status: "suppressed", reason: suppression.reason };
    }
  } catch (error) {
    console.error("[email:suppression-gate]", error);
  }

  const result = await sendRenderedEmail({
    to: input.to,
    rendered: input.rendered,
    stream: input.stream,
    replyTo: input.replyTo,
  });

  if (!result.ok) return result;

  if (input.logToCrm === false) return result;

  const providerId =
    result.status === "sent" ? (result.providerId ?? null) : null;

  try {
    const logged = await logClientEmail({
      customerId: input.customerId,
      leadId: input.leadId,
      toEmail: input.to,
      rendered: input.rendered,
      sentById: input.sentById,
      mlsNumber: input.mlsNumber,
      organizationId: input.organizationId,
      providerId,
    });

    return {
      ...result,
      emailLogId: logged?.emailLogId,
      leadId: logged?.leadId,
    };
  } catch (error) {
    // Resend already accepted. Preserve delivery success so callers do not
    // unclaim and resend when only CRM logging failed.
    console.error("[email:crm-log]", error);
    return result;
  }
}

export { emailPreferencesUrl };
