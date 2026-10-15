import { formatPrice } from "@/lib/listings/constants";
import type { NeighbourhoodInsights } from "@/lib/property-address/neighbourhood-insights";

export function NeighbourhoodInsightsCard({
  insights,
}: {
  insights: NeighbourhoodInsights;
}) {
  const scopeLabel =
    insights.scope === "community" ? "Neighbourhood" : "Municipality";

  return (
    <section
      className="mt-8 rounded-2xl border border-line bg-surface px-5 py-6 sm:px-6"
      aria-labelledby="neighbourhood-insights-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="neighbourhood-insights-heading"
          className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl"
        >
          {insights.empty
            ? "Neighbourhood market insights"
            : `${insights.placeLabel} market insights`}
        </h2>
        {!insights.empty ? (
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
            {scopeLabel}
          </p>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm text-ink/55">{insights.sampleNote}</p>

      {insights.empty ? (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-mist/40 px-4 py-6 text-center">
          <p className="text-sm font-medium text-ink/70">
            Market summary unavailable
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink/55">
            We don&apos;t have enough authorized active listings to show local
            asking-price statistics for this area yet.
          </p>
        </div>
      ) : (
        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-mist/50 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink/45">
              Active for sale
            </dt>
            <dd className="mt-1 font-display text-2xl font-semibold text-canopy">
              {insights.activeCount}
            </dd>
          </div>
          <div className="rounded-xl bg-mist/50 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink/45">
              Median asking price
            </dt>
            <dd className="mt-1 font-display text-2xl font-semibold text-canopy">
              {insights.medianAskingPrice != null
                ? formatPrice(insights.medianAskingPrice)
                : "—"}
            </dd>
          </div>
          <div className="rounded-xl bg-mist/50 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink/45">
              Average days on market
            </dt>
            <dd className="mt-1 font-display text-2xl font-semibold text-canopy">
              {insights.avgDaysOnMarket != null
                ? insights.avgDaysOnMarket
                : "—"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
