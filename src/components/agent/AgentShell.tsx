"use client";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  Inbox,
  LayoutDashboard,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Users,
  UsersRound,
} from "lucide-react";
import { useState } from "react";

const NAV = [
  { href: "/agent", label: "Launchpad", icon: LayoutDashboard, exact: true },
  { href: "/agent/leads", label: "Leads", icon: Users },
  { href: "/agent/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/agent/appointments", label: "Calendar", icon: CalendarDays },
  { href: "/agent/inbox", label: "Communications", icon: Inbox },
  { href: "/agent/cma", label: "CMA", icon: LineChart },
  { href: "/agent/team", label: "Team", icon: UsersRound },
  { href: "/search", label: "Properties", icon: Search },
] as const;

export function AgentShell({
  email,
  orgName,
  membershipRole,
  children,
}: {
  email: string;
  orgName: string;
  membershipRole: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isProfilePage = /^\/agent\/leads\/[^/]+$/.test(pathname);

  return (
    <div className="flex min-h-dvh bg-[#eef1f4] text-ink">
      <aside
        className={cn(
          "sticky top-0 flex h-dvh shrink-0 flex-col bg-[#1e2a38] text-white transition-[width] duration-200",
          collapsed ? "w-[4.25rem]" : "w-[13.5rem]",
        )}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-4">
          {!collapsed ? (
            <Link href="/agent" className="min-w-0 flex-1">
              <p className="truncate font-display text-lg tracking-tight text-white">
                {SITE_NAME}
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                {orgName}
              </p>
            </Link>
          ) : (
            <Link
              href="/agent"
              className="mx-auto flex size-9 items-center justify-center rounded-md bg-canopy font-display text-sm text-white"
              aria-label={SITE_NAME}
            >
              H
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
          {NAV.map((item) => {
            const exact = "exact" in item && item.exact;
            const active = exact
              ? pathname === item.href
              : pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition",
                  active
                    ? "bg-[#2b6cb0] text-white"
                    : "text-white/70 hover:bg-white/8 hover:text-white",
                  collapsed && "justify-center px-2",
                )}
              >
                {active ? (
                  <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-[#7dd3fc]" />
                ) : null}
                <Icon className="size-4 shrink-0" strokeWidth={1.85} />
                {!collapsed ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
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

      <main
        className={cn(
          "min-w-0 flex-1",
          isProfilePage
            ? "overflow-hidden p-0"
            : "px-3 py-4 sm:px-5 sm:py-5 lg:px-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}
