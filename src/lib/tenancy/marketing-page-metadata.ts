/**
 * Stage 3K.5.6 — hostname-aware metadata for marketing/public pages.
 */
import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { resolveMarketingTenancy } from "@/lib/tenancy/resolve-marketing-tenancy";
import { buildTenantPublicPageMetadata } from "@/lib/tenancy/tenant-seo";

export async function resolveMarketingCanonicalOrigin(): Promise<string | null> {
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) return null;
  return resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
}

/** Indexable marketing page with tenant hostname canonical + OG/Twitter. */
export async function buildMarketingPageMetadata(input: {
  title: string;
  description: string;
  path: string;
}): Promise<Metadata> {
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) {
    return publicPageMetadata(input);
  }
  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  return buildTenantPublicPageMetadata({
    tenancy,
    canonicalOrigin,
    ...input,
  });
}

export async function buildMarketingAuthPageMetadata(
  title: string,
): Promise<Metadata> {
  return buildMarketingPageMetadata({
    title,
    description: `${title} to your account.`,
    path: title.toLowerCase().includes("sign up") ? "/auth/sign-up" : "/auth/sign-in",
  });
}
