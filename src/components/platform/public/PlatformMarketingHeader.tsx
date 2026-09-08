import Link from "next/link";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import {
  PLATFORM_HOME_NAV,
  PLATFORM_HOME_PRIMARY_CTA_HREF,
  PLATFORM_HOME_PRIMARY_CTA_LABEL,
  PLATFORM_HOME_SECONDARY_CTA_HREF,
  PLATFORM_HOME_SECONDARY_CTA_LABEL,
} from "@/lib/platform/public/platform-home-copy";

/**
 * Minimal HouzzatPRO SaaS marketing header (platform root only).
 * Never links to consumer auth sign-in or sign-up routes.
 */
export function PlatformMarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#f7f8f7]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="shrink-0 text-slate-900"
          aria-label="HouzzatPRO home"
        >
          <HouzzatProWordmark size="md" className="text-slate-900" />
        </Link>

        <nav
          className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex"
          aria-label="Primary"
        >
          {PLATFORM_HOME_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-slate-900"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={PLATFORM_HOME_SECONDARY_CTA_HREF}
            className="hidden text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 sm:inline"
          >
            {PLATFORM_HOME_SECONDARY_CTA_LABEL}
          </a>
          <Link
            href={PLATFORM_HOME_PRIMARY_CTA_HREF}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
          >
            {PLATFORM_HOME_PRIMARY_CTA_LABEL}
          </Link>
        </div>
      </div>

      <nav
        className="flex gap-4 overflow-x-auto border-t border-slate-200/70 px-4 py-2 text-xs font-medium text-slate-600 md:hidden"
        aria-label="Sections"
      >
        {PLATFORM_HOME_NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="shrink-0 whitespace-nowrap hover:text-slate-900"
          >
            {item.label}
          </a>
        ))}
        <a
          href={PLATFORM_HOME_SECONDARY_CTA_HREF}
          className="shrink-0 whitespace-nowrap hover:text-slate-900 sm:hidden"
        >
          {PLATFORM_HOME_SECONDARY_CTA_LABEL}
        </a>
      </nav>
    </header>
  );
}
