"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { PropertyType } from "@prisma/client";
import { X } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { CityMultiInput } from "@/components/home/CityMultiInput";
import { PriceRangeSlider } from "@/components/home/PriceRangeSlider";
import type { SearchFilters } from "@/components/listings/SearchFilterChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  openGuestSaveSearchIntent,
  retainSaveSearchIntentHandler,
  withHomepageApplyCaptureFlag,
} from "@/lib/auth/save-search-intent";
import { propertyTypeLabel } from "@/lib/listings/constants";
import {
  HOMEPAGE_PRICE_SLIDER_MAX,
  HOMEPAGE_SEARCH_DEFAULT_NAME,
} from "@/lib/listings/homepage-personalization";
import {
  committedFromHomepagePersonalizationQuery,
  homepageSearchHrefFromCommitted,
  type HomepageSearchSourceKind,
} from "@/lib/listings/homepage-search-source";
import {
  isGenericSavedSearchName,
  resolveSavedSearchName,
  savedSearchDisplayName,
} from "@/lib/listings/saved-search-query";
import { saveActiveSearchMemory } from "@/lib/listings/search-state/active-search-memory";
import { hardGo } from "@/lib/mobile/nav-back";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";
import { visualViewportOverlayStyle } from "@/lib/visual-viewport-overlay-style";

const RESIDENTIAL_TYPES: PropertyType[] = [
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
  "VACANT_LAND",
  "OTHER",
];

const BED_OPTIONS = ["1", "2", "3", "4", "5"] as const;
const BATH_OPTIONS = ["1", "2", "3", "4"] as const;

export type PersonalizeHomepageInitial = {
  name?: string;
  minPrice?: string;
  maxPrice?: string;
  minBeds?: string;
  minBaths?: string;
  propertyTypes?: string[];
  city?: string;
  cities?: string[];
  communities?: string[];
  transactionType?: "SALE" | "LEASE" | "ALL";
};

function parsePrice(value?: string) {
  if (!value?.trim()) return null;
  const n = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function draftFiltersForName(input: {
  minPrice: number;
  maxPrice: number;
  minBeds: string;
  minBaths: string;
  propertyTypes: string[];
  cities: string[];
  transactionType: "SALE" | "LEASE" | "ALL";
}) {
  return {
    segment: "RESIDENTIAL" as const,
    transactionType: input.transactionType,
    dataSource: "" as const,
    city: input.cities.length === 1 ? input.cities[0]! : "",
    community: "",
    propertyTypes: input.propertyTypes as PropertyType[],
    minPrice: input.minPrice > 0 ? String(input.minPrice) : "",
    maxPrice:
      input.maxPrice < HOMEPAGE_PRICE_SLIDER_MAX
        ? String(input.maxPrice)
        : "",
    minBeds: input.minBeds,
    minBaths: input.minBaths,
    openHouseOnly: false,
    statuses: ["ACTIVE"] as SearchFilters["statuses"],
    sort: "newest" as const,
  };
}

function seedFromInitial(initial?: PersonalizeHomepageInitial) {
  const initialCities =
    initial?.cities?.length
      ? initial.cities
      : initial?.city
        ? [initial.city]
        : [];
  const draft = {
    minPrice: parsePrice(initial?.minPrice) ?? 0,
    maxPrice: parsePrice(initial?.maxPrice) ?? HOMEPAGE_PRICE_SLIDER_MAX,
    minBeds: initial?.minBeds?.trim() || "",
    minBaths: initial?.minBaths?.trim() || "",
    propertyTypes: initial?.propertyTypes ? [...initial.propertyTypes] : [],
    cities: [...initialCities],
    transactionType: initial?.transactionType ?? ("SALE" as const),
  };
  const autoName = savedSearchDisplayName(draftFiltersForName(draft), {
    cities: draft.cities,
  });
  const existing = initial?.name?.trim() || "";
  return {
    ...draft,
    name:
      existing && !isGenericSavedSearchName(existing) ? existing : autoName,
  };
}

export function PersonalizeHomepageModal({
  open,
  onClose,
  cities: _popularCities,
  initial,
  searchId,
  sourceKind,
}: {
  open: boolean;
  onClose: () => void;
  /** Kept for call-site compatibility; cities are typed manually now. */
  cities?: string[];
  searchId?: string;
  /** Which homepage source opened the editor (for copy / Active Search sync). */
  sourceKind?: HomepageSearchSourceKind;
  initial?: PersonalizeHomepageInitial;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: sessionStatus } = useSession();
  const { openAuth } = useAuthModal();
  const { confirm, toast } = useSiteAlert();
  const signedIn = sessionStatus === "authenticated";
  const seededOpenRef = useRef(false);
  const [name, setName] = useState(HOMEPAGE_SEARCH_DEFAULT_NAME);
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(HOMEPAGE_PRICE_SLIDER_MAX);
  const [minBeds, setMinBeds] = useState("");
  const [minBaths, setMinBaths] = useState("");
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [transactionType, setTransactionType] = useState<"SALE" | "LEASE" | "ALL">(
    "SALE",
  );
  const [pending, setPending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Snapshot criteria once when the dialog opens — Cancel discards drafts.
  useEffect(() => {
    if (!open) {
      seededOpenRef.current = false;
      return;
    }
    if (seededOpenRef.current) return;
    seededOpenRef.current = true;
    const seed = seedFromInitial(initial);
    setName(seed.name);
    setMinPrice(seed.minPrice);
    setMaxPrice(seed.maxPrice);
    setMinBeds(seed.minBeds);
    setMinBaths(seed.minBaths);
    setPropertyTypes(seed.propertyTypes);
    setCities(seed.cities);
    setTransactionType(seed.transactionType);
    setError(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const release = acquireScrollLock();
    return () => {
      document.removeEventListener("keydown", onKey);
      release();
    };
  }, [open, onClose]);

  // Pin to visual viewport (keyboard / Android Chrome / iOS Safari resize).
  useEffect(() => {
    if (!open) return;

    function syncViewport() {
      const el = overlayRef.current;
      if (!el) return;
      const style = visualViewportOverlayStyle(window.visualViewport);
      el.style.left = style.left;
      el.style.top = style.top;
      el.style.width = style.width;
      el.style.height = style.height;
      el.style.right = style.right;
      el.style.bottom = style.bottom;
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      const el = overlayRef.current;
      if (!el) return;
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.right = "";
      el.style.bottom = "";
    };
  }, [open, mounted]);

  // Keep SAVE_SEARCH resume registered while this editor exists (guest Save & Apply).
  useEffect(() => {
    return retainSaveSearchIntentHandler({
      onSaved: () => {
        toast({ message: "Homepage search saved.", tone: "success" });
        window.dispatchEvent(
          new Event("houzzat:homepage-personalization-changed"),
        );
        window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
        if (pathname === "/") router.refresh();
      },
      onFailed: () => {
        toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      },
    });
  }, [toast, pathname, router]);

  function syncActiveSearchMemory() {
    const committed = committedFromHomepagePersonalizationQuery({
      minPrice: minPrice > 0 ? String(minPrice) : undefined,
      maxPrice:
        maxPrice < HOMEPAGE_PRICE_SLIDER_MAX ? String(maxPrice) : undefined,
      minBeds: minBeds || undefined,
      minBaths: minBaths || undefined,
      propertyTypes: propertyTypes.length ? propertyTypes : undefined,
      cities: cities.length ? cities : undefined,
      city: cities.length === 1 ? cities[0] : undefined,
      transactionType,
    });
    saveActiveSearchMemory(homepageSearchHrefFromCommitted(committed));
  }

  function goHomeAndRefresh() {
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    window.dispatchEvent(
      new Event("houzzat:homepage-personalization-changed"),
    );
    onClose();
    if (pathname === "/") {
      router.refresh();
      return;
    }
    hardGo("/");
  }

  function toggleType(type: PropertyType) {
    setPropertyTypes((current) =>
      current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type],
    );
  }

  function draftCommitted() {
    return committedFromHomepagePersonalizationQuery({
      minPrice: minPrice > 0 ? String(minPrice) : undefined,
      maxPrice:
        maxPrice < HOMEPAGE_PRICE_SLIDER_MAX ? String(maxPrice) : undefined,
      minBeds: minBeds || undefined,
      minBaths: minBaths || undefined,
      propertyTypes: propertyTypes.length ? propertyTypes : undefined,
      cities: cities.length ? cities : undefined,
      city: cities.length === 1 ? cities[0] : undefined,
      transactionType,
    });
  }

  async function onSave() {
    setPending(true);
    setError(null);

    const query: Record<string, unknown> = {};
    if (minPrice > 0) query.minPrice = String(minPrice);
    if (maxPrice < HOMEPAGE_PRICE_SLIDER_MAX) {
      query.maxPrice = String(maxPrice);
    }
    if (minBeds) query.minBeds = minBeds;
    if (minBaths) query.minBaths = minBaths;
    if (propertyTypes.length) query.propertyTypes = propertyTypes;
    if (cities.length === 1) query.city = cities[0];
    if (cities.length > 1) query.cities = cities;
    if (transactionType !== "SALE") query.transactionType = transactionType;

    const searchName = resolveSavedSearchName({
      existingName: name,
      filters: draftFiltersForName({
        minPrice,
        maxPrice,
        minBeds,
        minBaths,
        propertyTypes,
        cities,
        transactionType,
      }),
      cities,
    });
    const callbackPath = withHomepageApplyCaptureFlag(
      homepageSearchHrefFromCommitted(draftCommitted()),
    );

    // Browsing memory only — never writes Primary / alerts by itself.
    syncActiveSearchMemory();

    // Anonymous: CaptureIntent SAVE_SEARCH preserves criteria; resume after auth.
    if (!signedIn) {
      const opened = openGuestSaveSearchIntent({
        callbackPath,
        host: window.location.hostname,
        now: Date.now(),
        store: browserCaptureIntentStore(),
        openAuth,
      });
      if (!opened.ok) {
        openAuth({ mode: "sign-in", callbackUrl: callbackPath });
      }
      toast({
        message: "Sign in to save this search to your homepage.",
        tone: "info",
      });
      setPending(false);
      onClose();
      return;
    }

    try {
      const res = searchId
        ? await fetch("/api/saved-searches", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: searchId,
              name: searchName,
              query,
              isHomepageActive: true,
            }),
          })
        : await fetch("/api/saved-searches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: searchName,
              query,
              applyToHomepage: true,
            }),
          });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        requiresAuth?: boolean;
        requiresEmailVerification?: boolean;
      };

      if (!res.ok) {
        if (data.requiresAuth) {
          const opened = openGuestSaveSearchIntent({
            callbackPath,
            host: window.location.hostname,
            now: Date.now(),
            store: browserCaptureIntentStore(),
            openAuth,
          });
          if (!opened.ok) {
            openAuth({ mode: "sign-in", callbackUrl: callbackPath });
          }
          setError("Sign in to save your homepage search.");
          return;
        }
        if (data.requiresEmailVerification) {
          setError("Verify your email to save and apply a homepage search.");
          return;
        }
        setError(data.error || "Could not save your search. Try again.");
        return;
      }

      goHomeAndRefresh();
    } catch {
      setError("Could not save your search. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function onReset() {
    if (!searchId) return;
    onClose();
    const ok = await confirm({
      ...SITE_MESSAGES.clearHomepageSearch,
    });
    if (!ok) return;

    setResetting(true);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: searchId, isHomepageActive: false }),
      });
      if (!res.ok) {
        toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
        return;
      }
      toast({ message: "Homepage now shows all listings.", tone: "success" });
      window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
      window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
      if (pathname === "/") {
        router.refresh();
      } else {
        hardGo("/");
      }
    } catch {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
    } finally {
      setResetting(false);
    }
  }

  if (!mounted || !open) return null;

  const editingPrimary = Boolean(searchId);
  const title = editingPrimary
    ? "Edit homepage search"
    : sourceKind === "active"
      ? "Edit recent search"
      : "Create Custom Search";

  const panel = (
    <div
      ref={overlayRef}
      data-personalize-homepage-modal=""
      className="fixed top-0 left-0 z-[120] flex h-full w-full items-end justify-center overflow-hidden overscroll-none bg-ink/55 px-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+var(--mobile-bottom-nav,0px)))] sm:items-center sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="personalize-home-title"
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p
              id="personalize-home-title"
              className="font-display text-xl text-ink sm:text-2xl"
            >
              {title}
            </p>
            <p className="mt-1 text-xs text-ink/55 sm:text-sm">
              {editingPrimary
                ? "Update your Primary Home Search. Cancel leaves it unchanged."
                : "Save & Apply sets your Primary Home Search. Cancel leaves browsing unchanged."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-ink/50 transition hover:bg-mist hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          <label className="block space-y-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Search name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={HOMEPAGE_SEARCH_DEFAULT_NAME}
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Transaction
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["SALE", "Buy"],
                  ["LEASE", "Rent"],
                  ["ALL", "Both"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={transactionType === value}
                  onClick={() => setTransactionType(value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                    transactionType === value
                      ? "bg-ink text-white"
                      : "border border-line bg-mist/60 text-ink/70 hover:border-canopy/40",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Price
            </p>
            <PriceRangeSlider
              minPrice={minPrice}
              maxPrice={maxPrice}
              onChange={({ minPrice: nextMin, maxPrice: nextMax }) => {
                setMinPrice(nextMin);
                setMaxPrice(nextMax);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                Beds
              </legend>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={!minBeds}
                  onClick={() => setMinBeds("")}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
                    !minBeds
                      ? "bg-ink text-white"
                      : "border border-line bg-mist/60 text-ink/70",
                  )}
                >
                  Any
                </button>
                {BED_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={minBeds === n}
                    onClick={() => setMinBeds(n)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
                      minBeds === n
                        ? "bg-ink text-white"
                        : "border border-line bg-mist/60 text-ink/70",
                    )}
                  >
                    {n}+
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                Baths
              </legend>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={!minBaths}
                  onClick={() => setMinBaths("")}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
                    !minBaths
                      ? "bg-ink text-white"
                      : "border border-line bg-mist/60 text-ink/70",
                  )}
                >
                  Any
                </button>
                {BATH_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={minBaths === n}
                    onClick={() => setMinBaths(n)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
                      minBaths === n
                        ? "bg-ink text-white"
                        : "border border-line bg-mist/60 text-ink/70",
                    )}
                  >
                    {n}+
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Property type
            </legend>
            <div className="flex flex-wrap gap-2">
              {RESIDENTIAL_TYPES.map((type) => {
                const active = propertyTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleType(type)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                      active
                        ? "bg-ink text-white"
                        : "border border-line bg-mist/60 text-ink/70 hover:border-canopy/40",
                    )}
                  >
                    {propertyTypeLabel(type)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Cities
            </p>
            <CityMultiInput cities={cities} onChange={setCities} />
          </div>

          {error ? (
            <p className="text-sm font-medium text-danger">{error}</p>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex flex-wrap items-center gap-2">
            {searchId ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending || resetting}
                onClick={() => void onReset()}
                className="text-danger hover:bg-danger/5 hover:text-danger"
              >
                {resetting ? "Resetting…" : "Reset homepage"}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || resetting}
              onClick={() => void onSave()}
            >
              {pending ? "Saving…" : "Save & Apply"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
