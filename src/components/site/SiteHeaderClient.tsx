"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, UserRound, X } from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { LanguageToggle } from "@/components/site/LanguageToggle";
import { Button } from "@/components/ui/button";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import { pushLocalRecentSearch } from "@/lib/listings/recent-searches-local";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { t, type Locale } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const SITE_NAV = [
  { href: "/search?view=map", labelKey: "nav_map_search" as const },
  { href: "/home-valuation", labelKey: "nav_home_worth" as const },
];

function useHomeHeroSearchVisible() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname !== "/") {
      setVisible(false);
      return;
    }

    const hero = document.getElementById("home-hero");
    if (!hero) {
      setVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0,
        rootMargin: "-135px 0px 0px 0px",
      },
    );

    observer.observe(hero);
    return () => observer.disconnect();
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
    router.push(href);
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
      goHref(`/listing/${suggestion.mlsNumber}`, suggestion.label);
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
      goHref(`/listing/${selected.mlsNumber}`, selected.label);
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
        "flex items-center gap-2 rounded-md border border-line bg-surface/95 p-1 shadow-sm backdrop-blur",
        compact && "w-full",
      )}
    >
      <div className="min-w-0 flex-1">
        <AddressAutocomplete
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
 * Mobile: buy search sticks in a bar below the header after the hero scrolls away.
 */
export function SiteHeaderClient({
  siteName,
  locale,
  portalHref,
  portalLabel,
}: {
  siteName: string;
  locale: Locale;
  portalHref: string | null;
  portalLabel: string;
}) {
  const pathname = usePathname();
  const visible = useHomeHeroSearchVisible();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

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
      // header 4rem + search bar (~3.25rem) + small gap
      root.style.setProperty(
        "--site-header-stack",
        mobile && visible ? "7.75rem" : "4rem",
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
      <header className="sticky top-0 z-40 border-b border-line/80 bg-mist/85 backdrop-blur-md">
        <div className="flex h-16 w-full items-center gap-2 px-4 sm:px-6 lg:px-10">
          <Link
            href="/"
            className="shrink-0 font-display text-2xl tracking-tight text-ink"
          >
            {siteName}
          </Link>

          {/* Desktop only — search stays inside the header row */}
          <div
            className={cn(
              "ml-3 hidden min-w-0 max-w-xl flex-1 transition-[max-width,opacity,transform] duration-300 ease-out md:block",
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
                  {t(locale, item.labelKey)}
                </Link>
              ))}
            </nav>
            <LanguageToggle locale={locale} />
            {portalHref ? (
              <Link
                href={portalHref}
                data-houzzat-account-target=""
                aria-label={portalLabel}
                title={portalLabel}
                className={cn(
                  "relative inline-flex size-10 items-center justify-center rounded-full",
                  "bg-canopy text-white transition hover:bg-canopy-deep",
                  "ring-2 ring-canopy/25 ring-offset-2 ring-offset-mist",
                )}
              >
                <UserRound className="size-5" strokeWidth={2.25} aria-hidden />
                <span
                  className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-signal ring-2 ring-mist"
                  aria-hidden
                />
              </Link>
            ) : (
              <AuthOpenButton
                mode="sign-in"
                data-houzzat-account-target=""
                aria-label={portalLabel}
                title={portalLabel}
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-full",
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
                    {t(locale, item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      {/* Mobile only — sticky below header, above hero (hero is z-[35]) */}
      <div
        className={cn(
          "sticky top-16 z-[39] border-b border-line/80 bg-mist/85 backdrop-blur-md transition-[opacity,transform,max-height,padding] duration-300 ease-out md:hidden",
          visible
            ? "max-h-24 translate-y-0 px-4 pb-2.5 pt-2 opacity-100 sm:px-6"
            : "pointer-events-none max-h-0 -translate-y-2 overflow-hidden px-4 py-0 opacity-0 sm:px-6",
        )}
        aria-hidden={!visible}
      >
        <BuySearchControls visible={visible} compact />
      </div>
    </>
  );
}
