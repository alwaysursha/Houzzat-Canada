"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AccountVerifiedSuccessBanner } from "@/components/auth/AccountVerifiedSuccessBanner";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
import { SeoFooterLinks } from "@/components/site/SeoFooterLinks";
import { SeoLocationProvider } from "@/components/site/SeoLocationContext";
import { SiteFooter } from "@/components/site/SiteFooter";
import type { MarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";

/** Hides marketing chrome on immersive routes like /search and listing sheet. */
export function MarketingBelowHeader({
  cities,
  chromeBrand,
  children,
}: {
  cities: string[];
  chromeBrand: MarketingChromeBrand;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [framed, setFramed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  });
  const isPro = pathname === "/pro" || pathname?.startsWith("/pro/");
  const immersive =
    pathname === "/search" ||
    pathname.startsWith("/search?") ||
    isPro;
  const listingSheet = params.get("sheet") === "1";

  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true);
    }
  }, []);

  if (isPro) {
    return <main className="min-h-0">{children}</main>;
  }

  const hideChrome = immersive || listingSheet || framed;

  return (
    <SeoLocationProvider>
      {!hideChrome ? <HomepagePersonalizationBanner cities={cities} /> : null}
      {!hideChrome ? <SavedSearchChipBar cities={cities} /> : null}
      <main
        className={
          hideChrome
            ? "min-h-0"
            : "pb-[var(--mobile-bottom-nav,0px)] md:pb-0"
        }
      >
        {!hideChrome && pathname !== "/" ? (
          <AccountVerifiedSuccessBanner />
        ) : null}
        {children}
      </main>
      {!hideChrome ? <SeoFooterLinks fallbackCities={cities} /> : null}
      {!hideChrome ? <SiteFooter chromeBrand={chromeBrand} /> : null}
    </SeoLocationProvider>
  );
}
