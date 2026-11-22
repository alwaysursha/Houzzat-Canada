/**
 * DNS instructions for a custom website domain on the shared HouzzatPRO project.
 * Records are additive. They never replace nameservers or email DNS.
 */

/** Rank-1 targets read from houzzat-vercel-test on 2026-11-22. Readiness replaces these when Vercel returns newer values. */
export const SHARED_PROJECT_APEX_A_RECORDS = ["216.150.1.1", "216.150.16.1"] as const;

export const SHARED_PROJECT_CNAME_TARGET = "8dc22e6f8157be0f.vercel-dns-017.com";

export const ATTACH_CUSTOM_DOMAIN_CONFIRMATION = "ATTACH_CUSTOM_DOMAIN" as const;
export const ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION = "ACTIVATE_CUSTOM_DOMAIN" as const;

export const CUSTOM_DOMAIN_DNS_CONSTRAINTS = [
  "Do not change nameservers.",
  "Do not remove or edit existing MX, SPF, DKIM, or other email records.",
  "Add these records beside the current DNS. The houzzatpro.com hostname stays in service.",
] as const;

export type DnsRecordPurpose = "ownership" | "routing" | "vercel_verification";

export type DnsRecordInstruction = {
  type: "A" | "CNAME" | "TXT";
  host: string;
  value: string;
  purpose: DnsRecordPurpose;
};

export function apexWwwPair(
  hostname: string,
): { apex: string; www: string } | null {
  const normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("www.")) {
    const apex = normalized.slice(4);
    if (!apex.includes(".") || apex.startsWith("www.")) return null;
    return { apex, www: `www.${apex}` };
  }
  if (normalized.split(".").length === 2) {
    return { apex: normalized, www: `www.${normalized}` };
  }
  return null;
}

/** Hostnames a Master Admin prepare should create for one entered name. Apex and www stay a pair. */
export function customDomainClaimHostnames(hostname: string): string[] {
  const pair = apexWwwPair(hostname);
  if (!pair) return [hostname];
  return [pair.apex, pair.www];
}

export function buildCustomDomainDnsPlan(input: {
  claims: readonly { hostname: string; verificationToken: string }[];
  apexARecords?: readonly string[];
  cnameTarget?: string;
  extraRecords?: readonly DnsRecordInstruction[];
}): { records: DnsRecordInstruction[]; constraints: readonly string[] } {
  const apexARecords = input.apexARecords ?? SHARED_PROJECT_APEX_A_RECORDS;
  const cnameTarget = (input.cnameTarget ?? SHARED_PROJECT_CNAME_TARGET).replace(
    /\.$/,
    "",
  );
  const records: DnsRecordInstruction[] = [];

  for (const claim of input.claims) {
    records.push({
      type: "TXT",
      host: `_houzzatpro-challenge.${claim.hostname}`,
      value: claim.verificationToken,
      purpose: "ownership",
    });
  }

  const apexes = new Set<string>();
  for (const claim of input.claims) {
    const pair = apexWwwPair(claim.hostname);
    if (pair) {
      apexes.add(pair.apex);
      continue;
    }
    records.push({
      type: "CNAME",
      host: claim.hostname,
      value: cnameTarget,
      purpose: "routing",
    });
  }

  for (const apex of apexes) {
    for (const ip of apexARecords) {
      records.push({
        type: "A",
        host: apex,
        value: ip,
        purpose: "routing",
      });
    }
    records.push({
      type: "CNAME",
      host: `www.${apex}`,
      value: cnameTarget,
      purpose: "routing",
    });
  }

  if (input.extraRecords) {
    records.push(...input.extraRecords);
  }

  return { records, constraints: CUSTOM_DOMAIN_DNS_CONSTRAINTS };
}
