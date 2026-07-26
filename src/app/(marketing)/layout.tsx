import { Suspense } from "react";
import { AdsTrackingPixels } from "@/components/ads/AdsTrackingPixels";
import { UtmCapture } from "@/components/ads/UtmCapture";
import { MarketingBelowHeader } from "@/components/site/MarketingBelowHeader";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ScrollToTopButton } from "@/components/site/ScrollToTopButton";
import { RoutePlannerFloatingChip } from "@/components/route-planner/RoutePlannerFloatingChip";
import { getPopularCities } from "@/lib/listings/popular-cities";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const popularCities = await getPopularCities(12);
  const cities = popularCities.map((row) => row.city);

  return (
    <div className="min-h-dvh">
      <AdsTrackingPixels />
      <Suspense fallback={null}>
        <UtmCapture />
      </Suspense>
      <SiteHeader />
      <MarketingBelowHeader cities={cities}>{children}</MarketingBelowHeader>
      <RoutePlannerFloatingChip />
      <ScrollToTopButton />
    </div>
  );
}
