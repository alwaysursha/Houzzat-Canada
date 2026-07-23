import { formatPrice } from "@/lib/listings/constants";
import type { MarketPulse } from "@/lib/market/pulse";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";

export function MarketPulseCard({
  pulse,
  vowCallbackPath,
}: {
  pulse: MarketPulse;
  vowCallbackPath?: string;
}) {
  const title = pulse.community
    ? `${pulse.community} market pulse`
    : `${pulse.city} market pulse`;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <p className="mt-1 text-xs text-ink/45">{pulse.sampleNote}</p>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-ink/45">Active</dt>
          <dd className="font-display text-2xl text-canopy">{pulse.activeCount}</dd>
        </div>
        <div>
          <dt className="text-ink/45">Median ask</dt>
          <dd className="font-display text-2xl text-canopy">
            {pulse.medianListPrice != null
              ? formatPrice(pulse.medianListPrice)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink/45">Avg DOM</dt>
          <dd className="font-display text-2xl text-canopy">
            {pulse.avgDaysOnMarket ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink/45">
            {pulse.soldRestricted ? "Median sold" : "Sold / over-ask"}
          </dt>
          <dd className="font-display text-2xl text-canopy">
            {pulse.soldRestricted ? (
              <span className="text-base font-sans font-medium text-ink/40">
                Clients
              </span>
            ) : (
              <>
                {pulse.medianSoldPrice != null
                  ? formatPrice(pulse.medianSoldPrice)
                  : "—"}
                {pulse.soldOverAskingPct != null ? (
                  <span className="mt-1 block font-sans text-xs font-medium text-ink/50">
                    {pulse.soldOverAskingPct}% ≥ ask · {pulse.soldCount} solds
                  </span>
                ) : null}
              </>
            )}
          </dd>
        </div>
      </dl>
      {pulse.soldRestricted && vowCallbackPath ? (
        <p className="text-sm text-ink/60">
          <AuthOpenButton
            mode="sign-up"
            callbackUrl={vowCallbackPath}
            className="font-medium text-canopy hover:underline"
          >
            Register free
          </AuthOpenButton>{" "}
          to unlock sold medians for this area.
        </p>
      ) : null}
    </section>
  );
}
