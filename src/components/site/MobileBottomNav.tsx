"use client";

import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bell,
  Heart,
  Home,
  Menu,
  MessageCircle,
  NotebookPen,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { RouteStartIcon } from "@/components/icons/RouteStartIcon";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { CUSTOMER_CHAT_PAGE_HREF } from "@/lib/customer-chat/query";
import { useRoutePlanner } from "@/components/route-planner/RoutePlannerProvider";
import { tenantAccountLabel } from "@/lib/tenancy/marketing-presentation-brand";
import type { MarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { parseHomepagePersonalizationQuery } from "@/lib/listings/homepage-personalization";
import { resolveAppShell } from "@/lib/mobile/app-shell";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { cn } from "@/lib/utils";

/** Compact bar; each cell still clears a ≥44px touch target. */
const BOTTOM_NAV_HEIGHT = "3.75rem";
const FADE_MS = 180;
const SEARCH_HREF = "/search";

type MoreHistoryState = {
  houzzatMoreMenu?: boolean;
};

function isAccountHref(href: string) {
  return href === "/account" || href.startsWith("/account/");
}

/**
 * Mobile consumer shell: Home / Search / More / Account.
 * Moves account tools out of the tall sticky top strip.
 *
 * Shell renders immediately (loading + guest + consumer). Hidden only once
 * session confirms ADMIN/AGENT. Account /account/* use full document loads
 * so Capacitor avoids soft RSC into the force-dynamic account layout.
 */
export function MobileBottomNav({
  cities = [],
  chromeBrand,
}: {
  cities?: string[];
  chromeBrand?: MarketingChromeBrand;
}) {
  const { status, data } = useSession();
  const role = data?.user?.role;
  const pathname = usePathname() || "/";
  const router = useRouter();
  const menuId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreShown, setMoreShown] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [personalizeSearch, setPersonalizeSearch] = useState<{
    id: string;
    name: string;
    query: Record<string, unknown>;
  } | null>(null);
  const [houzzatProShell, setHouzzatProShell] = useState(false);
  const accountLabel = chromeBrand
    ? tenantAccountLabel(chromeBrand)
    : "Your Houzzat";
  const [pressedTab, setPressedTab] = useState<string | null>(null);
  const moreHistoryPushedRef = useRef(false);
  const searchPrefetchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void resolveAppShell().then((shell) => {
      if (!cancelled) setHouzzatProShell(shell === "houzzatpro");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isStaff =
    status === "authenticated" &&
    (role === "ADMIN" || role === "AGENT");
  // HouzzatPro launches into staff chrome — never show consumer bottom tabs.
  const visible = !isStaff && !houzzatProShell;

  useLayoutEffect(() => {
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

  // Warm Search after Home is idle — not on every route, no account/maps.
  useEffect(() => {
    if (!visible) return;
    if (pathname !== "/") return;
    if (searchPrefetchedRef.current) return;
    return scheduleAfterFirstPaint(
      () => {
        if (searchPrefetchedRef.current) return;
        searchPrefetchedRef.current = true;
        try {
          router.prefetch(SEARCH_HREF);
        } catch {
          // ignore
        }
      },
      { timeoutMs: 2_400 },
    );
  }, [visible, pathname, router]);

  useEffect(() => {
    setMoreOpen(false);
    // Drop synthetic More history if a tab navigation closed the sheet.
    if (moreHistoryPushedRef.current) {
      moreHistoryPushedRef.current = false;
      const state = window.history.state as MoreHistoryState | null;
      if (state?.houzzatMoreMenu) {
        const rest = { ...state };
        delete rest.houzzatMoreMenu;
        window.history.replaceState(rest, "");
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    return acquireScrollLock();
  }, [moreOpen]);

  useEffect(() => {
    if (moreOpen) {
      setMoreShown(true);
      const frame = window.requestAnimationFrame(() => setMoreVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setMoreVisible(false);
    const timer = window.setTimeout(() => setMoreShown(false), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [moreOpen]);

  // Hardware / browser Back closes More without changing Cap Back wiring:
  // Cap already calls history.back() when canGoBack.
  useEffect(() => {
    if (!moreOpen) {
      moreHistoryPushedRef.current = false;
      return;
    }

    const prev = (window.history.state ?? {}) as MoreHistoryState;
    if (!prev.houzzatMoreMenu) {
      window.history.pushState({ ...prev, houzzatMoreMenu: true }, "");
      moreHistoryPushedRef.current = true;
    }

    const onPopState = () => {
      moreHistoryPushedRef.current = false;
      setMoreOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [moreOpen]);

  /** Close More via UI (X / backdrop). Pops the synthetic history entry. */
  function closeMore() {
    if (
      moreHistoryPushedRef.current &&
      (window.history.state as MoreHistoryState | null)?.houzzatMoreMenu
    ) {
      moreHistoryPushedRef.current = false;
      window.history.back();
      return;
    }
    setMoreOpen(false);
  }

  /**
   * Dismiss More before a real navigation (More link tap).
   * Clears the synthetic entry without history.back() racing the next route.
   */
  function dismissMoreForNavigate() {
    moreHistoryPushedRef.current = false;
    setMoreOpen(false);
    const state = window.history.state as MoreHistoryState | null;
    if (state?.houzzatMoreMenu) {
      const rest = { ...state };
      delete rest.houzzatMoreMenu;
      window.history.replaceState(rest, "");
    }
  }

  function warmSearch() {
    if (searchPrefetchedRef.current) return;
    searchPrefetchedRef.current = true;
    try {
      router.prefetch(SEARCH_HREF);
    } catch {
      // ignore
    }
  }

  if (!visible) return null;

  const homeActive = pathname === "/";
  const searchActive = pathname.startsWith("/search");
  const accountActive = pathname.startsWith("/account");

  return (
    <>
      {moreShown ? (
        <button
          type="button"
          aria-label="Close menu"
          className={cn(
            "fixed inset-0 z-[55] bg-ink/35 transition-opacity duration-200 ease-out md:hidden",
            moreVisible ? "opacity-100" : "opacity-0",
          )}
          onClick={closeMore}
        />
      ) : null}

      {moreShown ? (
        <MoreSheet
          menuId={menuId}
          moreVisible={moreVisible}
          accountLabel={accountLabel}
          onClose={closeMore}
          onNavigateAway={dismissMoreForNavigate}
          onPersonalize={() => {
            dismissMoreForNavigate();
            void (async () => {
              try {
                const res = await fetch("/api/saved-searches");
                if (res.ok) {
                  const json = (await res.json()) as {
                    items?: Array<{
                      id: string;
                      name: string;
                      query: unknown;
                      isHomepageActive?: boolean;
                    }>;
                  };
                  const active =
                    json.items?.find((item) => item.isHomepageActive) ?? null;
                  setPersonalizeSearch(
                    active
                      ? {
                          id: active.id,
                          name: active.name,
                          query:
                            typeof active.query === "object" &&
                            active.query != null
                              ? (active.query as Record<string, unknown>)
                              : {},
                        }
                      : null,
                  );
                } else {
                  setPersonalizeSearch(null);
                }
              } catch {
                setPersonalizeSearch(null);
              }
              setPersonalizeOpen(true);
            })();
          }}
        />
      ) : null}

      <nav
        aria-label="Mobile"
        className={cn(
          "fixed inset-x-0 bottom-0 z-[57] border-t border-line/80 bg-surface/95 backdrop-blur-md md:hidden",
          "pb-[env(safe-area-inset-bottom,0px)]",
        )}
      >
        <div
          className="mx-auto grid max-w-lg grid-cols-4 px-0.5"
          style={{ height: BOTTOM_NAV_HEIGHT }}
        >
          <NavItem
            href="/"
            label="Home"
            active={homeActive}
            pressed={pressedTab === "home"}
            onPressChange={(down) => setPressedTab(down ? "home" : null)}
            icon={<Home className="size-6" strokeWidth={2.15} aria-hidden />}
            onSameRoute={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
          <NavItem
            href={SEARCH_HREF}
            label="Search"
            active={searchActive}
            pressed={pressedTab === "search"}
            onPressChange={(down) => setPressedTab(down ? "search" : null)}
            icon={<Search className="size-6" strokeWidth={2.15} aria-hidden />}
            onWarm={warmSearch}
          />
          <button
            type="button"
            aria-label="More tools"
            aria-expanded={moreOpen}
            aria-controls={menuId}
            onPointerDown={() => setPressedTab("more")}
            onPointerUp={() => setPressedTab(null)}
            onPointerCancel={() => setPressedTab(null)}
            onPointerLeave={() => setPressedTab(null)}
            onClick={() => {
              if (moreOpen) closeMore();
              else setMoreOpen(true);
            }}
            className={navItemClassName(moreOpen, pressedTab === "more")}
          >
            <span className={navIconWrapClassName(moreOpen)}>
              <Menu className="size-6" strokeWidth={2.15} aria-hidden />
            </span>
            More
          </button>
          <NavItem
            href="/account"
            label="Account"
            active={accountActive}
            pressed={pressedTab === "account"}
            onPressChange={(down) => setPressedTab(down ? "account" : null)}
            hard
            icon={
              <UserRound className="size-6" strokeWidth={2.15} aria-hidden />
            }
          />
        </div>
      </nav>

      <PersonalizeHomepageModal
        open={personalizeOpen}
        onClose={() => {
          setPersonalizeOpen(false);
          setPersonalizeSearch(null);
        }}
        cities={cities}
        searchId={personalizeSearch?.id}
        initial={
          personalizeSearch
            ? {
                name: personalizeSearch.name,
                ...parseHomepagePersonalizationQuery(personalizeSearch.query),
              }
            : undefined
        }
      />
    </>
  );
}

function navItemClassName(active: boolean, pressed: boolean) {
  return cn(
    "relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1",
    "text-[11px] font-semibold leading-none tracking-wide",
    "transition-[color,background-color,transform,opacity] duration-75 ease-out",
    "active:scale-[0.96]",
    pressed && "scale-[0.96] bg-canopy/[0.07]",
    active ? "text-canopy" : "text-ink/55",
  );
}

function navIconWrapClassName(active: boolean) {
  return cn(
    "relative inline-flex size-7 items-center justify-center rounded-lg transition-colors duration-75",
    active && "bg-canopy/10",
  );
}

const NavItem = memo(function NavItem({
  href,
  label,
  active,
  icon,
  hard = false,
  pressed,
  onPressChange,
  onWarm,
  onSameRoute,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  hard?: boolean;
  pressed: boolean;
  onPressChange: (down: boolean) => void;
  onWarm?: () => void;
  onSameRoute?: () => void;
}) {
  const className = navItemClassName(active, pressed);
  const pressProps = {
    onPointerDown: () => {
      onPressChange(true);
      onWarm?.();
    },
    onPointerUp: () => onPressChange(false),
    onPointerCancel: () => onPressChange(false),
    onPointerLeave: () => onPressChange(false),
  };

  const body = (
    <>
      <span className={navIconWrapClassName(active)}>{icon}</span>
      <span>{label}</span>
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-canopy"
        />
      ) : null}
    </>
  );

  if (hard) {
    return (
      <a
        href={href}
        className={className}
        aria-current={active ? "page" : undefined}
        {...pressProps}
      >
        {body}
      </a>
    );
  }

  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      aria-current={active ? "page" : undefined}
      {...pressProps}
      onClick={(event) => {
        if (active && onSameRoute) {
          event.preventDefault();
          onSameRoute();
        }
      }}
    >
      {body}
    </Link>
  );
});

function MoreSheet({
  menuId,
  moreVisible,
  accountLabel,
  onClose,
  onNavigateAway,
  onPersonalize,
}: {
  menuId: string;
  moreVisible: boolean;
  accountLabel: string;
  onClose: () => void;
  onNavigateAway: () => void;
  onPersonalize: () => void;
}) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const routePlanner = useRoutePlanner();
  const routeCount = routePlanner?.count ?? 0;

  return (
    <div
      id={menuId}
      role="dialog"
      aria-modal="true"
      aria-label={`${accountLabel} tools`}
      className={cn(
        "fixed inset-x-0 z-[56] mx-auto max-w-lg md:hidden",
        "bottom-[var(--mobile-bottom-nav)]",
        "rounded-t-2xl border border-line bg-surface shadow-[0_-12px_40px_-16px_rgba(20,32,28,0.35)]",
        "transition-[opacity,transform] duration-200 ease-out",
        moreVisible
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0",
      )}
    >
      <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
        <p className="font-display text-lg text-ink">{accountLabel}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1.5 text-ink/55 transition hover:bg-mist hover:text-ink active:scale-95"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <nav className="max-h-[min(60vh,28rem)] space-y-1 overflow-y-auto px-2 py-2">
        {signedIn ? (
          <MoreLink
            href={CUSTOMER_CHAT_PAGE_HREF}
            icon={<MessageCircle className="size-4" aria-hidden />}
            label="Chat"
            onNavigate={onNavigateAway}
          />
        ) : (
          <AuthOpenButton
            mode="sign-in"
            callbackUrl={CUSTOMER_CHAT_PAGE_HREF}
            onClick={onNavigateAway}
            aria-label="Chat with your agent"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-ink transition hover:bg-mist active:scale-[0.99]"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-canopy/10 text-canopy">
              <MessageCircle className="size-4" aria-hidden />
            </span>
            Chat
          </AuthOpenButton>
        )}
        <MoreLink
          href="/account/notifications"
          icon={<Bell className="size-4" aria-hidden />}
          label="Notifications"
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/account/searches"
          icon={<Search className="size-4" aria-hidden />}
          label="Saved searches"
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/account/saved"
          icon={<Heart className="size-4" aria-hidden />}
          label="Saved listings"
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/account/watchlist"
          icon={<Bell className="size-4" aria-hidden />}
          label="Watchlist"
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/account/notes"
          icon={<NotebookPen className="size-4" aria-hidden />}
          label="Notes"
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/route-planner"
          icon={<RouteStartIcon className="size-4" />}
          label={
            routeCount > 0
              ? `Route Planner · ${routeCount}`
              : "Route Planner"
          }
          onNavigate={onNavigateAway}
        />
        <button
          type="button"
          onClick={onPersonalize}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-ink transition hover:bg-mist active:scale-[0.99]"
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
          onNavigate={onNavigateAway}
        />
        <div className="border-t border-line/70 px-3 py-2">
          {signedIn ? (
            <SignOutButton
              label="Log out"
              className="flex w-full items-center justify-center rounded-xl border border-line bg-mist/60 px-3 py-3 text-sm font-semibold text-ink hover:border-danger/40 hover:bg-danger/5 hover:text-danger"
            />
          ) : status === "loading" ? (
            <div
              className="flex w-full items-center justify-center rounded-xl border border-line bg-mist/40 px-3 py-3 text-sm font-semibold text-ink/40"
              aria-busy
            >
              …
            </div>
          ) : (
            <AuthOpenButton
              mode="sign-in"
              callbackUrl="/"
              onClick={onNavigateAway}
              className="flex w-full items-center justify-center rounded-xl border border-canopy/30 bg-canopy/10 px-3 py-3 text-sm font-semibold text-canopy-deep hover:border-canopy/50 hover:bg-canopy/15"
            >
              Sign in
            </AuthOpenButton>
          )}
        </div>
      </nav>
    </div>
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
  const className =
    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-ink transition hover:bg-mist active:scale-[0.99]";
  const body = (
    <>
      <span className="inline-flex size-9 items-center justify-center rounded-lg bg-canopy/10 text-canopy">
        {icon}
      </span>
      {label}
    </>
  );

  if (isAccountHref(href)) {
    return (
      <a href={href} onClick={onNavigate} className={className}>
        {body}
      </a>
    );
  }

  return (
    <Link href={href} prefetch={false} onClick={onNavigate} className={className}>
      {body}
    </Link>
  );
}
