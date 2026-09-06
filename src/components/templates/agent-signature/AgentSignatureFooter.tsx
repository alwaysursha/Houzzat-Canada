"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { AgentPublicContactLines } from "@/components/site/AgentPublicContact";
import { BrokeragePublicIdentity } from "@/components/site/BrokeragePublicIdentity";
import { useSeoLocation } from "@/components/site/SeoLocationContext";
import type { AgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";
import {
  HOUZZATPRO_PLATFORM_URL,
  POWERED_BY_HOUZZATPRO_LABEL,
} from "@/lib/tenancy/platform-footer";
import {
  buildSeoFooterColumns,
  parseLocationFromPathname,
} from "@/lib/seo/footer-links";
import { resolveRegionFromCity } from "@/lib/geo/regions";

const NAV = [
  { href: "/search?transactionType=SALE", label: "Buy" },
  { href: "/home-valuation", label: "Sell" },
  { href: "/search", label: "Listings" },
  { href: "/areas", label: "Communities" },
  { href: "/home-valuation", label: "Home Value" },
  { href: "/#meet-the-agent", label: "About" },
  { href: "/#work-with-me", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/**
 * Stage 6.11B.5 / 6.11D — agent-first footer; SEO discovery visually tertiary.
 * Brokerage public identity via shared BrokeragePublicIdentity (reasonable logo size).
 */
export function AgentSignatureFooter({
  view,
  fallbackCities = [],
}: {
  view: AgentSignatureView;
  fallbackCities?: string[];
}) {
  const pathname = usePathname() || "/";
  const seoLocation = useSeoLocation();

  const columns = useMemo(() => {
    const fromPath = parseLocationFromPathname(pathname);
    const city =
      seoLocation?.location?.city?.trim() ||
      fromPath.city ||
      fallbackCities[0] ||
      null;
    const community =
      seoLocation?.location?.community?.trim() || fromPath.community || null;
    const { region } = resolveRegionFromCity(city);
    const regionForBuild =
      !city && fallbackCities.length
        ? {
            id: "default" as const,
            label: "GTA",
            cities: fallbackCities,
          }
        : region;
    return buildSeoFooterColumns({
      city,
      community,
      region: regionForBuild,
    });
  }, [pathname, seoLocation?.location, fallbackCities]);

  const regionLabel = useMemo(() => {
    const city =
      seoLocation?.location?.city?.trim() ||
      parseLocationFromPathname(pathname).city ||
      fallbackCities[0] ||
      null;
    return resolveRegionFromCity(city).region.label;
  }, [pathname, seoLocation?.location, fallbackCities]);

  return (
    <footer
      className="border-t border-ink/10 bg-mist"
      data-as-section="footer"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-10 lg:py-16">
        {/* PRIMARY — agent identity only (brokerage name lives in BROKERAGE block) */}
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.85fr] lg:gap-16">
          <div className="space-y-3" data-agent-public-identity="true">
            <p className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
              {view.name}
            </p>
            {view.title || view.serviceArea ? (
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink/50">
                {[view.title, view.serviceArea].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <AgentPublicContactLines
              cellPhone={view.phone}
              email={view.email}
              className="pt-1 text-sm text-ink/65"
              labelClassName="text-ink/50"
            />
            {view.markets.length > 0 ? (
              <p className="pt-2 text-xs uppercase tracking-[0.12em] text-ink/40">
                Serving {view.markets.slice(0, 5).join(" · ")}
              </p>
            ) : null}
          </div>

          {/* SECONDARY — navigation */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
              Navigate
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {NAV.map((l) => (
                <li key={`${l.href}-${l.label}`}>
                  <Link
                    href={l.href}
                    className="text-ink/70 transition hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Stage 6.11D — brokerage public identity (directly visible) */}
        <div className="mt-10 border-t border-ink/8 pt-8">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
            Brokerage
          </p>
          <BrokeragePublicIdentity
            brokerage={view.brokerage}
            tone="agent-signature"
          />
        </div>

        {/* TERTIARY — SEO discovery (smaller, quieter, tighter) */}
        <div className="mt-10 border-t border-ink/8 pt-6">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink/30">
            Explore {regionLabel}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {columns.map((column) => (
              <div key={column.title}>
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/35">
                  {column.title}
                </h2>
                <ul className="mt-1.5 space-y-1">
                  {column.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        className="text-[11px] leading-snug text-ink/40 transition hover:text-ink/70 hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 space-y-2 border-t border-ink/8 pt-5">
          <MlsDisclaimer className="text-[10px] leading-relaxed text-ink/40" />
          <p className="text-[10px] leading-relaxed text-ink/40">
            REALTOR® is a registered trademark of The Canadian Real Estate
            Association.
          </p>
          <p className="text-[10px] text-ink/30">
            <a
              href={HOUZZATPRO_PLATFORM_URL}
              className="underline-offset-2 hover:underline"
              rel="noopener noreferrer"
            >
              {POWERED_BY_HOUZZATPRO_LABEL}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
