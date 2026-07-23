import { Suspense } from "react";
import { AdsTrackingPixels } from "@/components/ads/AdsTrackingPixels";
import { UtmCapture } from "@/components/ads/UtmCapture";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getPopularCities } from "@/lib/listings/popular-cities";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const popularCities = await getPopularCities(12);
  const cities = popularCities.map((row) => row.city);

  return (
    <div className="flex min-h-full flex-col">
      <AdsTrackingPixels />
      <Suspense fallback={null}>
        <UtmCapture />
      </Suspense>
      <SiteHeader />
      <HomepagePersonalizationBanner cities={cities} />
      <SavedSearchChipBar cities={cities} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
