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
import { organizationJsonLd } from "@/lib/seo";
import { getExpertWhatsAppNumber } from "@/lib/whatsapp";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Static regional defaults — no Neon inventory ranking on every page.
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
          <SiteHeader />
        </MarketingChromeGate>
      </Suspense>
      <Suspense fallback={null}>
        <MarketingBelowHeader cities={cities}>{children}</MarketingBelowHeader>
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
