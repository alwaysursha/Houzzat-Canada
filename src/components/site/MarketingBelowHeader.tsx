"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AccountVerifiedSuccessBanner } from "@/components/auth/AccountVerifiedSuccessBanner";
import { SavedSearchChipBar } from "@/components/account/SavedSearchChipBar";
import { HomepagePersonalizationBanner } from "@/components/home/HomepagePersonalizationBanner";
import { SeoFooterLinks } from "@/components/site/SeoFooterLinks";
import { SeoLocationProvider } from "@/components/site/SeoLocationContext";
import { SiteFooter } from "@/components/site/SiteFooter";
import { AgentSignatureFooter } from "@/components/templates/agent-signature/AgentSignatureFooter";
import { RoyalCollectionFooter } from "@/components/templates/royal-collection-one/RoyalCollectionFooter";
import { TeamSignatureFooter } from "@/components/templates/team-signature/TeamSignatureFooter";
import type { MarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import {
  isAgentSignatureTemplateId,
  isRoyalCollectionOneTemplateId,
  isTeamSignatureTemplateId,
} from "@/lib/tenancy/templates";
import { resolveAgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";
import { resolveRoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { resolveTeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";

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
    return <main className="min-h-0 flex-1">{children}</main>;
  }

  const hideChrome = immersive || listingSheet || framed;

  return (
    <SeoLocationProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        {!hideChrome ? <HomepagePersonalizationBanner cities={cities} /> : null}
        {!hideChrome ? <SavedSearchChipBar cities={cities} /> : null}
        <main className="min-h-0 flex-1">
          {!hideChrome && pathname !== "/" ? (
            <AccountVerifiedSuccessBanner />
          ) : null}
          {children}
        </main>
        {/* Bottom-nav clearance after footer — not on main (avoids a blank band above the footer). */}
        {!hideChrome ? (
          <div className="pb-[var(--mobile-bottom-nav,0px)] md:pb-0">
            {!isAgentSignatureTemplateId(chromeBrand.templateId) &&
            !isTeamSignatureTemplateId(chromeBrand.templateId) &&
            !isRoyalCollectionOneTemplateId(chromeBrand.templateId) ? (
              <SeoFooterLinks fallbackCities={cities} />
            ) : null}
            {isAgentSignatureTemplateId(chromeBrand.templateId) ? (
              <AgentSignatureFooter
                view={resolveAgentSignatureView(chromeBrand)}
                fallbackCities={cities}
              />
            ) : isRoyalCollectionOneTemplateId(chromeBrand.templateId) ? (
              <RoyalCollectionFooter view={resolveRoyalCollectionView(chromeBrand)} />
            ) : isTeamSignatureTemplateId(chromeBrand.templateId) ? (
              <TeamSignatureFooter
                view={resolveTeamSignatureView(chromeBrand)}
                fallbackCities={cities}
              />
            ) : (
              <SiteFooter chromeBrand={chromeBrand} />
            )}
          </div>
        ) : null}
      </div>
    </SeoLocationProvider>
  );
}
