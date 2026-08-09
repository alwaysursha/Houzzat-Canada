import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";

/**
 * Keep footer transparent so the page body background (mist + soft radials)
 * shows through continuously — avoids a hard light/dark horizontal seam.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line/70 bg-mist/80">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1fr_auto] md:items-start md:gap-10">
        <div className="space-y-2">
          <p className="font-display text-lg text-ink">{SITE_NAME}</p>
          <p className="max-w-md text-sm text-ink/55">
            MLS® listing data via TRREB / PropTx (IDX). Sold prices and history
            are shown to registered Houzzat clients only (VOW).
          </p>
          <nav
            aria-label="Legal"
            className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm"
          >
            <Link
              href="/privacy"
              className="text-ink/60 underline-offset-2 hover:text-canopy hover:underline"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-ink/60 underline-offset-2 hover:text-canopy hover:underline"
            >
              Terms of Use
            </Link>
            <Link
              href="/delete-account"
              className="text-ink/60 underline-offset-2 hover:text-canopy hover:underline"
            >
              Delete account
            </Link>
          </nav>
        </div>

        <div className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="inline-flex shrink-0 self-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img
              src="/images/royal-lepage-logo.png"
              alt="Royal LePage"
              width={140}
              height={52}
              className="block h-9 w-[140px] object-contain object-left"
            />
          </div>
          <address className="not-italic text-sm leading-relaxed text-ink/70">
            <p className="font-semibold text-ink">Ali Syed</p>
            <p>Sales Representative</p>
            <p>Royal LePage Credit Valley Real Estate</p>
            <p>
              Direct:{" "}
              <a
                href="tel:+16472214949"
                className="text-ink/80 underline-offset-2 hover:underline"
              >
                647 - 221 - 4949
              </a>
            </p>
            <p>
              Office:{" "}
              <a
                href="tel:+19057935000"
                className="text-ink/80 underline-offset-2 hover:underline"
              >
                905 - 793 - 5000
              </a>
            </p>
            <p>1-10045 Hurontario St.</p>
            <p>Brampton, ON, L6Z 0E6</p>
          </address>
        </div>
      </div>
    </footer>
  );
}
