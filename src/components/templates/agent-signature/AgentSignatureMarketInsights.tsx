import Link from "next/link";
import type { AgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";
import { cn } from "@/lib/utils";

/**
 * Stage 6.11B.4 — editorial market entry points (no invented statistics).
 */
export function AgentSignatureMarketInsights({
  view,
}: {
  view: AgentSignatureView;
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
      className="bg-surface px-4 py-16 sm:px-6 lg:px-10 lg:py-24"
      data-as-section="market-insights"
      aria-labelledby="as-market-heading"
    >
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-20">
        <div className="lg:sticky lg:top-28">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">
            Market insights
          </p>
          <h2
            id="as-market-heading"
            className="mt-4 font-display text-3xl tracking-tight text-ink sm:text-5xl"
          >
            Know the market you&apos;re entering
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/60">
            Local guidance from {view.firstName} — start with a community or
            open the full market when you&apos;re ready.
          </p>
          <Link
            href="/areas"
            className="mt-8 inline-flex text-xs font-semibold uppercase tracking-[0.14em] text-ink underline-offset-4 hover:underline"
          >
            Explore market insights →
          </Link>
        </div>

        <ul className="mt-12 space-y-0 divide-y divide-ink/10 border-y border-ink/10 lg:mt-2">
          {highlights.map((item, index) => (
            <li key={item.href + item.title}>
              <Link
                href={item.href}
                className="group flex items-start justify-between gap-6 py-6 transition sm:py-7"
              >
                <div>
                  <p
                    className={cn(
                      "font-display text-ink transition group-hover:text-canopy",
                      index === 0
                        ? "text-2xl sm:text-3xl"
                        : "text-xl",
                    )}
                  >
                    {item.title}
                  </p>
                  <p className="mt-1.5 text-sm text-ink/50">{item.body}</p>
                </div>
                <span className="shrink-0 pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink/30 transition group-hover:text-ink">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
