"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, UserRound, X } from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { LazyAddressAutocomplete } from "@/components/listings/LazyAddressAutocomplete";
import { StaffHardLink } from "@/components/site/StaffHardLink";
import { TenantHeaderBrand } from "@/components/tenancy/TenantHeaderBrand";
import { Button } from "@/components/ui/button";
import { pushHref } from "@/lib/listings/navigate-listing";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import { pushLocalRecentSearch } from "@/lib/listings/recent-searches-local";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

const SITE_NAV = [
  { href: "/search", label: "Search Listings" },
  { href: "/home-valuation", label: "What's my Home Worth?" },
];

const ACCOUNT_SLOT_CLASS =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full";

function resolvePortal(role: string | undefined, accountLabel: string): {
  href: string | null;
  label: string;
} {
  if (!role) {
    return { href: null, label: "Sign in" };
  }
  if (role === "ADMIN") {
    return { href: "/admin", label: "Admin" };
  }
  if (role === "AGENT") {
    return { href: "/agent", label: "Agent desk" };
  }
  return { href: "/account", label: accountLabel };
}

/**
 * Homepage only: reveal header search after the hero scrolls away.
 * Uses scroll + hysteresis (not IntersectionObserver) so iOS Safari does not
 * flicker when the sticky/fixed search chrome appears near the threshold.
 *
 * Header lives in the marketing layout Suspense; `#home-hero` is in page
 * Suspense and may mount later — always attach listeners and re-query the hero.
 */
function useHomeHeroSearchVisible() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname !== "/") {
      setVisible(false);
      return;
    }

    // Hero bottom vs viewport top. SHOW_AT < HIDE_AT → dead band (no flip).
    const SHOW_AT = 96;
    const HIDE_AT = 168;

    let frame = 0;
    let cancelled = false;

    function readVisible(prev: boolean): boolean {
      const hero = document.getElementById("home-hero");
      if (!hero) return false;
      const bottom = hero.getBoundingClientRect().bottom;
      if (!prev) return bottom <= SHOW_AT;
      return bottom < HIDE_AT;
    }

    function update() {
      frame = 0;
      if (cancelled) return;
      setVisible((prev) => {
        const next = readVisible(prev);
        return next === prev ? prev : next;
      });
    }

    function onScrollOrResize() {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    window.visualViewport?.addEventListener("resize", onScrollOrResize);
    window.visualViewport?.addEventListener("scroll", onScrollOrResize);

    // Re-check until the homepage hero streams in (sibling Suspense).
    let attempts = 0;
    function waitForHero() {
      if (cancelled) return;
      if (document.getElementById("home-hero")) {
        update();
        return;
      }
      attempts += 1;
      if (attempts < 120) {
        window.requestAnimationFrame(waitForHero);
      }
    }
    waitForHero();

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      window.visualViewport?.removeEventListener("resize", onScrollOrResize);
      window.visualViewport?.removeEventListener("scroll", onScrollOrResize);
    };
  }, [pathname]);

  return visible;
}

function BuySearchControls({
  visible,
  compact,
}: {
  visible: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AutocompleteSuggestion | null>(null);

  function goHref(href: string, label: string) {
    pushLocalRecentSearch({ label, href });
    pushHref(router, href);
  }

  function goToSuggestion(suggestion: AutocompleteSuggestion) {
    setSelected(suggestion);
    setQuery(
      suggestion.city && suggestion.province
        ? `${suggestion.label}, ${suggestion.city}, ${suggestion.province}`
        : suggestion.label,
    );
    // Soft-select a Google address — wait for Search or an around-option click.
    if (suggestion.type === "place" && !suggestion.action) {
      return;
    }
    if (suggestion.action === "near_me" && suggestion.href) {
      goHref(suggestion.href, "Near me");
      return;
    }
    if (suggestion.mlsNumber) {
      goHref(
        suggestion.href ?? `/listing/${suggestion.mlsNumber}`,
        suggestion.label,
      );
      return;
    }
    if (suggestion.href) {
      goHref(suggestion.href, suggestion.label);
      return;
    }
    if (suggestion.lat != null && suggestion.lng != null) {
      const params = new URLSearchParams({
        transactionType: "SALE",
        lat: String(suggestion.lat),
        lng: String(suggestion.lng),
      });
      if (suggestion.city) params.set("city", suggestion.city);
      goHref(`/search?${params.toString()}`, suggestion.label);
      return;
    }
    goHref(
      `/search?transactionType=SALE&q=${encodeURIComponent(suggestion.label)}`,
      suggestion.label,
    );
  }

  function onSearch(rawQuery?: string) {
    const q = (rawQuery ?? query).trim();
    if (!q) {
      router.push("/search?transactionType=SALE");
      return;
    }
    if (selected?.mlsNumber && !rawQuery) {
      goHref(
        selected.href ?? `/listing/${selected.mlsNumber}`,
        selected.label,
      );
      return;
    }
    if (selected?.href && !rawQuery) {
      goHref(selected.href, selected.label);
      return;
    }
    if (selected?.lat != null && selected?.lng != null && !rawQuery) {
      const params = new URLSearchParams({
        transactionType: "SALE",
        lat: String(selected.lat),
        lng: String(selected.lng),
      });
      if (selected.city) params.set("city", selected.city);
      goHref(`/search?${params.toString()}`, selected.label);
      return;
    }
    const parsed = parseSearchQuery(q);
    if (!parsed.transactionType) {
      parsed.transactionType = "SALE";
      parsed.hasFilters = true;
    }
    const href = searchHrefFromParsed(parsed, { transactionType: "SALE" });
    goHref(href, q);
  }

  return (
    <div
      data-search-bar
      className={cn(
        "flex items-center gap-2 rounded-md border border-line bg-surface/95 p-1 shadow-sm",
        compact && "w-full",
      )}
    >
      <div className="min-w-0 flex-1">
        <LazyAddressAutocomplete
          minChars={1}
          transactionType="SALE"
          placeholder="Search active or sold listings by MLS® #, address or neighbourhood"
          inputClassName="h-9 rounded-md border-0 bg-transparent text-[15px] shadow-none focus-visible:ring-0"
          onQueryChange={(value) => {
            setQuery(value);
            setSelected(null);
          }}
          onPlaceSelect={goToSuggestion}
          onPlaceResolved={(place) => {
            setSelected(place);
          }}
          onSearchSubmit={(q) => onSearch(q)}
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="hidden h-9 shrink-0 rounded-md px-4 sm:inline-flex"
        tabIndex={visible ? 0 : -1}
        onClick={() => onSearch()}
      >
        Search
      </Button>
    </div>
  );
}

/**
 * Sticky site header. Desktop: buy search slides into the header row.
 * Mobile: buy search is fixed below the header after the hero scrolls away
 * (out of document flow so show/hide cannot thrash scroll on iOS).
 */
export function SiteHeaderClient({
  siteName,
  primaryColor = "#1A7B59",
  accountLabel = "Your Houzzat",
  logoUrl = null,
  showLogoMark = false,
}: {
  siteName: string;
  primaryColor?: string;
  accountLabel?: string;
  logoUrl?: string | null;
  showLogoMark?: boolean;
}) {
  const { status, data } = useSession();
  const pathname = usePathname();
  const visible = useHomeHeroSearchVisible();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  const portal = useMemo(() => {
    if (status !== "authenticated" || !data?.user) {
      return { href: null as string | null, label: "Sign in" };
    }
    return resolvePortal(data.user.role, accountLabel);
  }, [status, data?.user, accountLabel]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Keep homepage sticky rails below the mobile search bar when it is showing.
  useEffect(() => {
    const root = document.documentElement;

    function syncStack() {
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      // Include status-bar safe area so sticky rails / chip scrolls clear the header.
      const base = mobile && visible ? "7.75rem" : "4rem";
      root.style.setProperty(
        "--site-header-stack",
        `calc(${base} + env(safe-area-inset-top, 0px))`,
      );
      root.dataset.mobileSearchVisible = mobile && visible ? "1" : "0";
    }

    syncStack();
    const mq = window.matchMedia("(max-width: 767px)");
    mq.addEventListener("change", syncStack);
    return () => {
      mq.removeEventListener("change", syncStack);
      root.style.setProperty("--site-header-stack", "4rem");
      root.dataset.mobileSearchVisible = "0";
    };
  }, [visible]);

  const navLinkClass =
    "rounded-md px-2.5 py-1.5 text-sm font-semibold text-ink/70 transition hover:bg-canopy/5 hover:text-canopy";

  return (
    <>
      <header id="houzzat-site-header" className="sticky top-0 z-40">
        {/* Android 15+ edge-to-edge: keep system status icons on a brand bar. */}
        <div
          aria-hidden
          className="[height:env(safe-area-inset-top,0px)]"
          style={{ backgroundColor: primaryColor }}
        />
        <div className="border-b border-line/80 bg-mist/95">
        <div className="flex h-16 w-full items-center gap-2 px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex shrink-0 items-center">
            <TenantHeaderBrand
              displayName={siteName}
              logoUrl={logoUrl}
              primaryColor={primaryColor}
              showLogoMark={showLogoMark}
            />
          </Link>

          {/* Desktop only — search stays inside the header row */}
          <div
            className={cn(
              "ml-3 hidden min-w-0 max-w-2xl flex-1 transition-[max-width,opacity,transform] duration-300 ease-out md:block",
              visible
                ? "translate-y-0 opacity-100"
                : "pointer-events-none max-w-0 -translate-y-1 overflow-hidden opacity-0",
            )}
            aria-hidden={!visible}
          >
            <BuySearchControls visible={visible} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <nav
              className="mr-1 hidden items-center gap-0.5 lg:flex"
              aria-label="Site"
            >
              {SITE_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {status === "loading" ? (
              <span
                role="status"
                aria-label="Loading account"
                aria-busy="true"
                className={cn(
                  ACCOUNT_SLOT_CLASS,
                  "animate-pulse border border-line/70 bg-mist",
                )}
              >
                <UserRound
                  className="size-5 text-ink/25"
                  strokeWidth={2}
                  aria-hidden
                />
              </span>
            ) : portal.href ? (
              <StaffHardLink
                href={portal.href}
                data-houzzat-account-target=""
                aria-label={portal.label}
                title={portal.label}
                className={cn(
                  ACCOUNT_SLOT_CLASS,
                  "relative bg-canopy text-white transition hover:bg-canopy-deep",
                  "ring-2 ring-canopy/25 ring-offset-2 ring-offset-mist",
                )}
              >
                <UserRound className="size-5" strokeWidth={2.25} aria-hidden />
                <span
                  className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-signal ring-2 ring-mist"
                  aria-hidden
                />
              </StaffHardLink>
            ) : (
              <AuthOpenButton
                mode="sign-in"
                data-houzzat-account-target=""
                aria-label={portal.label}
                title={portal.label}
                className={cn(
                  ACCOUNT_SLOT_CLASS,
                  "border border-line bg-surface text-ink/70 transition",
                  "hover:border-canopy/40 hover:text-canopy",
                )}
              >
                <UserRound className="size-5" strokeWidth={2} aria-hidden />
              </AuthOpenButton>
            )}
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink/70 transition hover:border-canopy/40 hover:text-canopy lg:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Menu className="size-5" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav
            id={menuId}
            aria-label="Site"
            className="border-t border-line/80 bg-mist/95 px-4 py-3 lg:hidden sm:px-6"
          >
            <ul className="space-y-1">
              {SITE_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-canopy/5 hover:text-canopy"
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        </div>
      </header>

      {/*
        Mobile: fixed (not sticky-in-flow). Expanding a sticky bar used to push
        the page and flip the reveal threshold → iOS flicker loop.
      */}
      <div
        className={cn(
          "fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top,0px))] z-[39] border-b border-line/80 bg-mist md:hidden",
          "transition-[opacity,transform,visibility] duration-200 ease-out",
          visible
            ? "visible translate-y-0 opacity-100"
            : "pointer-events-none invisible -translate-y-1 opacity-0",
        )}
        aria-hidden={!visible}
      >
        <div className="px-4 pb-2.5 pt-2 sm:px-6">
          <BuySearchControls visible={visible} compact />
        </div>
      </div>
    </>
  );
}
