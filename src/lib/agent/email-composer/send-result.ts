import type {
  AgentEmailApiResponse,
  EmailComposerSendOutcome,
} from "@/lib/agent/email-composer/types";

/**
 * Map HTTP + JSON from POST /api/agent/email into UI outcomes.
 * `sent > 0` is the only success path — skipped/suppressed must not look sent.
 */
export function interpretAgentEmailSendResponse(input: {
  httpStatus: number;
  json: AgentEmailApiResponse | null;
}): EmailComposerSendOutcome {
  const { httpStatus, json } = input;

  if (httpStatus === 401) {
    return { kind: "unauthorized", message: "Sign in again to send email." };
  }
  if (httpStatus === 400) {
    return {
      kind: "invalid",
      message: json?.error?.trim() || "Check the subject and message, then try again.",
    };
  }
  if (httpStatus < 200 || httpStatus >= 300 || !json) {
    return {
      kind: "failed",
      message: "Could not reach the email service. Try again.",
    };
  }

  const sent = typeof json.sent === "number" ? json.sent : 0;
  const skipped = typeof json.skipped === "number" ? json.skipped : 0;
  const firstError =
    Array.isArray(json.errors) && json.errors[0]?.trim()
      ? json.errors[0].trim()
      : null;

  if (json.delivery === "sent" || sent > 0) {
    return { kind: "sent" };
  }

  if (json.delivery === "skipped" || skipped > 0) {
    return {
      kind: "skipped",
      message:
        firstError ||
        "Email was not sent (consent, preferences, or suppression).",
    };
  }

  return {
    kind: "failed",
    message: firstError || json.error?.trim() || "Send failed.",
  };
}

export function isEmailComposerDraftDirty(draft: {
  subject: string;
  body: string;
}): boolean {
  return draft.subject.trim().length > 0 || draft.body.trim().length > 0;
}

export function canSubmitEmailComposer(input: {
  toEmail: string;
  consented: boolean;
  subject: string;
  body: string;
  pending: boolean;
  /** True when any send is in flight (including after lead navigation). */
  inFlight?: boolean;
}): boolean {
  if (input.pending || input.inFlight) return false;
  if (!input.consented) return false;
  if (!input.toEmail.trim()) return false;
  if (!input.subject.trim()) return false;
  if (!input.body.trim()) return false;
  return true;
}
