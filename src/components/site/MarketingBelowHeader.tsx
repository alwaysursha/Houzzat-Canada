"use client";

import { usePathname } from "next/navigation";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
import { SeoFooterLinks } from "@/components/site/SeoFooterLinks";
import { SeoLocationProvider } from "@/components/site/SeoLocationContext";
import { SiteFooter } from "@/components/site/SiteFooter";

/** Hides marketing chrome on immersive routes like /search. */
export function MarketingBelowHeader({
  cities,
  children,
}: {
  cities: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const immersive = pathname === "/search" || pathname.startsWith("/search?");

  return (
    <SeoLocationProvider>
      {!immersive ? <HomepagePersonalizationBanner cities={cities} /> : null}
      {!immersive ? <SavedSearchChipBar cities={cities} /> : null}
      <main
        className={
          immersive
            ? "min-h-0"
            : "pb-[var(--mobile-bottom-nav,0px)] md:pb-0"
        }
      >
        {children}
      </main>
      {!immersive ? <SeoFooterLinks fallbackCities={cities} /> : null}
      {!immersive ? <SiteFooter /> : null}
    </SeoLocationProvider>
  );
}
