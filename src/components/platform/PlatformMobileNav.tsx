"use client";

import Link from "next/link";
import { useState } from "react";
import { PlatformSignOutButton } from "@/components/platform/PlatformSignOutButton";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

type PlatformMobileNavProps = {
  nav: readonly NavItem[];
  email: string;
};

export function PlatformMobileNav({ nav, email }: PlatformMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
        aria-expanded={open}
        aria-label="Open platform navigation"
      >
        Menu
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full border-b border-slate-800 bg-[#111827] px-4 py-3 shadow-lg">
          <p className="mb-2 truncate text-xs text-slate-400">{email}</p>
          <nav className="space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <PlatformSignOutButton className="mt-3 block px-3 py-2 text-left text-sm text-slate-400 disabled:opacity-60" />
        </div>
      ) : null}
    </div>
  );
}
