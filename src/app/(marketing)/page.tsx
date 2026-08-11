import Link from "next/link";
import type { Metadata } from "next";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { HomeAreaRailLive } from "@/components/home/HomeAreaRailLive";
import { HomeBrowseChips } from "@/components/home/HomeBrowseChips";
import { HomeDeferredBody } from "@/components/home/HomeDeferredBody";
import { HomeHeroSearch } from "@/components/home/HomeHeroSearch";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { suggestedCitiesForLocation } from "@/lib/geo/regions";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/seo";

/** Public homepage shell — signed-in tools/rails hydrate after paint. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: {
    absolute: `${SITE_NAME} | GTA Homes for Sale & Open Houses`,
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: `${SITE_NAME} | GTA Homes for Sale & Open Houses`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    type: "website",
    locale: "en_CA",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | GTA Homes for Sale & Open Houses`,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE.url],
  },
};

export default function HomePage() {
  const suggestionCities = suggestedCitiesForLocation({ limit: 8 });
  // Config-only guest shell — no session. VOW-only hides market rails for guests.
  const vowOnlyGuest = isVowOnlyMlsMode();

  return (
    <div>
      <section id="home-hero" className="relative z-[35]">
        {/* Desktop brand hero — hidden on mobile so listings start near the fold */}
        <div className="absolute inset-0 hidden overflow-hidden sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element -- serve original hero pixels without optimizer recompression */}
          <img
            src="/images/hero-canadian-homes.jpg"
            alt="Toronto skyline over Queen's Park"
            className="absolute inset-0 h-full w-full object-cover object-[right_20%]"
            fetchPriority="high"
            decoding="async"
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgb(15 107 76 / 0.97) 0%, rgb(15 107 76 / 0.88) 22%, rgb(15 107 76 / 0.55) 48%, rgb(15 107 76 / 0.18) 72%, transparent 100%)",
            }}
          />
        </div>

        {/* Mobile: compact search + section shortcuts (no tall hero) */}
        <div
          className="relative px-4 pb-4 pt-3 sm:hidden"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgb(15 107 76 / 0.2) 0%, rgb(15 107 76 / 0.08) 45%, rgb(15 107 76 / 0) 100%)",
          }}
        >
          <h1 className="sr-only">
            Find homes in Ontario — search GTA residential and commercial
            properties
          </h1>
          <HomeHeroSearch surface="page" />
          <HomeBrowseChips className="mt-3" />
        </div>

        {/* Desktop hero copy + search */}
        <div className="relative hidden min-h-[40vh] w-full flex-col justify-end px-4 pb-8 pt-20 sm:flex sm:px-6 lg:px-10">
          <div>
            <h1 className="font-display text-3xl tracking-tight text-white sm:text-4xl md:text-5xl">
              Find Homes in Ontario
            </h1>
            <p className="mt-3 text-base font-medium text-white/90 sm:text-lg md:text-xl">
              Search Residential and Commercial Properties — Data using Technology
            </p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="min-w-0 flex-1">
              <HomeHeroSearch />
            </div>
          </div>
        </div>
      </section>

      <HomeDeferredBody vowOnlyGuest={vowOnlyGuest} cities={suggestionCities}>
        <HomeAreaRailLive />

        <section className="space-y-4">
          <h2 className="font-display text-2xl text-ink">For sellers</h2>
          <p className="max-w-2xl text-sm text-ink/65">
            Price with confidence, then get launch-ready — valuation, readiness
            checklist, and agent follow-up.
          </p>
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <Link href="/home-valuation" className="text-canopy hover:underline">
              Home valuation →
            </Link>
            <Link
              href="/tools/seller-readiness"
              className="text-canopy hover:underline"
            >
              Seller readiness →
            </Link>
            <Link
              href="/tools/affordability"
              className="text-canopy hover:underline"
            >
              Buyer affordability →
            </Link>
          </div>
        </section>

        <MlsDisclaimer />
      </HomeDeferredBody>
    </div>
  );
}
