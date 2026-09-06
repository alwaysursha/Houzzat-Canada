import Link from "next/link";

/**
 * Stage 6.11B.3 — major seller lead section (existing valuation flow).
 */
export function AgentSignatureValuationSection() {
  return (
    <section
      className="relative overflow-hidden bg-canopy-deep text-surface"
      data-as-section="valuation"
      aria-labelledby="as-valuation-heading"
    >
      <div className="grid lg:grid-cols-2">
        <div className="relative min-h-[18rem] lg:min-h-[26rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/hero-canadian-homes.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-canopy-deep/40 lg:to-canopy-deep/80" />
        </div>
        <div className="relative flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-surface/45">
            Home valuation
          </p>
          <h2
            id="as-valuation-heading"
            className="mt-3 font-display text-4xl tracking-tight sm:text-5xl"
          >
            What&apos;s Your Home Worth?
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-surface/70">
            Discover your property&apos;s potential value — a private starting
            point before you list.
          </p>
          <Link
            href="/home-valuation"
            className="mt-8 inline-flex w-fit bg-surface px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-canopy-deep transition hover:bg-white"
          >
            Enter Your Address
          </Link>
        </div>
      </div>
    </section>
  );
}
