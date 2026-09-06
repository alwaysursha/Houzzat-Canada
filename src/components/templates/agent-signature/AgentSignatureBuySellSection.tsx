import Link from "next/link";
import type { AgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";

/**
 * Stage 6.11B.5 — Buy/Sell with genuinely distinct platform-owned atmospheres.
 */
export function AgentSignatureBuySellSection({
  view,
}: {
  view: AgentSignatureView;
}) {
  return (
    <section className="grid lg:grid-cols-2" data-as-section="buy-sell">
      <Link
        href="/search?transactionType=SALE"
        className="group relative min-h-[20rem] overflow-hidden bg-ink text-surface lg:min-h-[24rem]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/agent-signature-buy-neighbourhood.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-60 transition duration-700 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canopy-deep via-canopy-deep/45 to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-8 sm:p-10 lg:p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-surface/50">
            Buying
          </p>
          <h2 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
            Buy with {view.firstName}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-surface/70">
            Clear guidance through search, offers, and every decision that
            follows.
          </p>
          <span className="mt-6 inline-flex text-xs font-semibold uppercase tracking-[0.16em]">
            Search homes →
          </span>
        </div>
      </Link>

      <Link
        href="/home-valuation"
        className="group relative min-h-[20rem] overflow-hidden bg-canopy-deep text-surface lg:min-h-[24rem]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/agent-signature-sell-architecture.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-55 transition duration-700 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canopy-deep via-canopy-deep/55 to-canopy-deep/20" />
        <div className="relative flex h-full flex-col justify-end p-8 sm:p-10 lg:p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-surface/50">
            Selling
          </p>
          <h2 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
            Sell with {view.firstName}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-surface/70">
            Understand value before you list — then launch with a clear plan.
          </p>
          <span className="mt-6 inline-flex text-xs font-semibold uppercase tracking-[0.16em]">
            Get a valuation →
          </span>
        </div>
      </Link>
    </section>
  );
}
