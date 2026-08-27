import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdsTrackingPixels } from "@/components/ads/AdsTrackingPixels";
import { UtmCapture } from "@/components/ads/UtmCapture";
import { JsonLd } from "@/components/seo/JsonLd";
import { MarketingBelowHeader } from "@/components/site/MarketingBelowHeader";
import { MarketingChromeGate } from "@/components/site/MarketingChromeGate";
import { SiteHeader } from "@/components/site/SiteHeader";
import { MobileBottomNav } from "@/components/site/MobileBottomNav";
import { ScrollToTopButton } from "@/components/site/ScrollToTopButton";
import { RoutePlannerFloatingChip } from "@/components/route-planner/RoutePlannerFloatingChip";
import { ListingSheetHostLazy } from "@/components/mobile/ListingSheetHostLazy";
import { TenantBrandProvider } from "@/components/tenancy/TenantBrandProvider";
import { TenantThemeStyle } from "@/components/tenancy/TenantThemeStyle";
import { suggestedCitiesForLocation } from "@/lib/geo/regions";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import {
  resolveMarketingPresentationBrand,
  resolveMarketingTenancy,
} from "@/lib/tenancy/resolve-marketing-tenancy";
import {
  buildMarketingRootMetadata,
  organizationJsonLdForTenancy,
} from "@/lib/tenancy/tenant-seo";
import { getExpertWhatsAppNumber } from "@/lib/whatsapp";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { isHouzzatProPlatformBootstrapRequest } from "@/lib/mobile/platform-bootstrap-request";

/** Hostname-aware tenancy — must not be statically generated (see tenancy-cache-policy). */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (await isHouzzatProPlatformBootstrapRequest()) {
    return { title: PLATFORM_PRODUCT_NAME, robots: { index: false, follow: false } };
  }
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) {
    return { title: "Not found" };
  }
  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  return buildMarketingRootMetadata(tenancy, canonicalOrigin);
}

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (await isHouzzatProPlatformBootstrapRequest()) {
    return <>{children}</>;
  }

  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) {
    notFound();
  }
  const chromeBrand = await resolveMarketingPresentationBrand();
  if (!chromeBrand) {
    notFound();
  }

  const cities = suggestedCitiesForLocation({ limit: 12 });
  const phone =
    chromeBrand.contact.phone ?? getExpertWhatsAppNumber() ?? undefined;

  return (
    <TenantBrandProvider brand={chromeBrand}>
      <TenantThemeStyle
        colors={chromeBrand.colors}
        isHouzzatWorkspace={chromeBrand.isHouzzatWorkspace}
      />
      <div className="min-h-dvh">
        <JsonLd
          data={organizationJsonLdForTenancy(
            tenancy,
            chromeBrand.canonicalOrigin,
            { telephone: phone },
          )}
        />
        <AdsTrackingPixels />
        <Suspense fallback={null}>
          <UtmCapture />
        </Suspense>
        <Suspense fallback={null}>
          <MarketingChromeGate>
            <SiteHeader chromeBrand={chromeBrand} />
          </MarketingChromeGate>
        </Suspense>
        <Suspense fallback={null}>
          <MarketingBelowHeader cities={cities} chromeBrand={chromeBrand}>
            {children}
          </MarketingBelowHeader>
        </Suspense>
        <Suspense fallback={null}>
          <MarketingChromeGate>
            <RoutePlannerFloatingChip />
            <ScrollToTopButton />
            <MobileBottomNav cities={cities} chromeBrand={chromeBrand} />
          </MarketingChromeGate>
        </Suspense>
        <ListingSheetHostLazy />
      </div>
    </TenantBrandProvider>
  );
}
