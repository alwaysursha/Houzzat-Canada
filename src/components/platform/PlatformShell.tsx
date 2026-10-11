import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformMobileNav } from "@/components/platform/PlatformMobileNav";
import { PlatformSignOutButton } from "@/components/platform/PlatformSignOutButton";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import type { PlatformMeData } from "@/lib/platform/ui/types";

const NAV = [
  { href: "/platform", label: "Dashboard", exact: true },
  { href: "/platform/workspaces", label: "Workspaces" },
  { href: "/platform/signup-analytics", label: "Signup Analytics" },
  { href: "/platform/prospects", label: "Prospects" },
  { href: "/platform/offers", label: "Offers" },
  { href: "/platform/subscriptions", label: "Subscriptions" },
  { href: "/platform/provisioning", label: "Provisioning" },
  { href: "/platform/sms-automations", label: "SMS Automations" },
  { href: "/platform/sms-quick-texts", label: "Quick Texts" },
  { href: "/platform/audit", label: "Audit" },
] as const;

type PlatformShellProps = {
  me: PlatformMeData;
  children: ReactNode;
};

export function PlatformShell({ me, children }: PlatformShellProps) {
  const operatorLabel = me.user.email ?? me.user.name ?? "Operator";

  return (
    <div className="platform-shell min-h-dvh bg-[#0f172a] text-slate-100">
      <div className="mx-auto flex min-h-dvh max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-[#111827] lg:flex lg:flex-col">
          <div className="border-b border-slate-800 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
              {PLATFORM_PRODUCT_NAME}
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-white">
              Master Admin
            </p>
            <p className="mt-2 text-xs text-slate-400">Platform control plane</p>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-slate-800 px-4 py-4 text-xs text-slate-400">
            <p className="truncate font-medium text-slate-200">{operatorLabel}</p>
            <p className="mt-1 uppercase tracking-wide text-emerald-400/90">
              {me.operator.role}
            </p>
            <PlatformSignOutButton
              className="mt-3 inline-block text-slate-400 underline-offset-2 hover:text-white hover:underline disabled:opacity-60"
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#0f172a]/95 backdrop-blur">
            <div className="relative flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-400">
                  Internal platform
                </p>
                <p className="text-sm text-slate-300">{operatorLabel}</p>
              </div>
              <PlatformMobileNav nav={NAV} email={operatorLabel} />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
