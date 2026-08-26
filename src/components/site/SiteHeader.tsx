import { SiteHeaderClient } from "@/components/site/SiteHeaderClient";
import { SITE_NAME } from "@/lib/constants";
import type { MarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";

/** Marketing header shell — session/portal resolved client-side via useSession. */
export function SiteHeader({
  chromeBrand,
}: {
  chromeBrand?: Pick<MarketingChromeBrand, "displayName">;
}) {
  return (
    <SiteHeaderClient siteName={chromeBrand?.displayName ?? SITE_NAME} />
  );
}
