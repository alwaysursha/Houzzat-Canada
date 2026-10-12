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
import { TeamSignatureFooter } from "@/components/templates/team-signature/TeamSignatureFooter";
import type { MarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import {
  isAgentSignatureTemplateId,
  isTeamSignatureTemplateId,
} from "@/lib/tenancy/templates";
import { resolveAgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";
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
        <main
          className={
            hideChrome
              ? "min-h-0 flex-1"
              : "min-h-0 flex-1 pb-[var(--mobile-bottom-nav,0px)] md:pb-0"
          }
        >
          {!hideChrome && pathname !== "/" ? (
            <AccountVerifiedSuccessBanner />
          ) : null}
          {children}
        </main>
        {!hideChrome &&
        !isAgentSignatureTemplateId(chromeBrand.templateId) &&
        !isTeamSignatureTemplateId(chromeBrand.templateId) ? (
          <SeoFooterLinks fallbackCities={cities} />
        ) : null}
        {!hideChrome ? (
          isAgentSignatureTemplateId(chromeBrand.templateId) ? (
            <AgentSignatureFooter
              view={resolveAgentSignatureView(chromeBrand)}
              fallbackCities={cities}
            />
          ) : isTeamSignatureTemplateId(chromeBrand.templateId) ? (
            <TeamSignatureFooter
              view={resolveTeamSignatureView(chromeBrand)}
              fallbackCities={cities}
            />
          ) : (
            <SiteFooter chromeBrand={chromeBrand} />
          )
        ) : null}
      </div>
    </SeoLocationProvider>
  );
}
