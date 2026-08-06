import { SITE_NAME } from "@/lib/constants";

/** Transactional: verify, welcome, password, 1:1, shortlist. */
export function emailFromNotify() {
  return (
    process.env.EMAIL_FROM_NOTIFY?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    `${SITE_NAME} <noreply@houzzat.com>`
  );
}

/** Marketing / alerts: property alerts, newsletters, mass. */
export function emailFromAlerts() {
  return (
    process.env.EMAIL_FROM_ALERTS?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    `${SITE_NAME} Alerts <alerts@houzzat.com>`
  );
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export type EmailStream = "notify" | "alerts";

export function fromForStream(stream: EmailStream) {
  return stream === "alerts" ? emailFromAlerts() : emailFromNotify();
}
