/**
 * Stage 6.11F.1 — custom website domain OWNER claim + DNS instructions.
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
