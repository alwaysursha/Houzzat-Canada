import Link from "next/link";
import { BrandLogoMark } from "@/components/tenancy/BrandLogoMark";
import { BrokeragePublicIdentity } from "@/components/site/BrokeragePublicIdentity";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import type { MarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import {
  buildTenantFooterModel,
  HOUZZATPRO_PLATFORM_URL,
  POWERED_BY_HOUZZATPRO_LABEL,
} from "@/lib/tenancy/platform-footer";
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
 * Shared site footer — tenant-aware in workspace branding scope.
 */
export function SiteFooter({
  className,
  embedded = false,
  chromeBrand,
}: {
  className?: string;
  embedded?: boolean;
  chromeBrand?: MarketingChromeBrand;
}) {
  const siteName = chromeBrand?.displayName ?? SITE_NAME;
  const tagline = chromeBrand?.tagline ?? SITE_DESCRIPTION;
  const isHouzzatTenant = chromeBrand?.isHouzzatWorkspace ?? true;
  const footerModel = chromeBrand
    ? buildTenantFooterModel(chromeBrand)
    : null;

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
            <div
              className={cn(
                "flex items-center",
                isHouzzatTenant ? null : "gap-2",
              )}
            >
              {!isHouzzatTenant ? (
                chromeBrand ? (
                  <BrandLogoMark
                    displayName={chromeBrand.displayName}
                    logoUrl={chromeBrand.logoUrl}
                    primaryColor={chromeBrand.colors.primary}
                    size="sm"
                  />
                ) : (
                  <span
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-canopy/15 font-display text-sm font-bold text-canopy"
                    aria-hidden
                  >
                    {siteName.charAt(0).toUpperCase()}
                  </span>
                )
              ) : null}
              <p className="font-display text-2xl font-semibold leading-none tracking-tight text-ink">
                {siteName}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-ink/60">{tagline}</p>
            {isHouzzatTenant ? (
              <p className="text-sm leading-relaxed text-ink/55">
                MLS® listing data via TRREB / PropTx (IDX). Sold prices and history
                are shown to registered Houzzat clients only (VOW).
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-ink/55">
                MLS® listing data via TRREB / PropTx (IDX). Sold prices and history
                may require client registration (VOW).
              </p>
            )}
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
          {isHouzzatTenant ? (
            <>
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
            </>
          ) : (
            <BrokeragePublicIdentity
              brokerage={
                chromeBrand?.professionalIdentity?.brokerage ?? {
                  name: null,
                  address: null,
                  phone: null,
                  fax: null,
                  logoUrl: chromeBrand?.brokerageLogoUrl ?? null,
                }
              }
              tone="default"
            />
          )}
        </div>

        {footerModel?.tenantLegalText && !chromeBrand?.isHouzzatWorkspace ? (
          <div className="mt-4 max-w-3xl text-sm leading-relaxed text-ink/55">
            {footerModel.tenantLegalText
              .split("\n")
              .filter(Boolean)
              .map((line) => (
                <p key={line}>{line}</p>
              ))}
          </div>
        ) : null}

        {!chromeBrand?.isHouzzatWorkspace &&
        (chromeBrand?.contact.email || chromeBrand?.contact.phone) ? (
          <div className="mt-4 text-sm leading-relaxed text-ink/70">
            {chromeBrand.contact.phone ? (
              <p>
                Business phone:{" "}
                <a
                  href={`tel:${chromeBrand.contact.phone}`}
                  className="inline-flex min-h-11 items-center text-ink/80 underline-offset-2 hover:underline"
                >
                  {chromeBrand.contact.phone}
                </a>
              </p>
            ) : null}
            {chromeBrand.contact.email ? (
              <p>
                Email:{" "}
                <a
                  href={`mailto:${chromeBrand.contact.email}`}
                  className="inline-flex min-h-11 items-center text-ink/80 underline-offset-2 hover:underline"
                >
                  {chromeBrand.contact.email}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-8 text-center text-xs text-ink/50 sm:text-left">
          <a
            href={HOUZZATPRO_PLATFORM_URL}
            className="font-medium text-ink/60 underline-offset-2 hover:text-canopy hover:underline"
            rel="noopener noreferrer"
          >
            {POWERED_BY_HOUZZATPRO_LABEL}
          </a>
        </p>
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
