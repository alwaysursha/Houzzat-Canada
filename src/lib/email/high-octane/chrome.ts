import type { EmailBrandChrome } from "@/lib/email/tenant-email-brand";
import { HIGH_OCTANE_LOGO_URL } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

export const HIGH_OCTANE_EMAIL_PRESENTATION = "high-octane" as const;

export const HIGH_OCTANE_EMAIL_PREVIEW_ORIGIN =
  "https://high-octane-real-estate.houzzatpro.com" as const;

/** Non-deliverable preview identities. Never a real customer or owner. */
export const HIGH_OCTANE_EMAIL_PREVIEW_CUSTOMER =
  "preview.customer@example.invalid" as const;

export const HIGH_OCTANE_EMAIL_PREVIEW_AGENT =
  "preview.agent@example.invalid" as const;

export function isHighOctaneEmailSlug(slug: string | null | undefined): boolean {
  return slug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
}

/**
 * Presentation chrome only. Does not set a From address.
 * Contact lines come from the caller (workspace records or the approved preview fixture).
 */
export function highOctaneEmailChrome(input: {
  brandLabel?: string | null;
  websiteUrl: string;
  footerNote?: string | null;
  logoUrl?: string | null;
}): EmailBrandChrome {
  const website = input.websiteUrl.replace(/\/$/, "");
  const logo = input.logoUrl?.trim() || `${website}${HIGH_OCTANE_LOGO_URL}`;
  return {
    presentation: HIGH_OCTANE_EMAIL_PRESENTATION,
    brandLabel: input.brandLabel?.trim() || "HIGH OCTANE",
    brandLogoUrl: logo,
    brandPrimaryColor: "#C8A66A",
    brandWebsiteUrl: website,
    footerNote: input.footerNote?.trim() || "Powered by HouzzatPRO",
  };
}
