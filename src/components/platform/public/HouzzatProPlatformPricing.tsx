import Link from "next/link";
import {
  PLATFORM_PAGE_PRIMARY_CTA_HREF,
  PLATFORM_PAGE_PRIMARY_CTA_LABEL,
  PLATFORM_PAGE_SECONDARY_CTA_HREF,
  PLATFORM_PAGE_SECONDARY_CTA_LABEL,
  PLATFORM_PRICING_BODY,
  PLATFORM_PRICING_EYEBROW,
  PLATFORM_PRICING_LEAD,
  PLATFORM_PRICING_POINTS,
  PLATFORM_PRICING_TITLE,
} from "@/lib/platform/public/platform-pricing-templates-copy";

/** Thin HouzzatPRO /pricing page — private proposal, no public dollar amounts. */
export function HouzzatProPlatformPricing() {
  return (
    <div className="bg-[#f7f8f7] text-slate-900">
      <section className="relative overflow-hidden bg-[#07111f] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.16),_transparent_42%)]"
        />
        <div className="relative mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-300/90 uppercase">
            {PLATFORM_PRICING_EYEBROW}
          </p>
          <h1 className="mt-4 font-display text-[2.15rem] leading-[1.08] font-semibold tracking-tight sm:text-5xl">
            {PLATFORM_PRICING_TITLE}
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-300 sm:text-base">
            {PLATFORM_PRICING_LEAD}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={PLATFORM_PAGE_PRIMARY_CTA_HREF}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
            >
              {PLATFORM_PAGE_PRIMARY_CTA_LABEL}
            </Link>
            <a
              href={PLATFORM_PAGE_SECONDARY_CTA_HREF}
              className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              {PLATFORM_PAGE_SECONDARY_CTA_LABEL}
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
          {PLATFORM_PRICING_BODY}
        </p>
        <ul className="mt-8 space-y-3">
          {PLATFORM_PRICING_POINTS.map((point) => (
            <li
              key={point}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
            >
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <p className="text-base font-semibold text-slate-900">
            Request a private proposal
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Book a demo and our team will prepare pricing that matches your
            setup and business needs.
          </p>
          <Link
            href={PLATFORM_PAGE_PRIMARY_CTA_HREF}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            {PLATFORM_PAGE_PRIMARY_CTA_LABEL}
          </Link>
        </div>
      </section>
    </div>
  );
}
