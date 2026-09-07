import Link from "next/link";
import type { TeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";

/**
 * Stage 6.11E.2A — team-brand-first hero (logo-ready; no agent portrait).
 */
export function TeamSignatureHero({ view }: { view: TeamSignatureView }) {
  return (
    <section
      id="home-hero"
      className="relative min-h-[min(76vh,40rem)] overflow-hidden bg-[var(--ts-ink-deep,#0A4D38)] text-surface"
      aria-labelledby="ts-hero-heading"
      data-ts-section="hero"
    >
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/hero-canadian-homes.jpg"
          alt=""
          className="h-full w-full object-cover object-[center_35%] opacity-50"
          fetchPriority="high"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--ts-ink-deep,#0A4D38)] via-[var(--ts-ink-deep,#0A4D38)]/88 to-[var(--ts-ink-deep,#0A4D38)]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-ink-deep,#0A4D38)] via-transparent to-[var(--ts-ink-deep,#0A4D38)]/40" />
      </div>

      <div className="relative mx-auto flex min-h-[min(76vh,40rem)] max-w-7xl flex-col justify-end px-4 pb-10 pt-14 sm:px-6 sm:pb-14 lg:px-10 lg:pb-16">
        <div className="max-w-3xl space-y-4 sm:space-y-5">
          {view.logoUrl ? (
            <div className="inline-flex bg-surface/10 px-4 py-3 backdrop-blur-[2px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={view.logoUrl}
                alt=""
                className="h-14 w-auto max-w-[16rem] object-contain object-left sm:h-16 sm:max-w-[18rem]"
                data-ts-hero-logo="true"
              />
            </div>
          ) : (
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-surface/80">
              Real Estate Team
            </p>
          )}
          <h1
            id="ts-hero-heading"
            className="font-display text-[2.6rem] leading-[0.94] tracking-tight sm:text-5xl lg:text-[4rem]"
          >
            {view.teamName}
          </h1>
          <p className="max-w-xl text-base font-medium leading-relaxed text-surface/90 sm:text-lg">
            {view.tagline}
          </p>
          {view.serviceArea ? (
            <p className="text-sm uppercase tracking-[0.14em] text-surface/75">
              Serving {view.serviceArea}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/search?transactionType=SALE"
              className="inline-flex min-w-[10rem] items-center justify-center bg-surface px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ts-ink-deep,#0A4D38)] transition hover:bg-white"
            >
              Search Homes
            </Link>
            <Link
              href="/home-valuation"
              className="inline-flex min-w-[10rem] items-center justify-center border border-surface/45 px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-surface transition hover:bg-surface/10"
            >
              What&apos;s My Home Worth
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
