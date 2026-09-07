import Link from "next/link";
import type { TeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";

/**
 * Stage 6.11E.2 — team-oriented Buy/Sell (stacked architectural bands).
 */
export function TeamSignatureBuySellSection({
  view,
}: {
  view: TeamSignatureView;
}) {
  return (
    <section className="space-y-0" data-ts-section="buy-sell">
      <Link
        href="/search?transactionType=SALE"
        className="group relative flex min-h-[18rem] overflow-hidden bg-[var(--ts-ink,#0F6B4C)] text-surface sm:min-h-[20rem] lg:min-h-[22rem]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/agent-signature-buy-atmosphere.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-55 transition duration-700 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--ts-ink-deep,#0A4D38)] via-[var(--ts-ink-deep,#0A4D38)]/70 to-transparent" />
        <div className="relative flex w-full max-w-7xl flex-col justify-end px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-surface/75">
            Buying with the team
          </p>
          <h2 className="mt-2 max-w-xl font-display text-3xl tracking-tight sm:text-4xl">
            Find the right home — with a full desk behind you
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-surface/85">
            {view.teamName} helps buyers move with clarity across search,
            offers, and closing.
          </p>
          <span className="mt-6 inline-flex text-xs font-semibold uppercase tracking-[0.16em]">
            Search homes →
          </span>
        </div>
      </Link>

      <Link
        href="/home-valuation"
        className="group relative flex min-h-[18rem] overflow-hidden bg-[var(--ts-ink-deep,#0A4D38)] text-surface sm:min-h-[20rem] lg:min-h-[22rem]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/agent-signature-sell-atmosphere.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_40%] opacity-50 transition duration-700 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-[var(--ts-ink-deep,#0A4D38)] via-[var(--ts-ink-deep,#0A4D38)]/75 to-transparent" />
        <div className="relative ml-auto flex w-full max-w-7xl flex-col items-start justify-end px-4 py-10 text-left sm:items-end sm:px-6 sm:text-right lg:px-10 lg:py-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-surface/75">
            Selling with the team
          </p>
          <h2 className="mt-2 max-w-xl font-display text-3xl tracking-tight sm:text-4xl">
            Launch with a clear plan
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-surface/85">
            Understand value first, then go to market with coordinated team
            support.
          </p>
          <span className="mt-6 inline-flex text-xs font-semibold uppercase tracking-[0.16em]">
            Get a valuation →
          </span>
        </div>
      </Link>
    </section>
  );
}
