import Link from "next/link";
import { BarChart3 } from "lucide-react";

export function PropertyHomeValuationCta({ href }: { href: string }) {
  return (
    <section
      className="relative mt-8 overflow-hidden rounded-2xl border border-canopy/25 bg-gradient-to-br from-canopy/10 via-surface to-mist px-5 py-7 sm:px-8 sm:py-8"
      aria-labelledby="property-valuation-heading"
    >
      <div
        className="pointer-events-none absolute -right-10 top-0 h-40 w-40 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--tenant-primary-rgb) / 0.22), transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl space-y-2">
          <div className="inline-flex size-10 items-center justify-center rounded-full bg-canopy/15 text-canopy">
            <BarChart3 className="size-5" aria-hidden />
          </div>
          <h2
            id="property-valuation-heading"
            className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl"
          >
            Discover Your Home&apos;s Estimated Value
          </h2>
          <p className="text-sm leading-relaxed text-ink/65 sm:text-base">
            Find out what your property could be worth using comparable market
            data and your home&apos;s unique features.
          </p>
        </div>
        <Link
          href={href}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-lg bg-canopy px-6 text-sm font-semibold text-white transition hover:bg-canopy-deep"
        >
          Get My Home Estimate
        </Link>
      </div>
    </section>
  );
}
