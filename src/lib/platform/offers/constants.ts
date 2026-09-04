/** Stage 6.7A — commercial offer constants (no Stripe). */

export const COMMERCIAL_OFFER_AUDIT = {
  CREATED: "COMMERCIAL_OFFER_CREATED",
  UPDATED: "COMMERCIAL_OFFER_UPDATED",
  SENT: "COMMERCIAL_OFFER_SENT",
  CANCELLED: "COMMERCIAL_OFFER_CANCELLED",
  VIEWED: "COMMERCIAL_OFFER_VIEWED",
  ACCEPTED: "COMMERCIAL_OFFER_ACCEPTED",
} as const;

export const COMMERCIAL_OFFER_ENTITY_TYPE = "CommercialOffer";

/** Private prospect subscribe path on HouzzatPRO platform root only. */
export const PRIVATE_OFFER_PATH_PREFIX = "/subscribe";

export const PRIVATE_OFFER_PUBLIC_ORIGIN = "https://houzzatpro.com";

/** Google/Meta: ad spend is separate; management fee not decided. */
export const ADS_MINIMUM_MONTHLY_BUDGET_CENTS = 75_000;

export const OFFER_LINE_CODES = {
  PLAN_BASE: "PLAN_BASE",
  SETUP_FEE: "SETUP_FEE",
  ADDITIONAL_SEAT: "ADDITIONAL_AGENT",
  CUSTOM_CONSUMER_APP: "CUSTOM_CONSUMER_APP",
  GOOGLE_PPC: "GOOGLE_PPC",
  META_ADS: "META_ADS",
} as const;

export function buildPrivateOfferUrl(rawToken: string): string {
  return `${PRIVATE_OFFER_PUBLIC_ORIGIN}${PRIVATE_OFFER_PATH_PREFIX}/${rawToken}`;
}
