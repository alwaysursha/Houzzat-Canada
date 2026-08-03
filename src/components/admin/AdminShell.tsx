"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  Construction,
  Handshake,
  LayoutDashboard,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  Search,
  Users,
  Eye,
} from "lucide-react";
import { useState } from "react";
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
  { href: "/admin/pre-construction", label: "Pre-construction", icon: Construction },
  { href: "/agent", label: "CRM desk", icon: Briefcase },
  { href: "/search", label: "Search", icon: Search },
] as const;

type DeskAgent = { id: string; name: string | null; email: string };

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

  return (
    <div className="min-h-dvh bg-[linear-gradient(165deg,rgb(238_243_240)_0%,rgb(255_255_255)_45%,rgb(244_247_245)_100%)]">
      <div className="mx-auto flex min-h-dvh max-w-[1600px]">
        <aside
          className={cn(
            "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-line/80 bg-surface/95 backdrop-blur-md transition-[width] duration-200",
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
                className="mx-auto font-display text-lg text-canopy"
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
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                    active
                      ? "bg-canopy/10 text-canopy"
                      : "text-ink/65 hover:bg-mist hover:text-ink",
                    collapsed && "justify-center px-2",
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={2.1} />
                  {!collapsed ? <span>{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-line/70 p-3">
            {!collapsed ? (
              <p className="mb-2 truncate text-xs text-ink/45">{email}</p>
            ) : null}
            <SignOutButton className={cn("w-full", collapsed && "px-2")} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/40">
                  Houzzat control center
                </p>
                <p className="text-sm text-ink/60">
                  People · visitors · growth · operations
                </p>
              </div>
              <Link
                href="/"
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-canopy/40 hover:text-canopy"
              >
                View site
              </Link>
            </div>
          </header>
          <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
