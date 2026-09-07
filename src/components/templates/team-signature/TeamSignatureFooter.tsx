"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { BrokeragePublicIdentity } from "@/components/site/BrokeragePublicIdentity";
import { useSeoLocation } from "@/components/site/SeoLocationContext";
import type { TeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";
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
  { href: "/areas", label: "Areas" },
  { href: "/home-valuation", label: "Home Value" },
  { href: "/#meet-the-team", label: "The Team" },
  { href: "/#contact-the-team", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/**
 * Stage 6.11E.2 — Team brand + brokerage identity footer.
 */
export function TeamSignatureFooter({
  view,
  fallbackCities = [],
}: {
  view: TeamSignatureView;
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
      className="border-t border-[var(--ts-ink,#0F6B4C)]/10 bg-[var(--ts-surface,#EEF3F0)]"
      data-ts-section="footer"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-10 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.85fr] lg:gap-16">
          <div className="space-y-3" data-team-public-identity="true">
            {view.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={view.logoUrl}
                alt=""
                className="h-12 w-auto max-w-[14rem] object-contain object-left sm:h-14"
              />
            ) : null}
            <p className="font-display text-3xl tracking-tight text-[var(--ts-ink,#0F6B4C)] sm:text-4xl">
              {view.teamName}
            </p>
            {view.serviceArea ? (
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--ts-ink,#0F6B4C)]/50">
                {view.serviceArea}
              </p>
            ) : null}
            <div className="space-y-1 pt-1 text-sm text-[var(--ts-ink,#0F6B4C)]/65">
              {view.phone ? (
                <p>
                  <span className="text-[var(--ts-ink,#0F6B4C)]/45">Phone: </span>
                  {view.phone}
                </p>
              ) : null}
              {view.email ? (
                <p>
                  <span className="text-[var(--ts-ink,#0F6B4C)]/45">Email: </span>
                  {view.email}
                </p>
              ) : null}
            </div>
            {view.markets.length > 0 ? (
              <p className="pt-2 text-xs uppercase tracking-[0.12em] text-[var(--ts-ink,#0F6B4C)]/40">
                Serving {view.markets.slice(0, 5).join(" · ")}
              </p>
            ) : null}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ts-ink,#0F6B4C)]/40">
              Navigate
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {NAV.map((l) => (
                <li key={`${l.href}-${l.label}`}>
                  <Link
                    href={l.href}
                    className="text-[var(--ts-ink,#0F6B4C)]/70 transition hover:text-[var(--ts-ink,#0F6B4C)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-[var(--ts-ink,#0F6B4C)]/10 bg-[var(--ts-surface-muted,var(--ts-surface,#EEF3F0))] px-5 py-8 sm:px-8 sm:py-10">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ts-ink,#0F6B4C)]/45">
            Brokerage
          </p>
          <BrokeragePublicIdentity
            brokerage={view.brokerage}
            tone="team-signature"
          />
        </div>

        <div className="mt-10 border-t border-[var(--ts-ink,#0F6B4C)]/8 pt-6">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ts-ink,#0F6B4C)]/30">
            Explore {regionLabel}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {columns.map((column) => (
              <div key={column.title}>
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ts-ink,#0F6B4C)]/35">
                  {column.title}
                </h2>
                <ul className="mt-1.5 space-y-1">
                  {column.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        className="text-[11px] leading-snug text-[var(--ts-ink,#0F6B4C)]/40 transition hover:text-[var(--ts-ink,#0F6B4C)]/70 hover:underline"
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

        <div className="mt-8 space-y-2 border-t border-[var(--ts-ink,#0F6B4C)]/8 pt-5">
          <MlsDisclaimer className="text-[10px] leading-relaxed text-[var(--ts-ink,#0F6B4C)]/40" />
          <p className="text-[10px] leading-relaxed text-[var(--ts-ink,#0F6B4C)]/40">
            REALTOR® is a registered trademark of The Canadian Real Estate
            Association.
          </p>
          <p className="text-[10px] text-[var(--ts-ink,#0F6B4C)]/30">
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
