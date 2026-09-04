/** Stage 6.9 — paid subscription → workspace provisioning constants. */

export const PROVISIONING_STEP_KEYS = [
  "VALIDATE_SUBSCRIPTION",
  "CREATE_WORKSPACE",
  "LINK_SUBSCRIPTION",
  "CREATE_OWNER_MEMBERSHIP",
  "CREATE_BRANDING_FOUNDATION",
  "CREATE_EMAIL_IDENTITY",
  "MATERIALIZE_ENTITLEMENTS",
  "MATERIALIZE_SEAT_QUOTA",
  "MATERIALIZE_ADDONS",
  "MARK_WORKSPACE_ACTIVE",
  "COMPLETE_PROVISIONING",
] as const;

export type ProvisioningStepKey = (typeof PROVISIONING_STEP_KEYS)[number];

export const PROVISIONING_AUDIT = {
  STARTED: "PROVISIONING_STARTED",
  WORKSPACE_CREATED: "WORKSPACE_CREATED",
  WORKSPACE_OWNER_CREATED: "WORKSPACE_OWNER_CREATED",
  WORKSPACE_ENTITLEMENTS_MATERIALIZED: "WORKSPACE_ENTITLEMENTS_MATERIALIZED",
  WORKSPACE_SEAT_QUOTA_MATERIALIZED: "WORKSPACE_SEAT_QUOTA_MATERIALIZED",
  WORKSPACE_PROVISIONED: "WORKSPACE_PROVISIONED",
  FAILED: "PROVISIONING_FAILED",
} as const;

export const PROVISIONING_ENTITY_TYPE = "ProvisioningRun" as const;

export const PROVISIONING_IDEMPOTENCY_PREFIX = "paid-sub-provision:" as const;

export function provisioningIdempotencyKey(subscriptionId: string): string {
  return `${PROVISIONING_IDEMPOTENCY_PREFIX}${subscriptionId}`;
}

/** Slugs that must never be assigned to a newly provisioned SaaS tenant. */
export const PROVISIONING_RESERVED_SLUGS = [
  "houzzat",
  "tenant-canary",
  "canary",
  "platform",
  "houzzatpro",
] as const;
