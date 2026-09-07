import Link from "next/link";
import type { TeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";
import { cn } from "@/lib/utils";

/**
 * Stage 6.11E.2A — territory market entry (no invented statistics).
 */
export function TeamSignatureMarketInsights({
  view,
}: {
  view: TeamSignatureView;
}) {
  const highlights =
    view.markets.length > 0
      ? view.markets.slice(0, 3).map((area) => ({
          href: `/search?cities=${encodeURIComponent(area)}`,
          title: area,
          body: `Explore active homes and local context in ${area}.`,
        }))
      : [
          {
            href: "/search?transactionType=SALE",
            title: "Active inventory",
            body: "Browse homes currently on the market.",
          },
          {
            href: "/areas",
            title: "Communities",
            body: "Explore neighbourhoods with local context.",
          },
          {
            href: "/search",
            title: "Full market search",
            body: "Maps, filters, and professional listing tools.",
          },
        ];

  return (
    <section
      className="relative overflow-hidden bg-[var(--ts-ink-deep,#0A4D38)] px-4 py-14 text-surface sm:px-6 lg:px-10 lg:py-20"
      data-ts-section="market-insights"
      aria-labelledby="ts-market-heading"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/hero-canadian-homes.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-25"
      />
      <div className="absolute inset-0 bg-[var(--ts-ink-deep,#0A4D38)]/85" />

      <div className="relative mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-surface/75">
            Market insights
          </p>
          <h2
            id="ts-market-heading"
            className="mt-3 font-display text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          >
            Territory knowledge, ready when you are
          </h2>
          <p className="mt-4 text-base leading-relaxed text-surface/85">
            Start with a market our team knows — or open the full search when
            you&apos;re ready.
          </p>
        </div>

        <ul className="mt-10 grid gap-0 border-t border-surface/20 sm:grid-cols-3 sm:divide-x sm:divide-surface/20">
          {highlights.map((item, index) => (
            <li key={item.href + item.title}>
              <Link
                href={item.href}
                className={cn(
                  "group flex h-full flex-col border-b border-surface/20 px-0 py-7 transition sm:border-b-0 sm:px-6 sm:py-8 lg:px-8",
                  index === 0 ? "sm:pl-0" : null,
                  index === highlights.length - 1 ? "sm:pr-0" : null,
                )}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-surface/70">
                  0{index + 1}
                </span>
                <p className="mt-3 font-display text-2xl tracking-tight text-surface transition group-hover:text-surface/90 sm:text-3xl">
                  {item.title}
                </p>
                <p className="mt-2 flex-1 text-sm text-surface/80">{item.body}</p>
                <span className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-surface/75 transition group-hover:text-surface">
                  Explore →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
