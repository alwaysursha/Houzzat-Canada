import { Suspense } from "react";
import { AdsTrackingPixels } from "@/components/ads/AdsTrackingPixels";
import { UtmCapture } from "@/components/ads/UtmCapture";
import { JsonLd } from "@/components/seo/JsonLd";
import { MarketingBelowHeader } from "@/components/site/MarketingBelowHeader";
import { SiteHeader } from "@/components/site/SiteHeader";
import { MobileBottomNav } from "@/components/site/MobileBottomNav";
import { ScrollToTopButton } from "@/components/site/ScrollToTopButton";
import { RoutePlannerFloatingChip } from "@/components/route-planner/RoutePlannerFloatingChip";
import { getPopularCities } from "@/lib/listings/popular-cities";
import { organizationJsonLd } from "@/lib/seo";
import { getExpertWhatsAppNumber } from "@/lib/whatsapp";

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const popularCities = await getPopularCities(12);
  const cities = popularCities.map((row) => row.city);
  const phone = getExpertWhatsAppNumber();

  return (
    <div className="min-h-dvh">
      <JsonLd data={organizationJsonLd({ telephone: phone })} />
      <AdsTrackingPixels />
      <Suspense fallback={null}>
        <UtmCapture />
      </Suspense>
      <SiteHeader />
      <MarketingBelowHeader cities={cities}>{children}</MarketingBelowHeader>
      <RoutePlannerFloatingChip />
      <ScrollToTopButton />
      <MobileBottomNav cities={cities} />
    </div>
  );
}
