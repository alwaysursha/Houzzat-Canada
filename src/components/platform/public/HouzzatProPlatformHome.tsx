import Link from "next/link";
import { BookDemoProductVisual } from "@/components/platform/public/BookDemoProductVisual";
import {
  PLATFORM_HOME_FAQS,
  PLATFORM_HOME_FEATURES,
  PLATFORM_HOME_FINAL_CTA_BODY,
  PLATFORM_HOME_FINAL_CTA_TITLE,
  PLATFORM_HOME_HERO_EYEBROW,
  PLATFORM_HOME_HERO_LEAD,
  PLATFORM_HOME_HERO_TITLE,
  PLATFORM_HOME_HOW_IT_WORKS,
  PLATFORM_HOME_PRICING_BODY,
  PLATFORM_HOME_PRICING_CTA_LABEL,
  PLATFORM_HOME_PRICING_TITLE,
  PLATFORM_HOME_PRIMARY_CTA_HREF,
  PLATFORM_HOME_PRIMARY_CTA_LABEL,
  PLATFORM_HOME_SECONDARY_CTA_HREF,
  PLATFORM_HOME_SECONDARY_CTA_LABEL,
  PLATFORM_HOME_TEMPLATES,
} from "@/lib/platform/public/platform-home-copy";

/**
 * V1 minimum HouzzatPRO sales homepage (houzzatpro.com / www only).
 * Visual language aligned with Book a Demo — no tenant chrome.
 */
export function HouzzatProPlatformHome() {
  return (
    <div className="bg-[#f7f8f7] text-slate-900">
      {/* HERO */}
      <section className="relative overflow-hidden bg-[#07111f] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.16),_transparent_42%),radial-gradient(ellipse_at_bottom_right,_rgba(15,23,42,0.9),_transparent_55%)]"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-8 lg:py-20">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-300/90 uppercase">
              {PLATFORM_HOME_HERO_EYEBROW}
            </p>
            <h1 className="mt-4 font-display text-[2.15rem] leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-[3.1rem] lg:leading-[1.05]">
              {PLATFORM_HOME_HERO_TITLE}
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300 sm:text-base">
              {PLATFORM_HOME_HERO_LEAD}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={PLATFORM_HOME_PRIMARY_CTA_HREF}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-400"
              >
                {PLATFORM_HOME_PRIMARY_CTA_LABEL}
              </Link>
              <a
                href={PLATFORM_HOME_SECONDARY_CTA_HREF}
                className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {PLATFORM_HOME_SECONDARY_CTA_LABEL}
              </a>
            </div>
          </div>
          <div className="min-w-0">
            <BookDemoProductVisual />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="scroll-mt-24 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Built for how real estate businesses actually run
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Core capabilities available in HouzzatPRO today — website presence,
            property experience, leads, and workspace operations.
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_HOME_FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
              >
                <p className="text-[11px] font-semibold tracking-[0.14em] text-emerald-700 uppercase">
                  {feature.group}
                </p>
                <p className="mt-2 text-base font-medium text-slate-900">
                  {feature.title}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* TEMPLATES */}
      <section
        id="templates"
        className="scroll-mt-24 border-y border-slate-200 bg-white px-4 py-14 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Website templates
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Choose a professional presentation for your brokerage or personal
            brand. Only commercially ready options are offered at launch.
          </p>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {PLATFORM_HOME_TEMPLATES.map((template) => (
              <li
                key={template.name}
                className="rounded-2xl border border-slate-200 bg-[#f7f8f7] p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">
                    {template.name}
                  </h3>
                  {template.status === "coming_soon" ? (
                    <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">
                      Coming soon
                    </span>
                  ) : (
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">
                      Available
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {template.blurb}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {PLATFORM_HOME_HOW_IT_WORKS.map((item) => (
              <li key={item.step} className="relative">
                <p className="font-display text-3xl font-semibold text-emerald-600/90">
                  {item.step}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* PRICING */}
      <section
        id="pricing"
        className="scroll-mt-24 border-y border-slate-200 bg-[#07111f] px-4 py-14 text-white sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {PLATFORM_HOME_PRICING_TITLE}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
            {PLATFORM_HOME_PRICING_BODY}
          </p>
          <Link
            href={PLATFORM_HOME_PRIMARY_CTA_HREF}
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
          >
            {PLATFORM_HOME_PRICING_CTA_LABEL}
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            FAQ
          </h2>
          <dl className="mt-8 space-y-5">
            {PLATFORM_HOME_FAQS.map((faq) => (
              <div
                key={faq.question}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <dt className="text-base font-semibold text-slate-900">
                  {faq.question}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-600">
                  {faq.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-slate-200 bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {PLATFORM_HOME_FINAL_CTA_TITLE}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            {PLATFORM_HOME_FINAL_CTA_BODY}
          </p>
          <Link
            href={PLATFORM_HOME_PRIMARY_CTA_HREF}
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            {PLATFORM_HOME_PRIMARY_CTA_LABEL}
          </Link>
        </div>
      </section>
    </div>
  );
}
