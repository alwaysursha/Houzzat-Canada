/** Stage 6.7B — client-safe copy for private offer experience. */

export const PRIVATE_OFFER_DOCUMENT_TITLE = "Private Commercial Proposal | HouzzatPRO";

export const PRIVATE_OFFER_UNAVAILABLE_TITLE = "Offer Unavailable";
export const PRIVATE_OFFER_UNAVAILABLE_BODY =
  "This private offer is no longer available.";
export const PRIVATE_OFFER_UNAVAILABLE_SUPPORT =
  "Please contact the HouzzatPRO team if you need assistance.";

export const PRIVATE_OFFER_EYEBROW = "PRIVATE COMMERCIAL PROPOSAL";
export const PRIVATE_OFFER_HERO_LINE =
  "A platform built around your real estate business.";

export const PRIVATE_OFFER_PREPARED_FOR_LABEL = "Prepared for";

export const PRIVATE_OFFER_STANDARD_LABEL = "Standard";
export const PRIVATE_OFFER_PRIVATE_LABEL = "Your Private Offer";

export const PRIVATE_OFFER_DISCLOSURE =
  "Pricing shown in Canadian dollars (CAD).";

export const PRIVATE_OFFER_AD_SPEND_NOTE =
  "Advertising spend is separate from HouzzatPRO fees.";
export const PRIVATE_OFFER_AD_BUDGET_NOTE =
  "Minimum advertising budget: $750/month.";

export const PRIVATE_OFFER_CTA_TITLE = "Accept this private proposal";
export const PRIVATE_OFFER_CTA_BODY =
  "Confirm the acknowledgements below to accept the commercial terms shown in this proposal. Subscription payment is a separate next step.";
export const PRIVATE_OFFER_CTA_SUPPORT_LABEL = "Contact HouzzatPRO Support";

export const PRIVATE_OFFER_ACCEPTED_TITLE = "Offer Accepted";
export const PRIVATE_OFFER_ACCEPTED_BODY =
  "Thank you. Your HouzzatPRO commercial proposal has been accepted.";
export const PRIVATE_OFFER_ACCEPTED_NEXT =
  "The next step is to securely complete your subscription.";

export const PRIVATE_OFFER_CHECKOUT_CTA = "Complete Subscription";
export const PRIVATE_OFFER_CHECKOUT_SUBMITTING = "Starting Checkout…";
export const PRIVATE_OFFER_CHECKOUT_PAID =
  "Subscription payment received. Workspace setup will follow shortly.";
export const PRIVATE_OFFER_CHECKOUT_PAGE_TITLE = "Complete Subscription";
export const PRIVATE_OFFER_CHECKOUT_PAGE_BODY =
  "Secure payment is processed by Stripe on this HouzzatPRO page. Card details never touch HouzzatPRO servers.";
export const PRIVATE_OFFER_CHECKOUT_BACK_LABEL = "Back to offer";
export const PRIVATE_OFFER_CHECKOUT_LOADING = "Preparing secure Checkout…";
export const PRIVATE_OFFER_CHECKOUT_UNAVAILABLE =
  "Checkout is not available for this offer right now.";

export const PRIVATE_OFFER_PAYMENT_STATUS_TITLE = "Subscription Payment";
export const PRIVATE_OFFER_PAYMENT_STATUS_BODY =
  "If you completed Checkout, payment confirmation is processed securely by Stripe. This page does not activate your subscription by itself.";
export const PRIVATE_OFFER_PAYMENT_STATUS_PENDING =
  "We are confirming your payment. This usually takes just a few moments.";
export const PRIVATE_OFFER_PAYMENT_STATUS_PROVISIONING =
  "Payment received. We are preparing your HouzzatPRO workspace.";
export const PRIVATE_OFFER_PAYMENT_STATUS_SUCCESS_TITLE =
  "Thank you — your payment has been received.";
export const PRIVATE_OFFER_PAYMENT_STATUS_SUCCESS_BODY =
  "Your HouzzatPRO workspace is ready. Continue to activate your account and finish setup.";
export const PRIVATE_OFFER_PAYMENT_STATUS_SUCCESS_SIGN_IN_BODY =
  "Your HouzzatPRO workspace is ready. Sign in to continue setup.";
export const PRIVATE_OFFER_PAYMENT_STATUS_NEXT = "Next";
export const PRIVATE_OFFER_PAYMENT_STATUS_RECOVERABLE =
  "Payment was received, but workspace setup is taking longer than expected. You can wait a moment and try again, or contact HouzzatPRO Support.";
export const PRIVATE_OFFER_PAYMENT_STATUS_FAILED =
  "We could not confirm a completed payment for this session. If you were charged, contact HouzzatPRO Support.";
export const PRIVATE_OFFER_PAYMENT_STATUS_UNKNOWN =
  "We could not locate this payment session. If you completed Checkout, contact HouzzatPRO Support with your receipt.";
export const PRIVATE_OFFER_PAYMENT_STATUS_TIMEOUT =
  "Still confirming payment. You can safely leave this page — an activation email will arrive when your workspace is ready. You may also contact support.";

export const PRIVATE_OFFER_ACCEPT_EMAIL_LABEL = "Email Address";
export const PRIVATE_OFFER_ACCEPT_EMAIL_HINT =
  "Enter the email address associated with this private offer.";
export const PRIVATE_OFFER_ACCEPT_TERMS =
  "I have reviewed and accept the HouzzatPRO Terms of Service.";
export const PRIVATE_OFFER_ACCEPT_PRIVACY =
  "I have reviewed and acknowledge the HouzzatPRO Privacy Policy.";
export const PRIVATE_OFFER_ACCEPT_COMMERCIAL =
  "I understand that submitting this acceptance confirms the commercial terms shown in this private proposal.";
export const PRIVATE_OFFER_ACCEPT_SUBMIT = "Accept this proposal";
export const PRIVATE_OFFER_ACCEPT_SUBMITTING = "Accepting…";

/** Human-readable plan inclusions — never expose internal feature codes. */
export const PRIVATE_OFFER_PLAN_VALUE_LABELS = {
  WEBSITE: "Branded Real Estate Website",
  CRM: "CRM & Lead Management",
  AGENT_APP: "Native Agent App",
  PROPERTY_SEARCH: "Property Search & MLS Experience",
  CMA: "CMA & Client Tools",
  SEO: "SEO Foundation",
  TEAM: "Agent & Team Management",
  LIVE_CHAT: "Live Chat",
  BROKERAGE_CONTROLS: "Brokerage-Level Controls",
} as const;
