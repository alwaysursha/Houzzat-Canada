/**
 * Stage 6.10A — owner account activation + onboarding foundation.
 */

export {
  HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL,
  PLATFORM_MASTER_ADMIN_EMAIL,
  normalizeActivationEmail,
  OWNER_ACTIVATION_AUDIT,
  OWNER_ACTIVATION_ENTITY_TYPE,
  OWNER_ACTIVATION_TTL_MS,
  OWNER_ACTIVATION_MIN_PASSWORD_LENGTH,
  OWNER_ACTIVATION_PATH_PREFIX,
} from "./constants";

export {
  createOwnerActivationRawToken,
  hashOwnerActivationToken,
  ownerActivationHashesEqual,
} from "./token";

export {
  evaluateOwnerActivationEligibility,
  type OwnerActivationEligibility,
  type OwnerActivationEligibilityReason,
} from "./eligibility";

export { OwnerActivationError } from "./errors";

export {
  sendOwnerActivationEmail,
  type SendOwnerActivationResult,
} from "./send";

export {
  resolvePublicOwnerActivation,
  completeOwnerActivation,
  type PublicActivationView,
} from "./complete";

export {
  ensureWorkspaceOnboardingState,
  markAccountActivatedOnboarding,
} from "./onboarding-state";

export {
  listOwnerOnboardingWorkspaces,
  updateOwnerOnboardingBusinessProfile,
  requireHostBoundOwnerOnboardingContext,
  type OwnerOnboardingWorkspace,
  type HostBoundOwnerOnboardingContext,
} from "./onboarding";

export {
  OWNER_ONBOARDING_RETURN_PATH,
  OWNER_ONBOARDING_AUTH_QUERY,
  sanitizeOwnerOnboardingReturnPath,
  sanitizeWorkspaceHintId,
  buildOwnerOnboardingProSignInUrl,
  parseOwnerOnboardingAuthSearchParams,
  resolveHandoffDestinationWithReturnPath,
  selectMembershipForWorkspaceHint,
  appendOwnerOnboardingAuthQuery,
} from "./onboarding-pro-auth";

export { renderOwnerActivationEmail } from "./email-template";
