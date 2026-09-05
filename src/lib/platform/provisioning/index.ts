/**
 * Stage 6.9 — paid subscription → workspace provisioning.
 *
 * Durable authority: ProvisioningRun + ProvisioningStep.
 * Does not invent tenant templates/themes.
 */

export const PLATFORM_PROVISIONING_MODULE = "platform/provisioning" as const;

export {
  PROVISIONING_STEP_KEYS,
  PROVISIONING_AUDIT,
  PROVISIONING_ENTITY_TYPE,
  provisioningIdempotencyKey,
  type ProvisioningStepKey,
} from "./constants";

export {
  evaluatePaidSubscriptionProvisioningEligibility,
  isPaidProvisioningStatus,
  type ProvisioningEligibility,
  type ProvisioningEligibilityReason,
} from "./eligibility";

export { ProvisioningActionError } from "./errors";

export {
  deriveWorkspaceDisplayName,
  slugifyWorkspaceName,
  allocateUniqueWorkspaceSlug,
} from "./slug";

export {
  ensureWorkspacePlatformDomain,
  type EnsurePlatformDomainResult,
} from "./create-platform-domain";

export {
  provisionPaidSubscription,
  tryProvisionAfterBillingActivation,
  retryPaidSubscriptionProvisioning,
  type ProvisionPaidSubscriptionResult,
} from "./provision";
