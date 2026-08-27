/**
 * Stage 3K.5.6 — tenant-aware legal/support copy for marketing pages.
 */
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { resolveMarketingPresentationBrand } from "@/lib/tenancy/resolve-marketing-tenancy";

export type MarketingLegalSiteContext = {
  siteName: string;
  siteHost: string;
  supportEmail: string;
  isHouzzatWorkspace: boolean;
};

export async function resolveMarketingLegalSiteContext(): Promise<MarketingLegalSiteContext> {
  const brand = await resolveMarketingPresentationBrand();
  if (!brand) {
    let siteHost = "houzzat.com";
    try {
      siteHost = new URL(SITE_URL).host;
    } catch {
      /* keep default */
    }
    return {
      siteName: SITE_NAME,
      siteHost,
      supportEmail: "notify@houzzat.com",
      isHouzzatWorkspace: true,
    };
  }

  let siteHost = brand.canonicalOrigin;
  try {
    siteHost = new URL(brand.canonicalOrigin).host;
  } catch {
    /* keep fallback */
  }

  return {
    siteName: brand.displayName,
    siteHost,
    supportEmail: brand.contact.email?.trim() || "notify@houzzat.com",
    isHouzzatWorkspace: brand.isHouzzatWorkspace,
  };
}
