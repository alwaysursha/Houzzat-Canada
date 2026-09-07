import Link from "next/link";
import { HomeHeroSearch } from "@/components/home/HomeHeroSearch";

/**
 * Stage 6.11E.2A — compact search band integrated under the hero.
 */
export function TeamSignatureSearchSection() {
  return (
    <section
      className="relative z-20 border-b border-[var(--ts-ink,#0F6B4C)]/15 bg-[var(--ts-ink-deep,#0A4D38)] px-4 py-5 text-surface sm:px-6 sm:py-6 lg:px-10"
      data-ts-section="search"
      aria-labelledby="ts-search-heading"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="min-w-0 shrink-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2
                id="ts-search-heading"
                className="font-display text-xl tracking-tight sm:text-2xl"
              >
                Search the market
              </h2>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-surface/75">
                Property search
              </p>
            </div>
            <nav
              className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5"
              aria-label="Search destinations"
            >
              {[
                { href: "/search?transactionType=SALE", label: "Buy" },
                { href: "/search?transactionType=LEASE", label: "Rent" },
                { href: "/search?segment=COMMERCIAL", label: "Commercial" },
                { href: "/search?status=SOLD", label: "Sold" },
              ].map((chip) => (
                <Link
                  key={chip.href}
                  href={chip.href}
                  className="border-b border-transparent pb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-surface/85 transition hover:border-surface/70 hover:text-surface"
                >
                  {chip.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="w-full max-w-3xl lg:ml-auto [&_label]:text-surface/80 [&_input]:border-surface/20 [&_input]:bg-surface/95 [&_input]:text-ink">
            <HomeHeroSearch surface="team" />
          </div>
        </div>
      </div>
    </section>
  );
}
