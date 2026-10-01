"use client";

import { HouzzatInsights } from "@/components/listings/insights/HouzzatInsights";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { formatPrice } from "@/lib/listings/constants";
import { useListingInsights } from "@/lib/listings/listing-insights-client";
import { cn } from "@/lib/utils";

function InsightsSkeleton({ brandDisplayName }: { brandDisplayName: string }) {
  return (
    <section
      id="listing-insights"
      aria-busy="true"
      aria-label={`Loading ${brandDisplayName} Insights`}
      className="scroll-mt-[calc(var(--site-header-stack,4rem)+3.25rem)] overflow-hidden rounded-[1.75rem] border border-line bg-surface/90 p-4 sm:p-6"
    >
      <div className="h-3 w-28 animate-pulse rounded bg-mist" />
      <div className="mt-3 h-8 w-2/3 max-w-md animate-pulse rounded bg-mist" />
      <div className="mt-2 h-4 w-full max-w-lg animate-pulse rounded bg-mist/80" />
      <div
        id="listing-estimated-value"
        className="mt-6 space-y-3 rounded-2xl border border-line/70 bg-mist/40 p-4"
      >
        <div className="h-3 w-40 animate-pulse rounded bg-mist" />
        <div className="h-6 w-56 animate-pulse rounded bg-mist" />
        <div className="h-24 animate-pulse rounded-xl bg-mist" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-xl bg-mist/70" />
        <div className="h-28 animate-pulse rounded-xl bg-mist/70" />
      </div>
    </section>
  );
}

export function ListingInsightsDeferred({
  mlsNumber,
  callbackPath,
  needsEmailVerification = false,
}: {
  mlsNumber: string;
  callbackPath: string;
  needsEmailVerification?: boolean;
}) {
  const brandDisplayName = useTenantDisplayName("Houzzat");
  const { data: insights, failed } = useListingInsights(mlsNumber);

  if (insights) {
    return (
      <HouzzatInsights
        insights={insights}
        callbackPath={callbackPath}
        needsEmailVerification={needsEmailVerification}
        brandDisplayName={brandDisplayName}
      />
    );
  }

  if (failed) {
    return (
      <section
        id="listing-insights"
        className="scroll-mt-[calc(var(--site-header-stack,4rem)+3.25rem)] rounded-[1.75rem] border border-line bg-surface/90 p-5 sm:p-6"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
          {brandDisplayName} Insights
        </p>
        <h2 className="mt-1 font-sans font-semibold text-xl text-ink">
          Market insights unavailable
        </h2>
        <p className="mt-2 text-sm text-ink/55">
          We couldn&apos;t load comps and estimates right now. Refresh to try
          again — the rest of this listing is still available.
        </p>
        <div id="listing-estimated-value" className="sr-only" />
      </section>
    );
  }

  return <InsightsSkeleton brandDisplayName={brandDisplayName} />;
}

/** Asking-price companion. Uses the same insights payload as the Insights panel. */
export function ListingEstimateLine({
  mlsNumber,
  eligible,
  compact = false,
  className,
}: {
  mlsNumber: string;
  eligible: boolean;
  /** Grey “Est. Value” line beside the asking price. Desktop size is passed in className. */
  compact?: boolean;
  className?: string;
}) {
  const { data } = useListingInsights(mlsNumber, eligible);
  if (!eligible || !data) return null;
  const valuation = data.valuation;
  if (valuation.restricted || valuation.mid == null) return null;
  const amount = formatPrice(valuation.mid);
  if (!compact) return null;
  return (
    <p
      className={cn(
        "shrink-0 whitespace-nowrap text-sm font-medium leading-none tracking-tight text-ink/55",
        className,
      )}
    >
      Est. Value {amount}
    </p>
  );
}
