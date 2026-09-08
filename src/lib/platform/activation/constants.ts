/** Stage 6.10A — owner activation constants. */

export {
  HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL,
  PLATFORM_MASTER_ADMIN_EMAIL,
  normalizeActivationEmail,
} from "./legacy-constants";

export const OWNER_ACTIVATION_AUDIT = {
  CREATED: "OWNER_ACTIVATION_CREATED",
  EMAIL_SENT: "OWNER_ACTIVATION_EMAIL_SENT",
  EMAIL_FAILED: "OWNER_ACTIVATION_EMAIL_FAILED",
  ACCOUNT_ACTIVATED: "OWNER_ACCOUNT_ACTIVATED",
  /** V1 auto-send after ACTIVE provision skipped (idempotent / ineligible). */
  AUTO_SKIPPED: "OWNER_ACTIVATION_AUTO_SKIPPED",
} as const;

export const OWNER_ACTIVATION_ENTITY_TYPE = "WorkspaceOwnerActivation" as const;

/** Activation link TTL. */
export const OWNER_ACTIVATION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const OWNER_ACTIVATION_MIN_PASSWORD_LENGTH = 8 as const;

export const OWNER_ACTIVATION_PATH_PREFIX = "/activate" as const;
