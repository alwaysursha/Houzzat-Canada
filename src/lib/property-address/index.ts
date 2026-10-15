export {
  classifyAddressListingStatus,
  resolveConfidence,
  type AddressListingStatusClass,
  type AddressResolveConfidence,
  type MlsProbeOutcome,
} from "@/lib/property-address/classify";

export {
  evaluateExactAddressIdentity,
  formatCanonicalAddress,
  isOntarioCoordinate,
  isOntarioProvince,
  looksLikeResolveAbuse,
  normalizeProvince,
  normalizeUnitNumber,
  splitStreetLabel,
  unitsMatch,
} from "@/lib/property-address/normalize";

export {
  allowPropertyAddressResolve,
  clearPropertyAddressResolveRateLimitsForTests,
  clientIpFromPublicRequest,
} from "@/lib/property-address/rate-limit";

export {
  defaultResolveAddressDeps,
  parseResolveAddressInput,
  pickBestPlaceHit,
  resolvePropertyAddress,
  type NeonActiveListingHit,
  type PlaceResolveHit,
  type ResolveAddressDeps,
  type ResolveAddressFailure,
  type ResolveAddressInput,
  type ResolveAddressResult,
  type ResolveAddressSuccess,
  type ResolvedAddressParts,
} from "@/lib/property-address/resolve-address";

export {
  isOffMarketPropertySearchEnabled,
  OFF_MARKET_PROPERTY_SEARCH_ENV,
} from "@/lib/property-address/feature-flag";

export {
  propertyAddressPath,
  propertyAddressSlug,
} from "@/lib/property-address/property-path";

export {
  decideSearchAddressNavigation,
  dedupeAddressSuggestions,
  fetchPropertyAddressResolve,
  isResidentialAddressSuggestion,
  PREPARED_PROPERTY_ADDRESS_STORAGE_KEY,
  readPreparedPropertyAddress,
  rememberPreparedPropertyAddress,
  type PreparedPropertyAddress,
  type SearchAddressNavDecision,
} from "@/lib/property-address/search-integration";

export {
  CLAIM_ADDRESS_CONTEXT_STORAGE_KEY,
  clearClaimAddressContext,
  readClaimAddressContext,
  rememberClaimAddressContext,
  type ClaimAddressContext,
} from "@/lib/property-address/claim-context";

export {
  applySellerPropertyClaim,
  type ApplySellerPropertyClaimInput,
  type ApplySellerPropertyClaimResult,
} from "@/lib/property-address/apply-seller-claim";

export {
  SELLER_TIMEFRAME_OPTIONS,
  formatSellerTimeframeState,
  mergeSellerTimeframeIntoCapture,
  parseSellerTimeframeChoice,
  readSellerTimeframeState,
  sellerTimeframeLabel,
  type SellerTimeframeChoice,
  type SellerTimeframeState,
  type SellerTimeframeStatus,
  type SellerTimeframeWrite,
} from "@/lib/property-address/seller-timeframe";

export {
  loadPropertyProfile,
  propertySlugMatchesResolved,
  type LoadPropertyProfileResult,
  type PropertyProfileModel,
  type PropertyProfileSearchParams,
} from "@/lib/property-address/load-property-profile";

export {
  buildNeighbourhoodInsightsFromActives,
  loadNeighbourhoodInsights,
  type ActiveListingStatRow,
  type NeighbourhoodInsights,
  type NeighbourhoodInsightsScope,
} from "@/lib/property-address/neighbourhood-insights";

export {
  homeValuationPrefillHref,
  loadHomeValuationPrefillFromRequest,
  prefillFromResolvedAddress,
  type HomeValuationPrefill,
} from "@/lib/property-address/valuation-prefill";
