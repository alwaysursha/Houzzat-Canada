/**
 * Stage 6.11F.1 — ownership-verification DNS instructions for PENDING CUSTOM
 * website domains. Preparation only — does not verify DNS or activate.
 */

/** TXT owner label under the claimed apex/host (product-controlled). */
export const WEBSITE_DOMAIN_TXT_OWNERSHIP_LABEL = "_houzzatpro-challenge";

export type WebsiteDomainDnsInstructions = {
  purpose: "ownership_verification";
  /** Always false in F.1 — instructions are preparatory only. */
  verified: false;
  /** Always false in F.1 — PENDING domains are never live. */
  live: false;
  recordType: "TXT";
  /** Full DNS owner name, e.g. `_houzzatpro-challenge.example.com`. */
  host: string;
  value: string;
  summary: string;
};

export function buildWebsiteDomainTxtOwnershipHost(
  normalizedHostname: string,
): string {
  return `${WEBSITE_DOMAIN_TXT_OWNERSHIP_LABEL}.${normalizedHostname}`;
}

export function buildWebsiteDomainDnsInstructions(input: {
  hostname: string;
  verificationToken: string;
}): WebsiteDomainDnsInstructions {
  const host = buildWebsiteDomainTxtOwnershipHost(input.hostname);
  return {
    purpose: "ownership_verification",
    verified: false,
    live: false,
    recordType: "TXT",
    host,
    value: input.verificationToken,
    summary:
      "Add this TXT record to prove you control the domain. Your website is not live on this hostname until HouzzatPRO activates it later.",
  };
}
