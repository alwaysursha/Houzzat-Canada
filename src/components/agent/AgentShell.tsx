"use client";

import {
  ActivityFeedDrawer,
  ActivityGlobeButton,
} from "@/components/agent/ActivityFeedDrawer";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { StaffPullToRefresh } from "@/components/mobile/StaffPullToRefresh";
import {
  StaffHardLink,
  isStaffCrossLayoutHref,
} from "@/components/site/StaffHardLink";
import { BrandLogoMark } from "@/components/tenancy/BrandLogoMark";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { setNativeStatusBarLightOverlay } from "@/lib/mobile/native-status-bar";
import {
  STAFF_OVERLAY_PRIORITY,
  useStaffOverlay,
} from "@/lib/mobile/use-staff-overlay";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AgentMobileInstantShell } from "@/components/agent/AgentMobileInstantShell";
import {
  Bell,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  Inbox,
  LayoutDashboard,
  LineChart,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

const NAV = [
  { href: "/agent", label: "Launchpad", icon: LayoutDashboard, exact: true },
  { href: "/agent/leads", label: "Leads", icon: Users },
  { href: "/agent/chats", label: "Chats", icon: MessageCircle },
  { href: "/agent/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/agent/appointments", label: "Calendar", icon: CalendarDays },
  { href: "/agent/statistics", label: "Statistics", icon: ChartColumn },
  { href: "/agent/inbox", label: "Comms", icon: Inbox, fullLabel: "Communications" },
  { href: "/agent/cma", label: "CMA", icon: LineChart },
  { href: "/agent/team", label: "Team", icon: UsersRound },
  { href: "/agent/notifications", label: "Notifications", icon: Bell },
  { href: "/agent/search", label: "Properties", icon: Search },
] as const;

const MOBILE_TABS = [
  NAV[0],
  NAV[1],
  NAV[2],
  NAV[4],
] as const;

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  collapsed,
  onNavigate,
  compactLabels = false,
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  compactLabels?: boolean;
}) {
  return (
    <>
      {NAV.map((item) => {
        const exact = "exact" in item && item.exact;
        const active = navActive(pathname, item.href, exact);
        const Icon = item.icon;
        const label =
          compactLabels && "fullLabel" in item && item.fullLabel
            ? item.fullLabel
            : item.label;
        const className = cn(
          "relative flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[13px] font-medium transition",
          active
            ? "bg-canopy text-white"
            : "text-white/70 hover:bg-white/8 hover:text-white",
          collapsed && "justify-center px-2",
        );
        const body = (
          <>
            {active ? (
              <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-white/80" />
            ) : null}
            <Icon className="size-4 shrink-0" strokeWidth={1.85} />
            {!collapsed ? <span>{label}</span> : null}
          </>
        );
        if (isStaffCrossLayoutHref(item.href, "agent")) {
          return (
            <StaffHardLink
              key={item.href}
              href={item.href}
              title={label}
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
            title={label}
            onClick={onNavigate}
            className={className}
            prefetch={item.href === "/agent/leads" ? false : undefined}
          >
            {body}
          </Link>
        );
      })}
    </>
  );
}

export function AgentShell({
  email,
  orgName,
  membershipRole,
  brandDisplayName,
  brandLogoUrl = null,
  brandPrimaryColor = "#0F6B4C",
  platformProductName = PLATFORM_PRODUCT_NAME,
  showCommandCentreLink = false,
  children,
}: {
  email: string;
  orgName: string;
  membershipRole: string;
  brandDisplayName: string;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string;
  platformProductName?: string;
  showCommandCentreLink?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const isProfilePage = /^\/agent\/leads\/[^/]+$/.test(pathname);
  const isChatsPage = pathname === "/agent/chats";
  const isImmersivePage = isProfilePage || isChatsPage;
  const mobileTabHrefs = new Set<string>(MOBILE_TABS.map((t) => t.href));
  const moreActive = NAV.some(
    (item) =>
      !mobileTabHrefs.has(item.href) && navActive(pathname, item.href),
  );

  const router = useRouter();
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());

  const [isProNative, setIsProNative] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const isNative = navigator.userAgent.includes("com.houzzat.pro");
    setIsProNative(isNative);
    if (!isNative) return;

    // Idle prefetch of primary CRM routes once current page stabilizes
    const timer = setTimeout(() => {
      const HIGH_VALUE_ROUTES = ["/agent", "/agent/leads", "/agent/tasks"];
      for (const route of HIGH_VALUE_ROUTES) {
        if (route !== pathname && !prefetchedRoutesRef.current.has(route)) {
          prefetchedRoutesRef.current.add(route);
          router.prefetch(route);
        }
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [pathname, router]);

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setMobileOpen(false);
      setActivityOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    setNativeStatusBarLightOverlay(activityOpen);
    return () => setNativeStatusBarLightOverlay(false);
  }, [activityOpen]);

  useStaffOverlay({
    open: mobileOpen,
    id: "agent-mobile-drawer",
    priority: STAFF_OVERLAY_PRIORITY.shellDrawer,
    onClose: () => setMobileOpen(false),
  });

  useStaffOverlay({
    open: activityOpen,
    id: "agent-activity-drawer",
    priority: STAFF_OVERLAY_PRIORITY.activity,
    onClose: () => setActivityOpen(false),
  });

  const brandMark = (
    <BrandLogoMark
      displayName={brandDisplayName}
      logoUrl={brandLogoUrl}
      primaryColor={brandPrimaryColor}
      size="sm"
    />
  );

  // If running inside the HouzzatPro Native Android/iOS Shell, switch to the 0ms instant mobile client engine
  if (isProNative) {
    return (
      <AgentMobileInstantShell
        brandDisplayName={brandDisplayName}
        orgName={orgName}
      />
    );
  }

  return (
    <div className="flex min-h-dvh bg-mist text-ink">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 z-40 hidden h-dvh shrink-0 flex-col bg-[#1e2a38] text-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-[4.25rem]" : "w-[13.5rem]",
        )}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-4">
          {!collapsed ? (
            <Link href="/agent" className="flex min-w-0 flex-1 items-center gap-2">
              {brandMark}
              <div className="min-w-0">
                <p className="truncate font-display text-lg tracking-tight text-white">
                  {brandDisplayName}
                </p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  {orgName}
                </p>
                <p className="truncate text-[10px] text-white/35">
                  {platformProductName}
                </p>
              </div>
            </Link>
          ) : (
            <Link
              href="/agent"
              className="mx-auto"
              aria-label={brandDisplayName}
            >
              {brandMark}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-md p-1.5 text-white/55 transition hover:bg-white/10 hover:text-white"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          <NavLinks pathname={pathname} collapsed={collapsed} />
          {showCommandCentreLink && !collapsed ? (
            <StaffHardLink
              href="/admin"
              className="mt-2 flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[13px] font-medium text-white/70 transition hover:bg-white/8 hover:text-white"
            >
              Command Centre
            </StaffHardLink>
          ) : null}
        </nav>

        <div className="border-t border-white/10 p-3">
          {!collapsed ? (
            <p className="mb-2 truncate text-[11px] text-white/45">
              {membershipRole} · {email}
            </p>
          ) : null}
          <SignOutButton className="text-xs text-white/70 hover:text-white" />
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
            "absolute inset-0 bg-[#0b1220]/55 backdrop-blur-[2px] transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-[#1e2a38] pt-[env(safe-area-inset-top)] text-white shadow-[8px_0_40px_rgb(0_0_0/0.35)] transition-transform duration-300 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
            <Link
              href="/agent"
              className="flex min-w-0 flex-1 items-center gap-2"
              onClick={() => setMobileOpen(false)}
            >
              {brandMark}
              <div className="min-w-0">
                <p className="truncate font-display text-lg tracking-tight text-white">
                  {brandDisplayName}
                </p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  {orgName}
                </p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="inline-flex size-11 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
            <NavLinks
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              compactLabels
            />
            {showCommandCentreLink ? (
              <StaffHardLink
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="mt-2 flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[13px] font-medium text-white/70 transition hover:bg-white/8 hover:text-white"
              >
                Command Centre
              </StaffHardLink>
            ) : null}
          </nav>
          <div className="border-t border-white/10 p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
            <p className="mb-2 truncate text-[11px] text-white/45">
              {membershipRole} · {email}
            </p>
            <p className="mb-2 text-[10px] text-white/35">
              Powered by {platformProductName}
            </p>
            <SignOutButton className="text-xs text-white/70 hover:text-white" />
          </div>
        </aside>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Desktop top bar */}
        <header className="sticky top-0 z-50 hidden h-12 items-center justify-end gap-1 border-b border-[#d8dee6] bg-[#1e2a38] px-4 text-white lg:flex">
          <ActivityGlobeButton
            open={activityOpen}
            onClick={() => setActivityOpen((v) => !v)}
          />
        </header>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-50 flex items-center gap-2 border-b border-[#d8dee6] bg-[#1e2a38] px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex size-11 items-center justify-center rounded-lg text-white/80 transition active:bg-white/10"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base tracking-tight">
              {brandDisplayName}
            </p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
              {orgName}
            </p>
          </div>
          <ActivityGlobeButton
            open={activityOpen}
            onClick={() => setActivityOpen((v) => !v)}
          />
          <Link
            href="/agent/leads?view=mine&pipeline=NEW_LEAD"
            prefetch={false}
            className="inline-flex min-h-10 items-center rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm active:scale-[0.98]"
          >
            Call new
          </Link>
        </header>

        <main
          className={cn(
            "min-w-0 flex-1",
            isImmersivePage
              ? "flex min-h-0 flex-col overflow-hidden p-0 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0"
              : "overflow-x-hidden px-3 py-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 lg:px-6 lg:pb-5",
          )}
        >
          {isImmersivePage ? (
            children
          ) : (
            <StaffPullToRefresh>{children}</StaffPullToRefresh>
          )}
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
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={item.href === "/agent/leads" ? false : true}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition active:opacity-70",
                    active ? "text-canopy" : "text-ink/45",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-xl transition",
                      active ? "bg-canopy/12" : "bg-transparent",
                    )}
                  >
                    <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.85} />
                  </span>
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition active:opacity-70",
                moreActive || mobileOpen ? "text-canopy" : "text-ink/45",
              )}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-xl transition",
                  moreActive || mobileOpen ? "bg-canopy/12" : "bg-transparent",
                )}
              >
                <Menu className="size-[18px]" strokeWidth={moreActive ? 2.2 : 1.85} />
              </span>
              More
            </button>
          </div>
        </nav>
      </div>

      <ActivityFeedDrawer
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
      />
    </div>
  );
}
