/**
 * Stage 6.2B — owner-approved activation constants (prepared, not auto-run).
 */

/** BillingCustomer.email for Houzzat grandfathering. */
export const HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL =
  "alisyedrealtor@gmail.com" as const;

/** First PlatformOperator MASTER_ADMIN — must already exist as User. */
export const PLATFORM_MASTER_ADMIN_EMAIL = "teamalisyed@gmail.com" as const;

export function normalizeActivationEmail(email: string): string {
  return email.trim().toLowerCase();
}
