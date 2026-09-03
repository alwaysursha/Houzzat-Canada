import { PLATFORM_PRODUCT_NAME, SITE_NAME } from "@/lib/constants";
import { emailEnv } from "@/lib/email/env";

/** Transactional: verify, welcome, password, 1:1, shortlist. */
export function emailFromNotify() {
  return (
    emailEnv("EMAIL_FROM_NOTIFY") ||
    emailEnv("EMAIL_FROM") ||
    `${SITE_NAME} <notify@houzzat.com>`
  );
}

/** Marketing / alerts: property alerts, newsletters, mass. */
export function emailFromAlerts() {
  return (
    emailEnv("EMAIL_FROM_ALERTS") ||
    emailEnv("EMAIL_FROM") ||
    `${SITE_NAME} Alerts <alerts@houzzat.com>`
  );
}

/**
 * HouzzatPRO platform sales From identity.
 * Uses the existing verified sending domain; display name is HouzzatPRO.
 * Set HOUZZATPRO_EMAIL_FROM in production when a dedicated identity is ready.
 * Do not invent an unverified @houzzatpro.com mailbox.
 */
export function emailFromHouzzatPro() {
  return (
    emailEnv("HOUZZATPRO_EMAIL_FROM") ||
    emailEnv("EMAIL_FROM_NOTIFY") ||
    emailEnv("EMAIL_FROM") ||
    `${PLATFORM_PRODUCT_NAME} <notify@houzzat.com>`
  );
}

export function isResendConfigured() {
  return Boolean(emailEnv("RESEND_API_KEY"));
}

export type EmailStream = "notify" | "alerts";

export function fromForStream(stream: EmailStream) {
  return stream === "alerts" ? emailFromAlerts() : emailFromNotify();
}
