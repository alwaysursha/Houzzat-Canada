import type { CommunicationCategory } from "@/lib/communications/classification";
import {
  evaluateOptionalEmailSuppression,
  resolveEmailSendWorkspace,
} from "@/lib/communications/send-enforcement";
import {
  buildCustomerPreferenceEmailChrome,
  optionalEmailEligibleForPreferenceChrome,
} from "@/lib/communications/preference-email-chrome";
import { prismaCommunicationPreferenceStore } from "@/lib/communications/preference-store";
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
  headers?: Record<string, string>;
  /** When false, still send but skip CRM log (e.g. verify before lead exists). */
  logToCrm?: boolean;
  /**
   * Authoritative optional-email category when `rendered.kind` is ambiguous
   * across origins (e.g. sold_alert from Property Watch vs Area Watch).
   */
  communicationCategory?: CommunicationCategory | null;
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
      category: input.communicationCategory,
      preferenceStore: prismaCommunicationPreferenceStore(),
    });
    if (suppression.blocked) {
      return { ok: true, status: "suppressed", reason: suppression.reason };
    }
  } catch (error) {
    console.error("[email:suppression-gate]", error);
  }

  let headers = input.headers;
  if (
    !headers &&
    optionalEmailEligibleForPreferenceChrome(input.rendered.kind) &&
    input.customerId
  ) {
    try {
      const workspaceId = await resolveEmailSendWorkspace({
        customerId: input.customerId,
        leadId: input.leadId,
      });
      if (workspaceId) {
        const chrome = await buildCustomerPreferenceEmailChrome({
          userId: input.customerId,
          workspaceId,
          email: input.to,
        });
        // Tokens are minted before Resend. A later send failure leaves unused
        // hashes until TTL cleanup; raw tokens are not recoverable from them.
        headers = chrome?.headers;
      }
    } catch (error) {
      console.error("[email:preference-chrome]", error);
    }
  }

  const result = await sendRenderedEmail({
    to: input.to,
    rendered: input.rendered,
    stream: input.stream,
    replyTo: input.replyTo,
    headers,
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
