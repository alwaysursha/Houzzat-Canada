import type { Metadata } from "next";
import { Suspense } from "react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { SearchExperience } from "@/components/listings/SearchExperience";
import { publicPageMetadata } from "@/lib/seo";

/** Public search shell only — results load via /api/listings/search. */
export const revalidate = 300;

export const metadata: Metadata = publicPageMetadata({
  title: "Search GTA Homes for Sale",
  description:
    "Filter MLS listings across the Greater Toronto Area by price, beds, baths, property type, and neighbourhood.",
  path: "/search",
});

export default function SearchPage() {
  return (
    <div className="flex h-[calc(100dvh-var(--site-header-stack,4rem)-var(--mobile-bottom-nav,0px))] flex-col overflow-hidden bg-mist">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-ink/50">
            Loading search…
          </div>
        }
      >
        <SearchExperience />
      </Suspense>
      <div className="shrink-0 border-t border-line/80 bg-surface px-3 py-1 sm:px-4 sm:py-1.5 [[data-mobile-bottom-nav='0']_&]:pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]">
        {/* ≤1023: collapsed disclosure (full approved copy on expand). Desktop: full text. */}
        <MlsDisclaimer compact className="lg:hidden" />
        <MlsDisclaimer className="hidden text-[10px] leading-snug text-ink/40 lg:block" />
      </div>
    </div>
  );
}
