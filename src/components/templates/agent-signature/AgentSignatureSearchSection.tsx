import Link from "next/link";
import { HomeHeroSearch } from "@/components/home/HomeHeroSearch";

/**
 * Stage 6.11B.5 — balanced Agent Signature search composition.
 * Full-width search control; destination nav sits with the heading rhythm.
 */
export function AgentSignatureSearchSection() {
  return (
    <section
      className="relative z-20 border-b border-ink/10 bg-mist px-4 py-6 sm:px-6 lg:px-10 lg:py-8"
      data-as-section="search"
      aria-labelledby="as-search-heading"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="min-w-0 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/40">
              Property search
            </p>
            <h2
              id="as-search-heading"
              className="mt-1 font-display text-xl tracking-tight text-ink sm:text-2xl"
            >
              Find Your Next Home
            </h2>
          </div>
          <nav
            className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:justify-end"
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
                className="border-b border-transparent pb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55 transition hover:border-ink/40 hover:text-ink"
              >
                {chip.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-5 w-full">
          <HomeHeroSearch surface="agent" />
        </div>
      </div>
    </section>
  );
}
