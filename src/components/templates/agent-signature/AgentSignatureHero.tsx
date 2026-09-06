import Link from "next/link";
import type { AgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";

/**
 * Stage 6.11B.4 — integrated agent-first hero (slightly shorter, softer portrait blend).
 */
export function AgentSignatureHero({ view }: { view: AgentSignatureView }) {
  const initial = view.name.trim().charAt(0).toUpperCase() || "A";

  return (
    <section
      id="home-hero"
      className="relative overflow-hidden bg-canopy-deep text-surface"
      aria-labelledby="as-hero-heading"
      data-as-section="hero"
    >
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/hero-canadian-homes.jpg"
          alt=""
          className="h-full w-full scale-[1.03] object-cover opacity-45"
          fetchPriority="high"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-canopy-deep via-canopy-deep/85 to-canopy-deep/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-canopy-deep via-transparent to-canopy-deep/45" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-10 lg:pt-10">
        <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-0">
          <div className="relative z-10 order-2 space-y-4 pb-8 lg:order-1 lg:pb-12 lg:pr-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-surface/55">
              {[view.title, view.serviceArea].filter(Boolean).join(" · ") ||
                "Real Estate Professional"}
            </p>
            <h1
              id="as-hero-heading"
              className="font-display text-[2.5rem] leading-[0.96] tracking-tight sm:text-5xl lg:text-[3.75rem]"
            >
              {view.name}
            </h1>
            <p className="max-w-lg text-base font-medium leading-snug text-surface/85 sm:text-lg">
              {view.tagline}
            </p>
            {view.brokerageName ? (
              <p className="text-sm text-surface/50">{view.brokerageName}</p>
            ) : null}
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/search?transactionType=SALE"
                className="inline-flex min-w-[9.5rem] items-center justify-center bg-surface px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-canopy-deep transition hover:bg-white"
              >
                Find a Home
              </Link>
              <Link
                href="/home-valuation"
                className="inline-flex min-w-[9.5rem] items-center justify-center border border-surface/45 px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-surface transition hover:bg-surface/10"
              >
                Sell Your Home
              </Link>
            </div>
          </div>

          <div className="relative order-1 lg:order-2 lg:-mb-10">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-[16rem] overflow-hidden bg-ink sm:max-w-sm lg:ml-auto lg:max-w-md">
              {view.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={view.photoUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-top"
                  fetchPriority="high"
                  decoding="async"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-ink">
                  <span className="font-display text-7xl text-surface/20">
                    {initial}
                  </span>
                </div>
              )}
              {/* Soft dissolve into atmosphere — no hard card shadow */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-canopy-deep/70 via-canopy-deep/25 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-canopy-deep via-canopy-deep/40 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-canopy-deep/35 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
