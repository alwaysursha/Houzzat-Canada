/** Stage 6.7A — commercial offer management (Master Admin). */

export { PLATFORM_OFFERS_MODULE } from "./module-flag";

export {
  COMMERCIAL_OFFER_AUDIT,
  COMMERCIAL_OFFER_ENTITY_TYPE,
  PRIVATE_OFFER_PATH_PREFIX,
  PRIVATE_OFFER_PUBLIC_ORIGIN,
  ADS_MINIMUM_MONTHLY_BUDGET_CENTS,
  OFFER_LINE_CODES,
  buildPrivateOfferUrl,
} from "./constants";

export { CommercialOfferActionError } from "./errors";

export {
  createCommercialOfferRawToken,
  hashCommercialOfferToken,
  commercialOfferTokenHashesEqual,
} from "./token";

export {
  computeOfferTotals,
  resolveOfferCommercialTerms,
  type OfferAddOnInput,
  type OfferAdjustmentInput,
  type ResolvedOfferCommercialTerms,
} from "./line-items";

export {
  createDraftCommercialOffer,
  updateDraftCommercialOffer,
  sendCommercialOffer,
  cancelCommercialOffer,
  serializeOfferForApi,
  type OfferTermsInput,
  type SendCommercialOfferResult,
} from "./manage";

export {
  resolvePrivateOfferByRawToken,
  type PrivateOfferPresentation,
  type PrivateOfferLineView,
  type ResolvePrivateOfferResult,
} from "./private-offer";

export { isHouzzatProPlatformPrivateOfferRequest } from "./private-offer-request";

export {
  PRIVATE_OFFER_DOCUMENT_TITLE,
  PRIVATE_OFFER_UNAVAILABLE_TITLE,
  PRIVATE_OFFER_PLAN_VALUE_LABELS,
} from "./private-offer-copy";

