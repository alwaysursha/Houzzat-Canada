import Link from "next/link";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import {
  PLATFORM_HOME_PRIMARY_CTA_HREF,
  PLATFORM_HOME_PRIMARY_CTA_LABEL,
  PLATFORM_HOME_SECONDARY_CTA_HREF,
  PLATFORM_HOME_SECONDARY_CTA_LABEL,
} from "@/lib/platform/public/platform-home-copy";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";

/**
 * Minimal HouzzatPRO SaaS marketing footer (platform root only).
 * No consumer real-estate links.
 */
export function PlatformMarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-[#07111f] text-slate-300">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div>
          <HouzzatProWordmark size="md" className="text-white" />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
            The real estate business platform for professional websites and
            connected operations.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium">
          <Link
            href={PLATFORM_HOME_PRIMARY_CTA_HREF}
            className="text-emerald-300 hover:text-emerald-200"
          >
            {PLATFORM_HOME_PRIMARY_CTA_LABEL}
          </Link>
          <Link href="/support" className="hover:text-white">
            Support
          </Link>
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <a
            href={PLATFORM_HOME_SECONDARY_CTA_HREF}
            className="hover:text-white"
          >
            {PLATFORM_HOME_SECONDARY_CTA_LABEL}
          </a>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {PLATFORM_PRODUCT_NAME}
      </div>
    </footer>
  );
}
