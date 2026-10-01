"use client";

import { useEffect, useState } from "react";
import { HouzzatInsights } from "@/components/listings/insights/HouzzatInsights";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import type { ListingInsightsPayload } from "@/lib/market/listing-insights";

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
  const [insights, setInsights] = useState<ListingInsightsPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(
          `/api/listings/${encodeURIComponent(mlsNumber)}/insights`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`insights ${res.status}`);
        const data = (await res.json()) as { insights?: ListingInsightsPayload };
        if (cancelled) return;
        if (!data.insights) throw new Error("missing insights");
        setInsights(data.insights);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        console.error("[ListingInsightsDeferred]", error);
        setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mlsNumber]);

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
