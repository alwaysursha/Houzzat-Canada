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
import { suggestedCitiesForLocation } from "@/lib/geo/regions";
import {
  resolveMarketingChromeBrand,
  resolveMarketingTenancy,
} from "@/lib/tenancy/resolve-marketing-tenancy";
import { organizationJsonLd } from "@/lib/seo";
import { getExpertWhatsAppNumber } from "@/lib/whatsapp";

/** Hostname-aware tenancy — must not be statically generated (see tenancy-cache-policy). */
export const dynamic = "force-dynamic";

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) {
    notFound();
  }
  const chromeBrand = await resolveMarketingChromeBrand();
  if (!chromeBrand) {
    notFound();
  }

  const cities = suggestedCitiesForLocation({ limit: 12 });
  const phone = getExpertWhatsAppNumber();

  return (
    <div className="min-h-dvh">
      <JsonLd data={organizationJsonLd({ telephone: phone })} />
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
          <MobileBottomNav cities={cities} />
        </MarketingChromeGate>
      </Suspense>
    </div>
  );
}
