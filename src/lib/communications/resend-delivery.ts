import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import {
  buildPreferenceAuditRecord,
  recordCommunicationPreferenceEvent,
  type CommunicationPreferenceAuditStore,
} from "@/lib/communications/preference-audit";
import {
  applyEmailSuppression,
  type EmailSuppressionReason,
  type EmailSuppressionStore,
} from "@/lib/communications/suppression";

/**
 * Resend bounce/complaint evidence (installed resend@6.17.2 + current docs).
 *
 * SDK `node_modules/resend/dist/index.d.mts`:
 * - WebhookEvent includes `email.bounced`, `email.complained`,
 *   `email.delivery_delayed`, `email.failed` (also `email.suppressed`).
 * - BaseEmailEventData.email_id: string
 * - BaseEmailEventData.to: string[]
 * - EmailBouncedEvent.data.bounce: EmailBounce
 *   { message: string; subType: string; type: string }
 *   SDK does not enumerate Permanent vs Temporary; type is a string.
 * - EmailComplainedEvent.data is BaseEmailEventData only (no bounce object).
 * - EmailDeliveryDelayedEvent: no bounce payload.
 * - EmailFailedEvent.data.failed.reason: string
 *
 * Docs https://resend.com/docs/webhooks/emails/bounced (fetched 2026-10-05):
 * - Event name: `email.bounced`
 * - Event meaning: recipient mail server permanently rejected the email
 * - bounce.type examples: `Permanent`, `Temporary`
 * - bounce.subType examples: `Suppressed`, `MessageRejected`
 * - bounce.message: receiving-server diagnostic
 * - data.email_id, data.to: string[]
 *
 * Docs https://resend.com/docs/webhooks/emails/complained:
 * - Event name: `email.complained` (delivered, then marked spam)
 *
 * Docs event-types: `email.delivery_delayed` = temporary delivery issue;
 * `email.failed` = send-time failure (invalid recipient, quota, etc.).
 *
 * Policy: ignore Temporary. Suppress Permanent, or untyped `email.bounced`
 * (the event itself is documented as a permanent reject). Delayed/failed
 * never create mailbox suppression.
 */

export type ResendDeliveryEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    bounce?: {
      type?: string;
      subType?: string;
      message?: string;
    };
    failed?: {
      reason?: string;
    };
  };
};

export type ResendDeliveryClassification =
  | {
      action: "suppress";
      reason: Extract<EmailSuppressionReason, "HARD_BOUNCE" | "COMPLAINT">;
    }
  | {
      action: "ignore";
      why:
        | "temporary_bounce"
        | "send_failure"
        | "delivery_delayed"
        | "not_delivery";
    };

export function classifyResendDeliveryEvent(
  event: ResendDeliveryEvent,
): ResendDeliveryClassification {
  if (event.type === "email.complained") {
    return { action: "suppress", reason: "COMPLAINT" };
  }
  if (event.type === "email.bounced") {
    const bounceType = event.data?.bounce?.type?.trim();
    // Docs: bounce.type is Permanent | Temporary. SDK types it as string.
    if (bounceType && bounceType.toLowerCase() === "temporary") {
      return { action: "ignore", why: "temporary_bounce" };
    }
    return { action: "suppress", reason: "HARD_BOUNCE" };
  }
  if (event.type === "email.failed") {
    return { action: "ignore", why: "send_failure" };
  }
  if (event.type === "email.delivery_delayed") {
    return { action: "ignore", why: "delivery_delayed" };
  }
  return { action: "ignore", why: "not_delivery" };
}

export type ResendDeliveryContext = {
  workspaceId: string;
  userId: string | null;
  leadId: string | null;
  emailNormalized: string;
  leadEmailLogId: string | null;
};

export function deliveryIdempotencyKey(input: {
  webhookEventId?: string | null;
  type: string;
  providerId?: string | null;
  reason?: string;
}): string | null {
  const webhookEventId = input.webhookEventId?.trim();
  if (webhookEventId) return webhookEventId;
  if (input.providerId && input.reason) {
    return `${input.type}:${input.providerId}:${input.reason}`;
  }
  return null;
}

export async function applyResendSuppressionEvent(input: {
  event: ResendDeliveryEvent;
  webhookEventId?: string | null;
  context: ResendDeliveryContext;
  suppressionStore: EmailSuppressionStore;
  auditStore: CommunicationPreferenceAuditStore;
}): Promise<{ suppressed: boolean; audited: boolean }> {
  const classified = classifyResendDeliveryEvent(input.event);
  if (classified.action !== "suppress") {
    return { suppressed: false, audited: false };
  }

  const providerId = input.event.data?.email_id?.trim() || null;
  const providerEventId = deliveryIdempotencyKey({
    webhookEventId: input.webhookEventId,
    type: input.event.type,
    providerId,
    reason: classified.reason,
  });

  const suppression = await applyEmailSuppression(input.suppressionStore, {
    workspaceId: input.context.workspaceId,
    userId: input.context.userId,
    emailNormalized: normalizeIdentityEmail(input.context.emailNormalized),
    reason: classified.reason,
    source: "resend",
    providerId,
    leadEmailLogId: input.context.leadEmailLogId,
    meta: {
      bounce: input.event.data?.bounce ?? null,
      eventType: input.event.type,
    },
  });

  const audit = await recordCommunicationPreferenceEvent(
    input.auditStore,
    buildPreferenceAuditRecord({
      workspaceId: input.context.workspaceId,
      userId: input.context.userId,
      leadId: input.context.leadId,
      emailNormalized: input.context.emailNormalized,
      kind:
        classified.reason === "COMPLAINT"
          ? "suppression_complaint"
          : "suppression_hard_bounce",
      category: null,
      channel: "email",
      previousState: { suppressed: !suppression.created },
      resultingState: {
        suppressed: true,
        eventReason: classified.reason,
        currentReason: suppression.record.reason,
        scope: suppression.record.scope,
      },
      source: "resend_webhook",
      providerEventId,
      providerId,
      meta: {
        bounce: input.event.data?.bounce ?? null,
        leadEmailLogId: input.context.leadEmailLogId,
      },
    }),
  );

  return { suppressed: true, audited: audit.created };
}
