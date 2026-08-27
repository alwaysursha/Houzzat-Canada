"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
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
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { StaffPullToRefresh } from "@/components/mobile/StaffPullToRefresh";
import {
  StaffHardLink,
  isStaffCrossLayoutHref,
} from "@/components/site/StaffHardLink";
import { BrandLogoMark } from "@/components/tenancy/BrandLogoMark";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { resolveAppShell } from "@/lib/mobile/app-shell";
import {
  STAFF_OVERLAY_PRIORITY,
  useStaffOverlay,
} from "@/lib/mobile/use-staff-overlay";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const PLATFORM_NAV: NavItem[] = [
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
  { href: "/admin/search", label: "Search", icon: Search },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
];

const TENANT_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/mls", label: "MLS Sync", icon: Activity },
  { href: "/admin/lead-routing", label: "Lead routing", icon: Percent },
  { href: "/admin/people", label: "People", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/agent", label: "CRM desk", icon: Briefcase },
  { href: "/agent/team", label: "Team", icon: UsersRound },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/search", label: "Search", icon: Search },
];

const PLATFORM_MOBILE_TABS = [
  PLATFORM_NAV[0],
  PLATFORM_NAV[1],
  PLATFORM_NAV[3],
  PLATFORM_NAV[10],
] as const;

const TENANT_MOBILE_TABS = [
  TENANT_NAV[0],
  TENANT_NAV[2],
  TENANT_NAV[3],
  TENANT_NAV[5],
] as const;

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pageTitle(pathname: string, nav: NavItem[]) {
  if (pathname === "/admin") return "Overview";
  const match = nav.find(
    (item) =>
      item.href !== "/admin" &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  return match?.label ?? "Command Centre";
}

function NavLinks({
  pathname,
  collapsed,
  onNavigate,
  nav,
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  nav: NavItem[];
}) {
  return (
    <>
      {nav.map((item) => {
        const exact = Boolean(item.exact);
        const active = navActive(pathname, item.href, exact);
        const Icon = item.icon;
        const className = cn(
          "flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium transition",
          active
            ? "bg-canopy/12 text-canopy shadow-[inset_0_0_0_1px_rgb(15_118_90/0.12)]"
            : "text-ink/65 hover:bg-mist hover:text-ink",
          collapsed && "justify-center px-2",
        );
        const body = (
          <>
            <Icon className="size-4 shrink-0" strokeWidth={2.1} />
            {!collapsed ? <span>{item.label}</span> : null}
          </>
        );
        if (isStaffCrossLayoutHref(item.href, "admin")) {
          return (
            <StaffHardLink
              key={item.href}
              href={item.href}
              title={item.label}
              onClick={onNavigate}
              className={className}
            >
              {body}
            </StaffHardLink>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            onClick={onNavigate}
            className={className}
          >
            {body}
          </Link>
        );
      })}
    </>
  );
}

export function AdminShell({
  email,
  mode = "platform",
  brandDisplayName,
  brandLogoUrl = null,
  brandPrimaryColor = "#0F6B4C",
  platformProductName = PLATFORM_PRODUCT_NAME,
  deskSlot = null,
  deskSlotCompact = null,
  mobileDeskSlot = null,
  children,
}: {
  email: string;
  mode?: "platform" | "tenant";
  brandDisplayName: string;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string;
  platformProductName?: string;
  deskSlot?: React.ReactNode;
  deskSlotCompact?: React.ReactNode;
  mobileDeskSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hidePublicSiteLinks, setHidePublicSiteLinks] = useState(false);
  const nav = mode === "tenant" ? TENANT_NAV : PLATFORM_NAV;
  const mobileTabs =
    mode === "tenant" ? TENANT_MOBILE_TABS : PLATFORM_MOBILE_TABS;
  const title = pageTitle(pathname, nav);
  const hqLabel =
    mode === "tenant" ? `${brandDisplayName} Command Centre` : "Admin HQ";
  const controlCenterLabel =
    mode === "tenant"
      ? `${brandDisplayName} Command Centre`
      : `${platformProductName} control center`;
  const moreActive = nav
    .filter(
      (item) =>
        !mobileTabs.some((tab) => tab.href === item.href) &&
        item.href !== "/admin",
    )
    .some((item) => navActive(pathname, item.href));

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    void resolveAppShell().then((shell) => {
      if (!cancelled) setHidePublicSiteLinks(shell === "houzzatpro");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useStaffOverlay({
    open: mobileOpen,
    id: "admin-mobile-drawer",
    priority: STAFF_OVERLAY_PRIORITY.shellDrawer,
    onClose: () => setMobileOpen(false),
  });

  const brandMark = (
    <BrandLogoMark
      displayName={brandDisplayName}
      logoUrl={brandLogoUrl}
      primaryColor={brandPrimaryColor}
      size="sm"
    />
  );

  return (
    <div className="min-h-dvh bg-[linear-gradient(165deg,rgb(238_243_240)_0%,rgb(255_255_255)_45%,rgb(244_247_245)_100%)]">
      <div className="mx-auto flex min-h-dvh max-w-[1600px]">
        <aside
          className={cn(
            "sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-r border-line/80 bg-surface/95 backdrop-blur-md transition-[width] duration-200 lg:flex",
            collapsed ? "w-[4.25rem]" : "w-60",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-4">
            {!collapsed ? (
              <div className="min-w-0">
                <Link
                  href="/admin"
                  className="flex items-center gap-2 font-display text-xl text-ink"
                >
                  {brandMark}
                  <span className="truncate">{brandDisplayName}</span>
                </Link>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-canopy">
                  {mode === "tenant" ? "Command Centre" : "Admin HQ"}
                </p>
                {mode === "tenant" ? (
                  <p className="mt-1 truncate text-[10px] text-ink/40">
                    {platformProductName}
                  </p>
                ) : null}
              </div>
            ) : (
              <Link
                href="/admin"
                className="mx-auto"
                aria-label={hqLabel}
              >
                {brandMark}
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

          {mode === "platform" && (deskSlot || deskSlotCompact) ? (
            <div
              className={cn(
                "border-b border-line/70",
                collapsed ? "px-1.5 py-2" : "px-3 py-3",
              )}
            >
              <div className={collapsed ? "hidden" : "block"}>{deskSlot}</div>
              <div className={collapsed ? "block" : "hidden"}>
                {deskSlotCompact}
              </div>
            </div>
          ) : null}

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            <NavLinks
              pathname={pathname}
              collapsed={collapsed}
              nav={nav}
            />
          </nav>

          <div className="border-t border-line/70 p-3">
            {!collapsed ? (
              <p className="mb-2 truncate text-xs text-ink/45">{email}</p>
            ) : null}
            <SignOutButton className={cn("w-full", collapsed && "px-2")} />
          </div>
        </aside>

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
              "absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-surface pt-[env(safe-area-inset-top)] shadow-[8px_0_40px_rgb(15_32_28/0.18)] transition-transform duration-300 ease-out",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center gap-2 border-b border-line/70 px-4 py-4">
              <Link
                href="/admin"
                className="flex min-w-0 flex-1 items-center gap-2"
                onClick={() => setMobileOpen(false)}
              >
                {brandMark}
                <div className="min-w-0">
                  <p className="truncate font-display text-xl text-ink">
                    {brandDisplayName}
                  </p>
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-canopy">
                    {mode === "tenant" ? "Command Centre" : "Admin HQ"}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex size-11 items-center justify-center rounded-lg text-ink/55 transition hover:bg-mist hover:text-ink"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            {mode === "platform" && mobileDeskSlot ? (
              <div className="border-b border-line/70 px-3 py-3">
                {mobileDeskSlot}
              </div>
            ) : null}

            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
              <NavLinks
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                nav={nav}
              />
            </nav>

            <div className="border-t border-line/70 p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
              <p className="mb-2 truncate text-xs text-ink/45">{email}</p>
              {mode === "tenant" ? (
                <p className="mb-3 text-[10px] text-ink/40">
                  Powered by {platformProductName}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                {!hidePublicSiteLinks ? (
                  <StaffHardLink
                    href="/"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-line px-3 py-2.5 text-center text-sm font-semibold text-ink/70 transition hover:border-canopy/40 hover:text-canopy"
                  >
                    View site
                  </StaffHardLink>
                ) : null}
                <SignOutButton className="w-full" />
              </div>
            </div>
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-50 flex items-center gap-2 border-b border-line/80 bg-surface/95 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-md lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex size-11 items-center justify-center rounded-xl text-ink/70 transition active:bg-mist"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base tracking-tight text-ink">
                {title}
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-canopy">
                {mode === "tenant" ? brandDisplayName : "Admin HQ"}
              </p>
            </div>
            <StaffHardLink
              href="/agent"
              className="inline-flex min-h-10 items-center rounded-xl bg-canopy px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm active:scale-[0.98]"
            >
              CRM
            </StaffHardLink>
          </header>

          <header className="sticky top-0 z-20 hidden border-b border-line/70 bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-6 lg:block">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
                  {controlCenterLabel}
                </p>
                <p className="truncate text-sm text-ink/60">
                  {mode === "tenant"
                    ? "Leads · tasks · team · CRM"
                    : "People · visitors · growth · operations"}
                </p>
              </div>
              {!hidePublicSiteLinks ? (
                <StaffHardLink
                  href="/"
                  className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-canopy/40 hover:text-canopy"
                >
                  View site
                </StaffHardLink>
              ) : null}
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-x-hidden px-3 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 lg:px-8 lg:pb-8">
            <StaffPullToRefresh>{children}</StaffPullToRefresh>
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
            aria-label="Primary"
          >
            <div className="grid grid-cols-5">
              {mobileTabs.map((item) => {
                const exact = Boolean(item.exact);
                const active = navActive(pathname, item.href, exact);
                const Icon = item.icon;
                const shortLabel =
                  item.label === "CRM desk" ? "CRM" : item.label;
                const className = cn(
                  "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition",
                  active ? "text-canopy" : "text-ink/45",
                );
                const body = (
                  <>
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
                  </>
                );
                if (isStaffCrossLayoutHref(item.href, "admin")) {
                  return (
                    <StaffHardLink
                      key={item.href}
                      href={item.href}
                      className={className}
                    >
                      {body}
                    </StaffHardLink>
                  );
                }
                return (
                  <Link key={item.href} href={item.href} className={className}>
                    {body}
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
