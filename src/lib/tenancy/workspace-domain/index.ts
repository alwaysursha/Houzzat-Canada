/**
 * Stage 6.11F.1 / F.2A — custom website domain OWNER claim + ownership verify.
 */

export {
  WEBSITE_DOMAIN_TXT_OWNERSHIP_LABEL,
  buildWebsiteDomainDnsInstructions,
  buildWebsiteDomainTxtOwnershipHost,
  type WebsiteDomainDnsInstructions,
} from "@/lib/tenancy/workspace-domain/dns-instructions";

export {
  assertSafeCustomWebsiteClaimHostname,
  type ClaimHostnameSafetyResult,
} from "@/lib/tenancy/workspace-domain/claim-hostname-safety";

export {
  listOwnerWebsiteDomains,
  claimOwnerWebsiteDomain,
  deleteOwnerPendingWebsiteDomain,
  type WebsiteDomainDto,
  type ClaimOwnerWebsiteDomainResult,
} from "@/lib/tenancy/workspace-domain/manage-custom";

export {
  CLOUDFLARE_DOH_JSON_URL,
  DNS_TXT_LOOKUP_TIMEOUT_MS,
  createCloudflareDohTxtLookup,
  type DnsTxtLookup,
  type DnsTxtLookupResult,
} from "@/lib/tenancy/workspace-domain/dns-txt-lookup";

export {
  normalizeDnsTxtAnswer,
  ownershipTokensEqual,
  txtAnswersMatchOwnershipToken,
} from "@/lib/tenancy/workspace-domain/txt-match";

export {
  verifyOwnerWebsiteDomainOwnership,
  type OwnershipVerifyResult,
} from "@/lib/tenancy/workspace-domain/verify-ownership";
