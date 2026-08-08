"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useSeoLocation } from "@/components/site/SeoLocationContext";
import {
  buildSeoFooterColumns,
  parseLocationFromPathname,
} from "@/lib/seo/footer-links";
import { resolveRegionFromCity } from "@/lib/geo/regions";

export function SeoFooterLinks({
  fallbackCities = [],
}: {
  /** Popular cities when page has no local context. */
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
    // When we only have fallback popular cities and no resolved region cities
    // beyond defaults, prefer the popular list for the default region.
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
    <nav
      aria-label="Popular local searches"
      className="border-t border-line/70 bg-[#f3f4f6]"
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="mb-6 text-[11px] font-bold uppercase tracking-[0.14em] text-ink/40">
          Explore {regionLabel}
        </p>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-[13px] font-bold text-ink">{column.title}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="text-[13px] leading-snug text-ink/65 transition hover:text-canopy hover:underline"
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
    </nav>
  );
}
