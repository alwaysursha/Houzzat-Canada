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
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useOptionalCustomerChatController } from "@/components/customer-chat/CustomerChatProvider";
import { CUSTOMER_CHAT_PAGE_HREF } from "@/lib/customer-chat/query";
import { openGuestStartChatIntent } from "@/lib/auth/start-chat-intent";
import { useRoutePlanner } from "@/components/route-planner/RoutePlannerProvider";
import { tenantAccountLabel } from "@/lib/tenancy/marketing-presentation-brand";
import type { MarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { isRoyalCollectionOneTemplateId } from "@/lib/tenancy/templates";
import { parseHomepagePersonalizationQuery } from "@/lib/listings/homepage-personalization";
import { resolveAppShell } from "@/lib/mobile/app-shell";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { cn } from "@/lib/utils";
import royalNav from "./mobile-bottom-nav-royal.module.css";

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
  const royal = isRoyalCollectionOneTemplateId(chromeBrand?.templateId);
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
            "fixed inset-0 z-[55] transition-opacity duration-200 ease-out md:hidden",
            royal ? royalNav.veil : "bg-ink/35",
            moreVisible ? "opacity-100" : "opacity-0",
          )}
          onClick={closeMore}
        />
      ) : null}

      {moreShown ? (
        <MoreSheet
          menuId={menuId}
          moreVisible={moreVisible}
          royal={royal}
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
          "fixed inset-x-0 bottom-0 z-[57] md:hidden",
          "pb-[env(safe-area-inset-bottom,0px)]",
          royal
            ? royalNav.bar
            : "border-t border-line/80 bg-surface/95 backdrop-blur-md",
        )}
      >
        <div
          className="relative z-[1] mx-auto grid max-w-lg grid-cols-4 px-0.5"
          style={{ height: BOTTOM_NAV_HEIGHT }}
        >
          <NavItem
            href="/"
            label="Home"
            active={homeActive}
            royal={royal}
            pressed={pressedTab === "home"}
            onPressChange={(down) => setPressedTab(down ? "home" : null)}
            icon={<Home className="size-6" strokeWidth={royal ? 1.7 : 2.15} aria-hidden />}
            onSameRoute={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
          <NavItem
            href={SEARCH_HREF}
            label="Search"
            active={searchActive}
            royal={royal}
            pressed={pressedTab === "search"}
            onPressChange={(down) => setPressedTab(down ? "search" : null)}
            icon={<Search className="size-6" strokeWidth={royal ? 1.7 : 2.15} aria-hidden />}
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
            className={navItemClassName(moreOpen, pressedTab === "more", royal)}
          >
            <span className={navIconWrapClassName(moreOpen, royal)}>
              <Menu className="size-6" strokeWidth={royal ? 1.7 : 2.15} aria-hidden />
            </span>
            More
          </button>
          <NavItem
            href="/account"
            label="Account"
            active={accountActive}
            royal={royal}
            pressed={pressedTab === "account"}
            onPressChange={(down) => setPressedTab(down ? "account" : null)}
            hard
            icon={
              <UserRound className="size-6" strokeWidth={royal ? 1.7 : 2.15} aria-hidden />
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

function navItemClassName(active: boolean, pressed: boolean, royal: boolean) {
  return cn(
    "relative flex min-h-[44px] flex-col items-center justify-center gap-1 px-1",
    "leading-none transition-[color,transform] duration-150 ease-out",
    "active:scale-[0.96]",
    pressed && "scale-[0.96]",
    royal
      ? cn(
          "text-[10px] font-medium uppercase tracking-[0.16em]",
          active ? "text-[#f8edd4]" : "text-white/72",
        )
      : cn(
          "text-[11px] font-semibold tracking-wide",
          pressed && "bg-canopy/[0.07]",
          active ? "text-canopy" : "text-ink/55",
        ),
  );
}

function navIconWrapClassName(active: boolean, royal: boolean) {
  return cn(
    "relative inline-flex items-center justify-center transition-colors duration-150",
    royal ? "size-7" : cn("size-7 rounded-lg", active && "bg-canopy/10"),
  );
}

const NavItem = memo(function NavItem({
  href,
  label,
  active,
  royal,
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
  royal: boolean;
  icon: ReactNode;
  hard?: boolean;
  pressed: boolean;
  onPressChange: (down: boolean) => void;
  onWarm?: () => void;
  onSameRoute?: () => void;
}) {
  const className = navItemClassName(active, pressed, royal);
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
      <span className={navIconWrapClassName(active, royal)}>{icon}</span>
      <span>{label}</span>
      {active ? (
        <span
          aria-hidden
          className={
            royal
              ? cn(
                  "absolute inset-x-4 top-0 h-px",
                  royalNav.indicator,
                )
              : "absolute inset-x-5 top-0 h-0.5 rounded-full bg-canopy"
          }
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

function moreRowClass(royal: boolean) {
  return cn(
    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition active:scale-[0.99]",
    royal ? royalNav.row : "text-ink hover:bg-mist",
  );
}

function moreIconClass(royal: boolean) {
  return cn(
    "inline-flex size-9 items-center justify-center rounded-lg",
    royal ? royalNav.icon : "bg-canopy/10 text-canopy",
  );
}

function MoreSheet({
  menuId,
  moreVisible,
  royal,
  accountLabel,
  onClose,
  onNavigateAway,
  onPersonalize,
}: {
  menuId: string;
  moreVisible: boolean;
  royal: boolean;
  accountLabel: string;
  onClose: () => void;
  onNavigateAway: () => void;
  onPersonalize: () => void;
}) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const { openAuth } = useAuthModal();
  const chat = useOptionalCustomerChatController();
  const routePlanner = useRoutePlanner();
  const routeCount = routePlanner?.count ?? 0;

  const rowClass = moreRowClass(royal);
  const iconClass = moreIconClass(royal);

  return (
    <div
      id={menuId}
      role="dialog"
      aria-modal="true"
      aria-label={`${accountLabel} tools`}
      className={cn(
        "fixed inset-x-0 z-[56] mx-auto max-w-lg md:hidden",
        "bottom-[var(--mobile-bottom-nav)]",
        "transition-[opacity,transform] duration-200 ease-out",
        royal
          ? royalNav.sheet
          : "rounded-t-2xl border border-line bg-surface shadow-[0_-12px_40px_-16px_rgba(20,32,28,0.35)]",
        moreVisible
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          royal ? royalNav.sheetHeader : "border-b border-line/70",
        )}
      >
        <p className={cn("font-display text-lg", royal ? royalNav.sheetTitle : "text-ink")}>
          {accountLabel}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={cn(
            "rounded-lg p-1.5 transition active:scale-95",
            royal
              ? royalNav.sheetClose
              : "text-ink/55 hover:bg-mist hover:text-ink",
          )}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <nav className="max-h-[min(60vh,28rem)] space-y-1 overflow-y-auto px-2 py-2">
        {signedIn ? (
          chat ? (
            <button
              type="button"
              aria-label="Chat with your agent"
              onClick={() => {
                onNavigateAway();
                chat.open({ forceExpand: true });
              }}
              className={rowClass}
            >
              <span className={iconClass}>
                <MessageCircle className="size-4" aria-hidden />
              </span>
              Chat
            </button>
          ) : (
            <MoreLink
              href={CUSTOMER_CHAT_PAGE_HREF}
              icon={<MessageCircle className="size-4" aria-hidden />}
              label="Chat"
              royal={royal}
          onNavigate={onNavigateAway}
            />
          )
        ) : (
          <button
            type="button"
            aria-label="Chat with your agent"
            onClick={() => {
              onNavigateAway();
              openGuestStartChatIntent({
                host: window.location.hostname,
                now: Date.now(),
                store: browserCaptureIntentStore(),
                openAuth,
              });
            }}
            className={rowClass}
          >
            <span className={iconClass}>
              <MessageCircle className="size-4" aria-hidden />
            </span>
            Chat
          </button>
        )}
        <MoreLink
          href="/account/notifications"
          icon={<Bell className="size-4" aria-hidden />}
          label="Notifications"
          royal={royal}
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/account/searches"
          icon={<Search className="size-4" aria-hidden />}
          label="Saved searches"
          royal={royal}
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/account/saved"
          icon={<Heart className="size-4" aria-hidden />}
          label="Saved listings"
          royal={royal}
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/account/watchlist"
          icon={<Bell className="size-4" aria-hidden />}
          label="Watchlist"
          royal={royal}
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/account/notes"
          icon={<NotebookPen className="size-4" aria-hidden />}
          label="Notes"
          royal={royal}
          onNavigate={onNavigateAway}
        />
        <MoreLink
          href="/route-planner"
          icon={<RouteStartIcon className="size-4 text-current" />}
          label={
            routeCount > 0
              ? `Route Planner · ${routeCount}`
              : "Route Planner"
          }
          royal={royal}
          onNavigate={onNavigateAway}
        />
        <button
          type="button"
          onClick={onPersonalize}
          className={rowClass}
        >
          <span className={iconClass}>
            <SlidersHorizontal className="size-4" aria-hidden />
          </span>
          Personalize homepage
        </button>
        <MoreLink
          href="/account"
          icon={<UserRound className="size-4" aria-hidden />}
          label="Account"
          royal={royal}
          onNavigate={onNavigateAway}
        />
        <div className={cn("px-3 py-2", royal ? royalNav.sheetRule : "border-t border-line/70")}>
          {signedIn ? (
            <SignOutButton
              label="Log out"
              className={cn(
                "flex w-full items-center justify-center rounded-xl px-3 py-3 text-sm font-semibold",
                royal
                  ? royalNav.quiet
                  : "border border-line bg-mist/60 text-ink hover:border-danger/40 hover:bg-danger/5 hover:text-danger",
              )}
            />
          ) : status === "loading" ? (
            <div
              className={cn(
                "flex w-full items-center justify-center rounded-xl px-3 py-3 text-sm font-semibold",
                royal
                  ? royalNav.quiet
                  : "border border-line bg-mist/40 text-ink/40",
              )}
              aria-busy
            >
              …
            </div>
          ) : (
            <AuthOpenButton
              mode="sign-in"
              callbackUrl="/"
              onClick={onNavigateAway}
              className={cn(
                "flex w-full items-center justify-center rounded-xl px-3 py-3 text-sm font-semibold",
                royal
                  ? royalNav.signIn
                  : "border border-canopy/30 bg-canopy/10 text-canopy-deep hover:border-canopy/50 hover:bg-canopy/15",
              )}
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
  royal,
  onNavigate,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  royal: boolean;
  onNavigate: () => void;
}) {
  const className = moreRowClass(royal);
  const body = (
    <>
      <span className={moreIconClass(royal)}>{icon}</span>
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
