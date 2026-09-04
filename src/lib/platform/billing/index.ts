/** Stage 6.2A / 6.8B — billing module exports. */

export const PLATFORM_BILLING_MODULE = "platform/billing" as const;

export {
  HOUZZAT_WORKSPACE_SLUG,
  grandfatherHouzzatWorkspace,
  grandfatherWorkspaceWithProfile,
  assertSubscriptionIsGrandfathered,
  type GrandfatherHouzzatInput,
  type GrandfatherWorkspaceInput,
  type GrandfatherWorkspaceResult,
} from "./grandfather-houzzat";

export {
  STRIPE_BILLING_AUDIT,
  SUBSCRIPTION_ENTITY_TYPE,
  STRIPE_CHECKOUT_STATUS_PATH,
  STRIPE_CHECKOUT_METADATA_KEYS,
} from "./constants";

export {
  computeAcceptedCheckoutAmounts,
  CheckoutAmountError,
  type AcceptedCheckoutAmounts,
  type CheckoutAmountLine,
} from "./checkout-amounts";

export {
  houzzatProCheckoutBrandingSettings,
  HOUZZATPRO_CHECKOUT_PAGE_BG,
  HOUZZATPRO_CHECKOUT_NAVY,
  HOUZZATPRO_CHECKOUT_EMERALD,
} from "./checkout-branding";

export {
  evaluateAcceptedOfferCheckoutEligibility,
  loadCheckoutEligibilityForOfferId,
  isPaidSubscriptionStatus,
  type CheckoutEligibility,
  type CheckoutEligibilityReason,
} from "./checkout-eligibility";

export {
  createCheckoutForAcceptedOffer,
  OfferCheckoutPublicError,
  type CreateCheckoutForAcceptedOfferInput,
  type CreateCheckoutForAcceptedOfferResult,
} from "./checkout";

export {
  processStripeWebhook,
  BROWSER_SUCCESS_CANNOT_ACTIVATE,
  type StripeWebhookProcessResult,
} from "./webhook";

export {
  getStripeClient,
  clearStripeClientCacheForTests,
} from "./stripe-client";

export {
  readStripeSecretKey,
  readStripeWebhookSecret,
  isStripeBillingConfigured,
  StripeConfigError,
} from "./stripe-env";

export {
  allowOfferCheckoutRequest,
  clearOfferCheckoutRateLimitsForTests,
} from "./checkout-rate-limit";
