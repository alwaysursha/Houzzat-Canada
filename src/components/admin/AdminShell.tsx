"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  Construction,
  Eye,
  Handshake,
  LayoutDashboard,
  Menu,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AdminDeskPicker } from "@/components/admin/AdminDeskPicker";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/people", label: "People", icon: Users },
  { href: "/admin/lead-routing", label: "Lead routing", icon: Percent },
  { href: "/admin/visitors", label: "Visitors", icon: Eye },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/ads", label: "Ad Studio", icon: Megaphone },
  { href: "/admin/landings", label: "Landings", icon: Activity },
  { href: "/admin/fsbo", label: "Owner listings", icon: Building2 },
  { href: "/admin/partners", label: "Partners", icon: Handshake },
  {
    href: "/admin/pre-construction",
    label: "Pre-construction",
    icon: Construction,
  },
  { href: "/agent", label: "CRM desk", icon: Briefcase },
  { href: "/search", label: "Search", icon: Search },
] as const;

const MOBILE_TABS = [
  NAV[0],
  NAV[1],
  NAV[3],
  NAV[10],
] as const;

type DeskAgent = { id: string; name: string | null; email: string };

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pageTitle(pathname: string) {
  if (pathname === "/admin") return "Overview";
  const match = NAV.find(
    (item) =>
      item.href !== "/admin" &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  return match?.label ?? "Admin HQ";
}

function NavLinks({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV.map((item) => {
        const exact = "exact" in item && item.exact;
        const active = navActive(pathname, item.href, exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium transition",
              active
                ? "bg-canopy/12 text-canopy shadow-[inset_0_0_0_1px_rgb(15_118_90/0.12)]"
                : "text-ink/65 hover:bg-mist hover:text-ink",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={2.1} />
            {!collapsed ? <span>{item.label}</span> : null}
          </Link>
        );
      })}
    </>
  );
}

export function AdminShell({
  email,
  deskAgents = [],
  deskAgentId = null,
  children,
}: {
  email: string;
  deskAgents?: DeskAgent[];
  deskAgentId?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = pageTitle(pathname);
  const moreActive = NAV.filter(
    (item) =>
      !MOBILE_TABS.some((tab) => tab.href === item.href) &&
      item.href !== "/admin",
  ).some((item) => navActive(pathname, item.href));

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-dvh bg-[linear-gradient(165deg,rgb(238_243_240)_0%,rgb(255_255_255)_45%,rgb(244_247_245)_100%)]">
      <div className="mx-auto flex min-h-dvh max-w-[1600px]">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-r border-line/80 bg-surface/95 backdrop-blur-md transition-[width] duration-200 lg:flex",
            collapsed ? "w-[4.25rem]" : "w-60",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-4">
            {!collapsed ? (
              <div className="min-w-0">
                <Link href="/admin" className="font-display text-xl text-ink">
                  {SITE_NAME}
                </Link>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-canopy">
                  Admin HQ
                </p>
              </div>
            ) : (
              <Link
                href="/admin"
                className="mx-auto flex size-9 items-center justify-center rounded-xl bg-canopy/12 font-display text-lg text-canopy"
                aria-label="Admin HQ"
              >
                H
              </Link>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="rounded-lg p-1.5 text-ink/50 transition hover:bg-mist hover:text-ink"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </div>

          {deskAgents.length > 0 ? (
            <div
              className={cn(
                "border-b border-line/70",
                collapsed ? "px-1.5 py-2" : "px-3 py-3",
              )}
            >
              <AdminDeskPicker
                key={deskAgentId ?? "all"}
                agents={deskAgents}
                selectedAgentId={deskAgentId}
                compact={collapsed}
              />
            </div>
          ) : null}

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            <NavLinks pathname={pathname} collapsed={collapsed} />
          </nav>

          <div className="border-t border-line/70 p-3">
            {!collapsed ? (
              <p className="mb-2 truncate text-xs text-ink/45">{email}</p>
            ) : null}
            <SignOutButton className={cn("w-full", collapsed && "px-2")} />
          </div>
        </aside>

        {/* Mobile drawer */}
        <div
          className={cn(
            "fixed inset-0 z-[70] lg:hidden",
            mobileOpen ? "pointer-events-auto" : "pointer-events-none",
          )}
          aria-hidden={!mobileOpen}
        >
          <button
            type="button"
            className={cn(
              "absolute inset-0 bg-ink/45 backdrop-blur-[2px] transition-opacity duration-200",
              mobileOpen ? "opacity-100" : "opacity-0",
            )}
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-surface shadow-[8px_0_40px_rgb(15_32_28/0.18)] transition-transform duration-300 ease-out",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center gap-2 border-b border-line/70 px-4 py-4">
              <Link
                href="/admin"
                className="min-w-0 flex-1"
                onClick={() => setMobileOpen(false)}
              >
                <p className="truncate font-display text-xl text-ink">
                  {SITE_NAME}
                </p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-canopy">
                  Admin HQ
                </p>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-ink/55 transition hover:bg-mist hover:text-ink"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            {deskAgents.length > 0 ? (
              <div className="border-b border-line/70 px-3 py-3">
                <AdminDeskPicker
                  key={`mobile-${deskAgentId ?? "all"}`}
                  agents={deskAgents}
                  selectedAgentId={deskAgentId}
                />
              </div>
            ) : null}

            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
              <NavLinks
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>

            <div className="border-t border-line/70 p-4">
              <p className="mb-2 truncate text-xs text-ink/45">{email}</p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl border border-line px-3 py-2.5 text-center text-sm font-semibold text-ink/70 transition hover:border-canopy/40 hover:text-canopy"
                >
                  View site
                </Link>
                <SignOutButton className="w-full" />
              </div>
            </div>
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-50 flex items-center gap-2 border-b border-line/80 bg-surface/95 px-3 py-2.5 backdrop-blur-md lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-ink/70 transition active:bg-mist"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base tracking-tight text-ink">
                {title}
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-canopy">
                Admin HQ
              </p>
            </div>
            <Link
              href="/agent"
              className="rounded-xl bg-canopy px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm active:scale-[0.98]"
            >
              CRM
            </Link>
          </header>

          {/* Desktop top bar */}
          <header className="sticky top-0 z-20 hidden border-b border-line/70 bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-6 lg:block">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
                  Houzzat control center
                </p>
                <p className="truncate text-sm text-ink/60">
                  People · visitors · growth · operations
                </p>
              </div>
              <Link
                href="/"
                className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-canopy/40 hover:text-canopy"
              >
                View site
              </Link>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-3 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 lg:px-8 lg:pb-8">
            {children}
          </main>

          {/* Mobile bottom tabs */}
          <nav
            className="fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
            aria-label="Primary"
          >
            <div className="grid grid-cols-5">
              {MOBILE_TABS.map((item) => {
                const exact = "exact" in item && item.exact;
                const active = navActive(pathname, item.href, exact);
                const Icon = item.icon;
                const shortLabel =
                  item.label === "CRM desk" ? "CRM" : item.label;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition",
                      active ? "text-canopy" : "text-ink/45",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-xl transition",
                        active ? "bg-canopy/12" : "bg-transparent",
                      )}
                    >
                      <Icon
                        className="size-[18px]"
                        strokeWidth={active ? 2.2 : 1.85}
                      />
                    </span>
                    {shortLabel}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition",
                  moreActive || mobileOpen ? "text-canopy" : "text-ink/45",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-xl transition",
                    moreActive || mobileOpen
                      ? "bg-canopy/12"
                      : "bg-transparent",
                  )}
                >
                  <Menu
                    className="size-[18px]"
                    strokeWidth={moreActive || mobileOpen ? 2.2 : 1.85}
                  />
                </span>
                More
              </button>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
