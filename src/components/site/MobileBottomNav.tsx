"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bell,
  Heart,
  Home,
  Menu,
  NotebookPen,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { RouteStartIcon } from "@/components/icons/RouteStartIcon";
import { useRoutePlanner } from "@/components/route-planner/RoutePlannerProvider";
import { cn } from "@/lib/utils";

const BOTTOM_NAV_HEIGHT = "3.5rem";

/**
 * Mobile consumer shell: Home / Search / More.
 * Moves account tools out of the tall sticky top strip.
 */
export function MobileBottomNav({ cities = [] }: { cities?: string[] }) {
  const { status, data } = useSession();
  const role = data?.user?.role;
  const pathname = usePathname() || "/";
  const routePlanner = useRoutePlanner();
  const menuId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);

  const isConsumer =
    status === "authenticated" &&
    role !== "ADMIN" &&
    role !== "AGENT";
  const immersive = pathname === "/search" || pathname.startsWith("/search?");
  const visible = isConsumer && !immersive;

  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty("--mobile-bottom-nav", "0px");
      root.dataset.mobileBottomNav = "0";
      return;
    }
    root.style.setProperty(
      "--mobile-bottom-nav",
      `calc(${BOTTOM_NAV_HEIGHT} + env(safe-area-inset-bottom, 0px))`,
    );
    root.dataset.mobileBottomNav = "1";
    return () => {
      root.style.setProperty("--mobile-bottom-nav", "0px");
      root.dataset.mobileBottomNav = "0";
    };
  }, [visible]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [moreOpen]);

  if (!visible) return null;

  const homeActive = pathname === "/";
  const searchActive = pathname.startsWith("/search");
  const accountActive = pathname.startsWith("/account");
  const routeCount = routePlanner?.count ?? 0;

  return (
    <>
      {moreOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-[55] bg-ink/35 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <div
          id={menuId}
          role="dialog"
          aria-modal="true"
          aria-label="Your Houzzat tools"
          className={cn(
            "fixed inset-x-0 z-[56] mx-auto max-w-lg md:hidden",
            "bottom-[var(--mobile-bottom-nav)]",
            "rounded-t-2xl border border-line bg-surface shadow-[0_-12px_40px_-16px_rgba(20,32,28,0.35)]",
          )}
        >
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
            <p className="font-display text-lg text-ink">Your Houzzat</p>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink/55 transition hover:bg-mist hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <nav className="max-h-[min(60vh,28rem)] space-y-1 overflow-y-auto px-2 py-2">
            <MoreLink
              href="/account/searches"
              icon={<Search className="size-4" aria-hidden />}
              label="Saved searches"
              onNavigate={() => setMoreOpen(false)}
            />
            <MoreLink
              href="/account/saved"
              icon={<Heart className="size-4" aria-hidden />}
              label="Saved listings"
              onNavigate={() => setMoreOpen(false)}
            />
            <MoreLink
              href="/account/watchlist"
              icon={<Bell className="size-4" aria-hidden />}
              label="Watchlist"
              onNavigate={() => setMoreOpen(false)}
            />
            <MoreLink
              href="/account/notes"
              icon={<NotebookPen className="size-4" aria-hidden />}
              label="Notes"
              onNavigate={() => setMoreOpen(false)}
            />
            <MoreLink
              href="/route-planner"
              icon={<RouteStartIcon className="size-4" />}
              label={
                routeCount > 0
                  ? `Route Planner · ${routeCount}`
                  : "Route Planner"
              }
              onNavigate={() => setMoreOpen(false)}
            />
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setPersonalizeOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-ink transition hover:bg-mist"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-canopy/10 text-canopy">
                <SlidersHorizontal className="size-4" aria-hidden />
              </span>
              Personalize homepage
            </button>
            <MoreLink
              href="/account"
              icon={<UserRound className="size-4" aria-hidden />}
              label="Account"
              onNavigate={() => setMoreOpen(false)}
            />
          </nav>
        </div>
      ) : null}

      <nav
        aria-label="Mobile"
        className={cn(
          "fixed inset-x-0 bottom-0 z-[57] border-t border-line/80 bg-surface/95 backdrop-blur-md md:hidden",
          "pb-[env(safe-area-inset-bottom,0px)]",
        )}
      >
        <div
          className="mx-auto grid max-w-lg grid-cols-4 px-1"
          style={{ height: BOTTOM_NAV_HEIGHT }}
        >
          <NavItem
            href="/"
            label="Home"
            active={homeActive}
            icon={<Home className="size-5" strokeWidth={2.25} aria-hidden />}
          />
          <NavItem
            href="/search"
            label="Search"
            active={searchActive}
            icon={<Search className="size-5" strokeWidth={2.25} aria-hidden />}
          />
          <button
            type="button"
            aria-label="More tools"
            aria-expanded={moreOpen}
            aria-controls={menuId}
            onClick={() => setMoreOpen((open) => !open)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold",
              moreOpen ? "text-canopy" : "text-ink/55",
            )}
          >
            <Menu className="size-5" strokeWidth={2.25} aria-hidden />
            More
          </button>
          <NavItem
            href="/account"
            label="Account"
            active={accountActive}
            icon={
              <UserRound className="size-5" strokeWidth={2.25} aria-hidden />
            }
          />
        </div>
      </nav>

      <PersonalizeHomepageModal
        open={personalizeOpen}
        onClose={() => setPersonalizeOpen(false)}
        cities={cities}
      />
    </>
  );
}

function NavItem({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition",
        active ? "text-canopy" : "text-ink/55 hover:text-ink/80",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function MoreLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-ink transition hover:bg-mist"
    >
      <span className="inline-flex size-9 items-center justify-center rounded-lg bg-canopy/10 text-canopy">
        {icon}
      </span>
      {label}
    </Link>
  );
}
