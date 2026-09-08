import Link from "next/link";
import {
  PLATFORM_PAGE_PRIMARY_CTA_HREF,
  PLATFORM_PAGE_PRIMARY_CTA_LABEL,
  PLATFORM_PAGE_SECONDARY_CTA_HREF,
  PLATFORM_PAGE_SECONDARY_CTA_LABEL,
  PLATFORM_TEMPLATES_CATALOG,
  PLATFORM_TEMPLATES_EYEBROW,
  PLATFORM_TEMPLATES_LEAD,
  PLATFORM_TEMPLATES_TITLE,
} from "@/lib/platform/public/platform-pricing-templates-copy";

/** Thin HouzzatPRO /templates page — launch-safe catalog only. */
export function HouzzatProPlatformTemplates() {
  return (
    <div className="bg-[#f7f8f7] text-slate-900">
      <section className="relative overflow-hidden bg-[#07111f] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.16),_transparent_42%)]"
        />
        <div className="relative mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-300/90 uppercase">
            {PLATFORM_TEMPLATES_EYEBROW}
          </p>
          <h1 className="mt-4 font-display text-[2.15rem] leading-[1.08] font-semibold tracking-tight sm:text-5xl">
            {PLATFORM_TEMPLATES_TITLE}
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-300 sm:text-base">
            {PLATFORM_TEMPLATES_LEAD}
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

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <ul className="grid gap-4 md:grid-cols-3">
          {PLATFORM_TEMPLATES_CATALOG.map((template) => (
            <li
              key={template.name}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">
                  {template.name}
                </h2>
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
              {template.status === "coming_soon" ? (
                <p className="mt-4 text-xs font-medium text-slate-500">
                  Not available for purchase or selection at launch.
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <p className="text-base font-semibold text-slate-900">
            See the right presentation for your brand
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Book a demo and we will walk through the templates that are ready
            for launch.
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
