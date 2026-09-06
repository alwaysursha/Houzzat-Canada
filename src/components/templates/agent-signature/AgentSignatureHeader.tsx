"use client";

import Link from "next/link";
import { useState } from "react";
import type { AgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";

type NavItem = {
  label: string;
  href?: string;
  children?: Array<{ label: string; href: string; hint?: string }>;
};

const NAV: NavItem[] = [
  {
    label: "Buy",
    children: [
      { label: "Search homes", href: "/search?transactionType=SALE", hint: "Residential for sale" },
      { label: "For lease", href: "/search?transactionType=LEASE", hint: "Rentals" },
      { label: "Commercial", href: "/search?segment=COMMERCIAL", hint: "Business properties" },
      { label: "Open houses", href: "/open-houses" },
    ],
  },
  {
    label: "Sell",
    children: [
      { label: "Home valuation", href: "/home-valuation", hint: "What's your home worth?" },
      { label: "Seller readiness", href: "/tools/seller-readiness" },
    ],
  },
  { label: "Listings", href: "/search?transactionType=SALE" },
  { label: "Communities", href: "/areas" },
  { label: "Home Value", href: "/home-valuation" },
  { label: "Market Insights", href: "/areas" },
  { label: "About", href: "/#meet-the-agent" },
  { label: "Contact", href: "/#work-with-me" },
];

/**
 * Stage 6.11B.2 — premium Agent Signature header with intentional nav.
 */
export function AgentSignatureHeader({
  view,
}: {
  view: AgentSignatureView;
}) {
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-mist/95 backdrop-blur-md">
      {view.isDemoPreview ? (
        <div className="bg-ink px-4 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-surface/80">
          Template preview · Demo agent identity
        </div>
      ) : null}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-10">
        <Link href="/" className="min-w-0 shrink-0">
          <p className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {view.name}
          </p>
          {view.brokerageName ? (
            <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
              {view.brokerageName}
            </p>
          ) : null}
        </Link>

        <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary">
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
                  className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink/75 hover:text-ink"
                  aria-expanded={openMenu === item.label}
                >
                  {item.label}
                </button>
                {openMenu === item.label ? (
                  <div className="absolute left-0 top-full z-50 min-w-[16rem] border border-ink/10 bg-mist py-3 shadow-[0_20px_50px_-24px_rgba(28,25,23,0.55)]">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block px-4 py-2.5 hover:bg-ink/[0.04]"
                      >
                        <span className="block text-sm font-semibold text-ink">
                          {child.label}
                        </span>
                        {child.hint ? (
                          <span className="mt-0.5 block text-xs text-ink/50">
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
                className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink/75 hover:text-ink"
              >
                {item.label}
              </Link>
            ),
          )}
          <Link
            href="/account"
            className="ml-2 border border-ink bg-ink px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-surface transition hover:bg-transparent hover:text-ink"
          >
            Account
          </Link>
        </nav>

        <button
          type="button"
          className="inline-flex items-center border border-ink/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink xl:hidden"
          aria-expanded={open}
          aria-controls="as-mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open ? (
        <nav
          id="as-mobile-nav"
          className="border-t border-ink/10 px-4 py-4 xl:hidden"
          aria-label="Mobile"
        >
          <ul className="space-y-1">
            {NAV.flatMap((item) =>
              item.children
                ? item.children.map((c) => (
                    <li key={c.href}>
                      <Link
                        href={c.href}
                        className="block px-2 py-2.5 text-sm font-medium text-ink"
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
                        className="block px-2 py-2.5 text-sm font-medium text-ink"
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
                className="mt-2 block bg-ink px-3 py-3 text-center text-sm font-semibold text-surface"
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
