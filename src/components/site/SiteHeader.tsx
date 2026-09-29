import { SiteHeaderClient } from "@/components/site/SiteHeaderClient";
import { SITE_NAME } from "@/lib/constants";
import type { MarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";

/** Marketing header shell — session/portal resolved client-side via useSession. */
export function SiteHeader({
  chromeBrand,
}: {
  chromeBrand?: MarketingChromeBrand;
}) {
  const brand = chromeBrand;
  return (
    <SiteHeaderClient
      siteName={brand?.displayName ?? SITE_NAME}
      primaryColor={brand?.colors.primary ?? "#0F6B4C"}
      accountLabel={
        brand?.isHouzzatWorkspace
          ? "Your Houzzat"
          : brand
            ? `Your ${brand.displayName}`
            : "Your account"
      }
      logoUrl={brand?.logoUrl ?? null}
      showLogoMark={Boolean(brand && !brand.isHouzzatWorkspace)}
    />
  );
}
