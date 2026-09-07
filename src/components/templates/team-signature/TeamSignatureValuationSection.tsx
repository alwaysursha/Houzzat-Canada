import Link from "next/link";

/**
 * Stage 6.11E.2 — major team-branded valuation CTA.
 */
export function TeamSignatureValuationSection() {
  return (
    <section
      className="relative overflow-hidden bg-[var(--ts-ink-deep,#0A4D38)] text-surface"
      data-ts-section="valuation"
      aria-labelledby="ts-valuation-heading"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/hero-canadian-homes.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-35"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[var(--ts-ink-deep,#0A4D38)]/80" />
      <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:py-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-surface/75">
          Home valuation
        </p>
        <h2
          id="ts-valuation-heading"
          className="mt-4 font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl"
        >
          What&apos;s your home worth?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-surface/85">
          A private starting point from our team — understand value before you
          list.
        </p>
        <Link
          href="/home-valuation"
          className="mt-8 inline-flex bg-surface px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ts-ink-deep,#0A4D38)] transition hover:bg-white"
        >
          Enter Your Address
        </Link>
      </div>
    </section>
  );
}
