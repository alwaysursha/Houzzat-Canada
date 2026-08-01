import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Home,
  MapPin,
  Ruler,
  Sparkles,
  Users,
} from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import {
  LifestyleBars,
  OwnershipDonut,
  PricePositionBar,
  PriceTimelineChart,
  TemperatureGauge,
} from "@/components/listings/insights/InsightCharts";
import { InsightGate } from "@/components/listings/insights/InsightGate";
import { ListingSection } from "@/components/listings/ListingSection";
import { formatPrice, formatPriceCompact } from "@/lib/listings/constants";
import type { ListingInsightsPayload } from "@/lib/market/listing-insights";
import { VOW_PUBLIC_NOTE } from "@/lib/vow";
import { cn } from "@/lib/utils";

function ResponsivePrice({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  return (
    <>
      <span className={cn("md:hidden", className)}>
        {formatPriceCompact(amount)}
      </span>
      <span className={cn("hidden md:inline", className)}>
        {formatPrice(amount)}
      </span>
    </>
  );
}

function Panel({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <ListingSection id={id} className={cn("bg-surface/90", className)}>
      {children}
    </ListingSection>
  );
}

function PanelTitle({
  eyebrow,
  title,
  hint,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
}) {
  return (
    <header className="mb-4">
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy/80">
          {eyebrow}
        </p>
      ) : null}
      <h3 className="mt-1 font-display text-xl text-ink sm:text-2xl">{title}</h3>
      {hint ? <p className="mt-1 text-sm text-ink/55">{hint}</p> : null}
    </header>
  );
}

function DeltaChip({ value }: { value: number | null }) {
  if (value == null) return null;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        flat && "bg-mist text-ink/55",
        !flat && up && "bg-signal/15 text-signal",
        !flat && !up && "bg-canopy/12 text-canopy-deep",
      )}
    >
      {!flat && up ? (
        <ArrowUpRight className="size-3.5" aria-hidden />
      ) : !flat ? (
        <ArrowDownRight className="size-3.5" aria-hidden />
      ) : null}
      {flat ? "In line" : `${up ? "+" : ""}${value}% vs median`}
    </span>
  );
}

export function HouzzatInsights({
  insights,
  callbackPath,
}: {
  insights: ListingInsightsPayload;
  callbackPath: string;
}) {
  const {
    placeLabel,
    signedIn,
    temperature,
    pricePosition,
    timeline,
    comps,
    ownership,
    lifestyle,
    space,
    competition,
    valuation,
    timing,
    pulse,
  } = insights;

  const taxMonthly =
    ownership.taxesAnnual != null ? Math.round(ownership.taxesAnnual / 12) : 0;
  const maint = ownership.maintenanceMonthly ?? 0;

  return (
    <section
      aria-labelledby="houzzat-insights-heading"
      className="relative overflow-hidden rounded-[1.75rem] border border-line bg-[linear-gradient(165deg,rgb(244_247_245)_0%,rgb(255_255_255)_42%,rgb(238_244_241)_100%)]"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-canopy/[0.07] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-10 size-72 rounded-full bg-signal/[0.06] blur-3xl"
        aria-hidden
      />

      <div className="relative space-y-5 p-4 sm:space-y-6 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
              <Sparkles className="size-3.5" aria-hidden />
              Houzzat Insights
            </p>
            <h2
              id="houzzat-insights-heading"
              className="mt-2 font-display text-3xl text-ink sm:text-4xl"
            >
              Understand this home in {placeLabel}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/60 sm:text-base">
              Clear market context, costs, and lifestyle signals. Estimates are
              guides, not appraisals.
            </p>
          </div>
          {!signedIn ? (
            <p className="max-w-xs rounded-xl border border-canopy/20 bg-canopy/5 px-3 py-2 text-xs leading-relaxed text-ink/65">
              Sold prices & valuation are for registered clients.{" "}
              <AuthOpenButton
                mode="sign-up"
                callbackUrl={callbackPath}
                className="font-semibold text-canopy hover:underline"
              >
                Join free
              </AuthOpenButton>
            </p>
          ) : null}
        </div>

        {/* Hero: temperature + narrative */}
        <Panel className="bg-surface/90">
          <div className="grid gap-6 lg:grid-cols-[200px_1fr] lg:items-center">
            <TemperatureGauge
              score={temperature.score}
              label={temperature.label}
            />
            <div>
              <PanelTitle
                eyebrow="Market temperature"
                title={temperature.label}
                hint={temperature.summary}
              />
              <ul className="grid gap-2 sm:grid-cols-2">
                {temperature.factors.map((f) => (
                  <li
                    key={f.label}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm",
                      f.tone === "pos" && "border-canopy/25 bg-canopy/5",
                      f.tone === "neg" && "border-signal/25 bg-signal/5",
                      f.tone === "neu" && "border-line bg-mist/60",
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">
                      {f.label}
                    </p>
                    <p className="mt-0.5 font-medium text-ink/80">{f.detail}</p>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line/70 pt-4 text-center">
                <div>
                  <dt className="text-[11px] text-ink/45">Active nearby</dt>
                  <dd className="font-display text-xl text-ink">
                    {pulse.activeCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink/45">This DOM</dt>
                  <dd className="font-display text-xl text-ink">
                    {timing.daysOnMarket}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink/45">Similar actives</dt>
                  <dd className="font-display text-xl text-ink">
                    {competition.similarActiveNearby}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </Panel>

        {/* Houzzat Estimated Value — above price timeline */}
        <Panel>
          <PanelTitle
            eyebrow="Houzzat Estimated Value"
            title="What this home looks worth today"
            hint="Value is just an estimate using AI technology, not an appraisal."
          />
          {valuation.restricted ? (
            <InsightGate
              className="min-h-[200px]"
              title="See Houzzat Estimated Value"
              body="Register as a Houzzat client to unlock the low–mid–high estimate built from nearby solds and actives (VOW)."
              callbackPath={callbackPath}
            >
              <div className="flex h-40 flex-col items-center justify-end gap-3 px-6 pb-5">
                <p className="font-display text-3xl text-canopy/40">$—,———,———</p>
                <div className="flex w-full max-w-md items-end justify-center gap-4">
                  <div className="h-14 flex-1 rounded-t-lg bg-canopy/15" />
                  <div className="h-28 flex-1 rounded-t-lg bg-canopy/30" />
                  <div className="h-20 flex-1 rounded-t-lg bg-canopy/20" />
                </div>
              </div>
            </InsightGate>
          ) : valuation.mid == null ? (
            <p className="text-sm text-ink/55">
              Not enough comparable inventory yet to generate an estimate for
              this home.
            </p>
          ) : (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                    Estimated value
                  </p>
                  <p className="font-display text-4xl text-canopy sm:text-5xl">
                    <ResponsivePrice amount={valuation.mid} />
                  </p>
                  {valuation.vsListPct != null ? (
                    <p className="mt-1 text-sm text-ink/55">
                      List price is{" "}
                      <span className="font-semibold text-ink">
                        {valuation.vsListPct > 0 ? "+" : ""}
                        {valuation.vsListPct}%
                      </span>{" "}
                      vs this estimate
                    </p>
                  ) : null}
                </div>
                <p className="max-w-xs text-right text-sm text-ink/55">
                  From {valuation.sampleSize} comps
                  {valuation.soldCount > 0
                    ? ` · ${valuation.soldCount} sold`
                    : ""}
                  {valuation.method
                    ? ` · ${valuation.method.replace(/_/g, " ")}`
                    : ""}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-line bg-mist/50 px-3 py-3">
                  <p className="text-[11px] text-ink/45">Low</p>
                  <p className="font-display text-xl text-ink">
                    {valuation.low != null ? (
                      <ResponsivePrice amount={valuation.low} />
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-canopy/30 bg-canopy/5 px-3 py-3">
                  <p className="text-[11px] text-canopy">Mid</p>
                  <p className="font-display text-xl text-canopy">
                    <ResponsivePrice amount={valuation.mid} />
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-mist/50 px-3 py-3">
                  <p className="text-[11px] text-ink/45">High</p>
                  <p className="font-display text-xl text-ink">
                    {valuation.high != null ? (
                      <ResponsivePrice amount={valuation.high} />
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
              </div>
              {valuation.communityAvgSold != null ? (
                <p className="mt-3 text-xs text-ink/50">
                  Area avg recent sold:{" "}
                  <span className="font-semibold text-ink">
                    {formatPrice(valuation.communityAvgSold)}
                  </span>
                </p>
              ) : null}
              <p className="mt-3 text-[11px] text-ink/45">{valuation.disclaimer}</p>
            </div>
          )}
        </Panel>

        {/* Price position + timeline */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <PanelTitle
              eyebrow="Price position"
              title="Where this ask sits"
              hint="Compared with active listings in this area."
            />
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <p className="font-display text-3xl text-ink">
                {formatPrice(pricePosition.listPrice)}
              </p>
              <DeltaChip value={pricePosition.vsAskPct} />
            </div>
            <PricePositionBar
              listPrice={pricePosition.listPrice}
              medianAsk={pricePosition.medianAsk}
              medianSold={pricePosition.medianSold}
            />
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-mist/70 px-3 py-2.5">
                <dt className="text-ink/45">Median ask</dt>
                <dd className="font-semibold text-ink">
                  {pricePosition.medianAsk != null
                    ? formatPrice(pricePosition.medianAsk)
                    : "—"}
                </dd>
              </div>
              <div className="rounded-xl bg-mist/70 px-3 py-2.5">
                <dt className="text-ink/45">Median sold</dt>
                <dd className="font-semibold text-ink">
                  {pricePosition.soldRestricted ? (
                    <span className="text-sm font-medium text-ink/40">
                      Clients only
                    </span>
                  ) : pricePosition.medianSold != null ? (
                    formatPrice(pricePosition.medianSold)
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            {pricePosition.soldRestricted ? (
              <p className="mt-3 text-xs text-ink/50">
                <AuthOpenButton
                  mode="sign-in"
                  callbackUrl={callbackPath}
                  className="font-semibold text-canopy hover:underline"
                >
                  Sign in
                </AuthOpenButton>{" "}
                to unlock sold medians under VOW client access.
              </p>
            ) : pricePosition.vsSoldPct != null ? (
              <p className="mt-3 text-xs text-ink/55">
                This ask is{" "}
                <span className="font-semibold text-ink">
                  {pricePosition.vsSoldPct > 0 ? "+" : ""}
                  {pricePosition.vsSoldPct}%
                </span>{" "}
                vs recent median sold
                {pulse.soldOverAskingPct != null
                  ? ` · ${pulse.soldOverAskingPct}% of solds ≥ ask`
                  : ""}
                .
              </p>
            ) : null}
          </Panel>

          <Panel>
            <PanelTitle
              eyebrow="Price timeline"
              title="How the price moved"
              hint="List updates from this listing’s history."
            />
            <PriceTimelineChart points={timeline} signedIn={signedIn} />
            {!signedIn ? (
              <p className="mt-3 text-xs text-ink/50">
                Closed prices stay private for guests.{" "}
                <AuthOpenButton
                  mode="sign-up"
                  callbackUrl={callbackPath}
                  className="font-semibold text-canopy hover:underline"
                >
                  Register
                </AuthOpenButton>{" "}
                to see full sold/leased points.
              </p>
            ) : null}
          </Panel>
        </div>

        {/* Sold comps */}
        <Panel id="insights-comps">
          <PanelTitle
            eyebrow="Nearby solds"
            title="Comparable homes that sold"
            hint={`Recent solds · similar beds · ${placeLabel}`}
          />
          {comps.restricted ? (
            <InsightGate
              className="min-h-[220px]"
              title="Sold comps for registered clients"
              body={VOW_PUBLIC_NOTE}
              callbackPath={callbackPath}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl border border-line bg-mist/80"
                  />
                ))}
              </div>
            </InsightGate>
          ) : comps.items.length === 0 ? (
            <p className="text-sm text-ink/55">
              No close sold comps in inventory yet for this profile.
            </p>
          ) : (
            <>
              {comps.rangeLow != null && comps.rangeHigh != null ? (
                <p className="mb-4 text-sm text-ink/65">
                  Sold range{" "}
                  <span className="font-semibold text-ink">
                    {formatPrice(comps.rangeLow)} – {formatPrice(comps.rangeHigh)}
                  </span>
                  {comps.rangeMid != null ? (
                    <>
                      {" "}
                      · median{" "}
                      <span className="font-semibold text-ink">
                        {formatPrice(comps.rangeMid)}
                      </span>
                    </>
                  ) : null}
                </p>
              ) : null}
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {comps.items.map((c) => (
                  <li key={c.mlsNumber}>
                    <Link
                      href={`/listing/${c.mlsNumber}`}
                      className="block h-full rounded-xl border border-line bg-mist/40 p-3.5 transition hover:border-canopy/35 hover:bg-surface"
                    >
                      <p className="truncate text-sm font-semibold text-ink">
                        {c.addressLine}
                      </p>
                      <p className="mt-1 font-display text-xl text-canopy">
                        {c.soldPrice != null ? formatPrice(c.soldPrice) : "—"}
                      </p>
                      <p className="mt-1 text-xs text-ink/50">
                        {c.beds} bd · {c.baths} ba · {c.distanceKm} km
                        {c.pricePerSqft != null
                          ? ` · $${c.pricePerSqft.toLocaleString("en-CA")}/sqft`
                          : ""}
                        {c.daysOnMarket ? ` · ${c.daysOnMarket} DOM` : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {/* Ownership + lifestyle */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <PanelTitle
              eyebrow="Cost of ownership"
              title="Illustrative monthly carry"
              hint={`Assumes ${formatPrice(ownership.downPaymentExample)} down (20%), ${ownership.ratePct}% / ${ownership.amortYears} yr.`}
            />
            <p className="font-display text-3xl text-ink">
              {formatPrice(ownership.estimatedTotalMonthly)}
              <span className="ml-1 text-base font-sans font-medium text-ink/45">
                /mo
              </span>
            </p>
            <OwnershipDonut
              className="mt-4"
              mortgage={ownership.estimatedMortgageMonthly}
              tax={taxMonthly}
              maint={maint}
            />
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-mist/70 px-2 py-2">
                <dt className="text-ink/45">Mortgage</dt>
                <dd className="font-semibold text-ink">
                  {formatPrice(ownership.estimatedMortgageMonthly)}
                </dd>
              </div>
              <div className="rounded-lg bg-mist/70 px-2 py-2">
                <dt className="text-ink/45">Tax</dt>
                <dd className="font-semibold text-ink">
                  {taxMonthly > 0 ? formatPrice(taxMonthly) : "—"}
                </dd>
              </div>
              <div className="rounded-lg bg-mist/70 px-2 py-2">
                <dt className="text-ink/45">Maint.</dt>
                <dd className="font-semibold text-ink">
                  {maint > 0 ? formatPrice(maint) : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-ink/45">
              Not a pre-approval. Rates, stress tests, and condo budgets change —
              confirm with a mortgage professional.
            </p>
          </Panel>

          <Panel>
            <PanelTitle
              eyebrow="Lifestyle"
              title="What’s around the pin"
              hint={lifestyle.summary}
            />
            <div className="mb-4 flex items-baseline gap-2">
              <span className="font-display text-3xl text-canopy">
                {lifestyle.score}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                convenience score
              </span>
            </div>
            <LifestyleBars categories={lifestyle.categories} />
          </Panel>
        </div>

        {/* Space + competition + timing */}
        <div className="grid gap-5 lg:grid-cols-3">
          <Panel>
            <PanelTitle eyebrow="Space" title="How the home is laid out" />
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5 text-xs font-semibold text-ink">
                <Home className="size-3.5 text-canopy" aria-hidden />
                {space.beds} beds · {space.baths} baths
              </span>
              {space.sqft ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5 text-xs font-semibold text-ink">
                  <Ruler className="size-3.5 text-canopy" aria-hidden />
                  {space.sqft.toLocaleString("en-CA")} sqft
                </span>
              ) : null}
            </div>
            {space.highlights.length ? (
              <ul className="mt-4 space-y-2 text-sm text-ink/70">
                {space.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-canopy" />
                    {h}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink/50">
                Room-level details appear when the listing sheet includes them.
              </p>
            )}
          </Panel>

          <Panel>
            <PanelTitle eyebrow="Competition" title="Similar homes nearby" />
            <p className="font-display text-4xl text-ink">
              {competition.similarActiveNearby}
            </p>
            <p className="mt-1 text-sm text-ink/55">
              Active listings within {competition.radiusKm} km in a similar
              price band (
              {formatPrice(competition.priceBandLow)}–
              {formatPrice(competition.priceBandHigh)}).
            </p>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-mist/70 px-3 py-2.5 text-xs text-ink/60">
              <Users className="mt-0.5 size-3.5 shrink-0 text-canopy" aria-hidden />
              <span>
                This home: {competition.thisDom} days on market
                {competition.avgDomArea != null
                  ? ` · area avg ${competition.avgDomArea}`
                  : ""}
                {competition.domDelta != null
                  ? competition.domDelta > 5
                    ? " — longer than typical."
                    : competition.domDelta < -5
                      ? " — fresher than typical."
                      : " — near typical."
                  : "."}
              </span>
            </div>
          </Panel>

          <Panel>
            <PanelTitle eyebrow="Timing" title="Possession & showings" />
            <ul className="space-y-3 text-sm">
              <li className="flex gap-2">
                <CalendarDays
                  className="mt-0.5 size-4 shrink-0 text-canopy"
                  aria-hidden
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                    Listed
                  </p>
                  <p className="font-medium text-ink">
                    {timing.listedLabel ?? "—"} · {timing.daysOnMarket} days
                  </p>
                </div>
              </li>
              <li className="flex gap-2">
                <MapPin
                  className="mt-0.5 size-4 shrink-0 text-canopy"
                  aria-hidden
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                    Possession
                  </p>
                  <p className="font-medium text-ink">
                    {timing.possessionLabel ?? "See listing remarks"}
                  </p>
                </div>
              </li>
              <li className="flex gap-2">
                <Home
                  className="mt-0.5 size-4 shrink-0 text-canopy"
                  aria-hidden
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                    Next open house
                  </p>
                  <p className="font-medium text-ink">
                    {timing.nextOpenHouse ?? "None scheduled"}
                  </p>
                </div>
              </li>
            </ul>
          </Panel>
        </div>

        <p className="text-center text-[11px] leading-relaxed text-ink/40">
          Insights use Houzzat’s listing inventory and public map amenities.
          Board rules restrict sold/leased detail to registered clients.
        </p>
      </div>
    </section>
  );
}
