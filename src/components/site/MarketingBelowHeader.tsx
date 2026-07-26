"use client";

import { usePathname } from "next/navigation";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
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
    <>
      {!immersive ? <HomepagePersonalizationBanner cities={cities} /> : null}
      {!immersive ? <SavedSearchChipBar cities={cities} /> : null}
      <main className={immersive ? "min-h-0" : undefined}>{children}</main>
      {!immersive ? <SiteFooter /> : null}
    </>
  );
}
