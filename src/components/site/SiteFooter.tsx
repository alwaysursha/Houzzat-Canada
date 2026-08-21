import Link from "next/link";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const EXPLORE_LINKS = [
  { href: "/search", label: "Search Homes" },
  { href: "/search?transactionType=SALE", label: "Buy" },
  { href: "/search?transactionType=LEASE", label: "Rent" },
  { href: "/home-valuation", label: "Home valuation" },
] as const;

const ACCOUNT_LINKS = [
  { href: "/account", label: "Account" },
  { href: "/account/saved", label: "Saved Homes" },
  { href: "/account/watchlist", label: "Watchlist" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/delete-account", label: "Delete account" },
] as const;

/**
 * Shared Houzzat site footer.
 * Used by marketing layout and embedded at the end of listing sheet/panel/iframe
 * (full `/listing/...` keeps a single instance via MarketingBelowHeader).
 */
export function SiteFooter({
  className,
  embedded = false,
}: {
  className?: string;
  /** Tighter padding when nested inside listing scroll (sheet / panel / iframe). */
  embedded?: boolean;
}) {
  return (
    <footer
      className={cn(
        "border-t border-line/70 bg-mist/80",
        embedded ? "mt-2" : null,
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-6xl px-4 sm:px-6",
          embedded ? "py-8 sm:py-10" : "py-10 sm:py-12",
        )}
      >
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="max-w-md space-y-3">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img
                src="/images/houzzat-house-mark.png"
                alt=""
                width={36}
                height={36}
                className="size-9 shrink-0 object-contain"
                aria-hidden
              />
              <p className="font-display text-2xl font-semibold tracking-tight text-ink">
                {SITE_NAME}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-ink/60">
              {SITE_DESCRIPTION}
            </p>
            <p className="text-sm leading-relaxed text-ink/55">
              MLS® listing data via TRREB / PropTx (IDX). Sold prices and history
              are shown to registered Houzzat clients only (VOW).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-10 lg:min-w-[28rem]">
            <FooterNav title="Explore" links={EXPLORE_LINKS} />
            <FooterNav title="Account" links={ACCOUNT_LINKS} />
            <FooterNav
              title="Legal"
              links={LEGAL_LINKS}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>

        <div className="mt-10 flex max-w-3xl flex-col gap-4 border-t border-line/60 pt-8 sm:flex-row sm:items-start sm:gap-5">
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
                className="inline-flex min-h-11 items-center text-ink/80 underline-offset-2 hover:underline"
              >
                647 - 221 - 4949
              </a>
            </p>
            <p>
              Office:{" "}
              <a
                href="tel:+19057935000"
                className="inline-flex min-h-11 items-center text-ink/80 underline-offset-2 hover:underline"
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

function FooterNav({
  title,
  links,
  className,
}: {
  title: string;
  links: readonly { href: string; label: string }[];
  className?: string;
}) {
  return (
    <nav aria-label={title} className={className}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/40">
        {title}
      </p>
      <ul className="mt-3 space-y-1">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              className="inline-flex min-h-11 items-center text-[15px] leading-snug text-ink/70 transition hover:text-canopy hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
