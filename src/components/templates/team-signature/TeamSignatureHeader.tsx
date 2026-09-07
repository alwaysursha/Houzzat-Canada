"use client";

import Link from "next/link";
import { useState } from "react";
import type { TeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href?: string;
  children?: Array<{ label: string; href: string; hint?: string }>;
};

const NAV: NavItem[] = [
  {
    label: "Buy",
    children: [
      {
        label: "Search homes",
        href: "/search?transactionType=SALE",
        hint: "Residential for sale",
      },
      {
        label: "For lease",
        href: "/search?transactionType=LEASE",
        hint: "Rentals",
      },
      {
        label: "Commercial",
        href: "/search?segment=COMMERCIAL",
        hint: "Business properties",
      },
      { label: "Open houses", href: "/open-houses" },
    ],
  },
  {
    label: "Sell",
    children: [
      {
        label: "Home valuation",
        href: "/home-valuation",
        hint: "What's your home worth?",
      },
      { label: "Seller readiness", href: "/tools/seller-readiness" },
    ],
  },
  { label: "Listings", href: "/search?transactionType=SALE" },
  { label: "The Team", href: "/#meet-the-team" },
  { label: "Areas", href: "/areas" },
  { label: "Home Value", href: "/home-valuation" },
  { label: "Contact", href: "/#contact-the-team" },
];

/**
 * Stage 6.11E.2A — premium team-brand header.
 * When OWNER preview bar is sticky above, offset sticky top so content
 * does not slide under the combined chrome (Team-only; AS unchanged).
 */
export function TeamSignatureHeader({
  view,
  previewBarActive = false,
}: {
  view: TeamSignatureView;
  previewBarActive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <header
      className={cn(
        "sticky z-40 border-b border-[var(--ts-ink,#0F6B4C)]/12 bg-[var(--ts-surface,#EEF3F0)]/95 backdrop-blur-md",
        previewBarActive ? "top-16 sm:top-14" : "top-0",
      )}
      data-ts-section="header"
      data-ts-preview-offset={previewBarActive ? "true" : "false"}
    >
      {view.isDemoPreview ? (
        <div className="bg-[var(--ts-ink,#0F6B4C)] px-4 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-surface/85">
          Template preview · Demo team identity
        </div>
      ) : null}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 sm:py-4 lg:px-10">
        <Link href="/" className="flex min-w-0 items-center gap-3.5 sm:gap-4">
          {view.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.logoUrl}
              alt=""
              className="h-11 w-auto max-w-[11rem] object-contain object-left sm:h-12 sm:max-w-[13rem]"
            />
          ) : null}
          <span className="min-w-0">
            <span className="block truncate font-display text-xl font-semibold tracking-tight text-[var(--ts-ink,#0F6B4C)] sm:text-2xl">
              {view.teamName}
            </span>
            {view.serviceArea ? (
              <span className="mt-0.5 hidden truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ts-ink,#0F6B4C)]/45 sm:block">
                {view.serviceArea}
              </span>
            ) : null}
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Primary">
          {NAV.map((item) =>
            item.children ? (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => setOpenMenu(item.label)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <button
                  type="button"
                  className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ts-ink,#0F6B4C)]/70 hover:text-[var(--ts-ink,#0F6B4C)]"
                  aria-expanded={openMenu === item.label}
                >
                  {item.label}
                </button>
                {openMenu === item.label ? (
                  <div className="absolute left-0 top-full z-50 min-w-[15rem] border border-[var(--ts-ink,#0F6B4C)]/10 bg-[var(--ts-surface,#EEF3F0)] py-2 shadow-[0_18px_40px_-20px_rgba(15,107,76,0.45)]">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block px-4 py-2.5 hover:bg-[var(--ts-ink,#0F6B4C)]/[0.04]"
                      >
                        <span className="block text-sm font-semibold text-[var(--ts-ink,#0F6B4C)]">
                          {child.label}
                        </span>
                        {child.hint ? (
                          <span className="mt-0.5 block text-xs text-[var(--ts-ink,#0F6B4C)]/50">
                            {child.hint}
                          </span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href!}
                className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ts-ink,#0F6B4C)]/70 hover:text-[var(--ts-ink,#0F6B4C)]"
              >
                {item.label}
              </Link>
            ),
          )}
          <Link
            href="/account"
            className="ml-2 bg-[var(--ts-ink,#0F6B4C)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-surface transition hover:opacity-90"
          >
            Account
          </Link>
        </nav>

        <button
          type="button"
          className="inline-flex items-center border border-[var(--ts-ink,#0F6B4C)]/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ts-ink,#0F6B4C)] xl:hidden"
          aria-expanded={open}
          aria-controls="ts-mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open ? (
        <nav
          id="ts-mobile-nav"
          className="border-t border-[var(--ts-ink,#0F6B4C)]/10 px-4 py-4 xl:hidden"
          aria-label="Mobile"
        >
          <ul className="space-y-1">
            {NAV.flatMap((item) =>
              item.children
                ? item.children.map((c) => (
                    <li key={c.href}>
                      <Link
                        href={c.href}
                        className="block px-2 py-2.5 text-sm font-medium text-[var(--ts-ink,#0F6B4C)]"
                        onClick={() => setOpen(false)}
                      >
                        {c.label}
                      </Link>
                    </li>
                  ))
                : [
                    <li key={item.label}>
                      <Link
                        href={item.href!}
                        className="block px-2 py-2.5 text-sm font-medium text-[var(--ts-ink,#0F6B4C)]"
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </li>,
                  ],
            )}
            <li>
              <Link
                href="/account"
                className="mt-2 block bg-[var(--ts-ink,#0F6B4C)] px-3 py-3 text-center text-sm font-semibold text-surface"
                onClick={() => setOpen(false)}
              >
                Account
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
