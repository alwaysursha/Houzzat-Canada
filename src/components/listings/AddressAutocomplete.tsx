"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bath, Bed, Car, History, MapPin, Search, X } from "lucide-react";
import {
  formatListPrice,
  formatListingBedsLabel,
  formatRelativeAge,
  isOnMarketListingStatus,
  listingStatusLabel,
  propertyTypeLabel,
  resolveListingAddedAt,
} from "@/lib/listings/constants";
import {
  looksLikeStreetAddress,
  nearAddressHref,
  placeToAddressSuggestion,
  suggestionsAroundPlace,
} from "@/lib/listings/address-suggest";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import {
  clearLocalRecentSearches,
  pushLocalRecentSearch,
  readLocalRecentSearches,
  type LocalRecentSearch,
} from "@/lib/listings/recent-searches-local";
import type {
  AutocompleteSuggestion,
  AutocompleteSuggestionGroup,
} from "@/lib/listings/types";
import { persistHomeLocationIfEmpty } from "@/lib/account/persist-home-location";
import {
  getHomeCoordinates,
  NORMAL_LOCATION_MAX_AGE,
  NORMAL_LOCATION_TIMEOUT,
} from "@/lib/mobile/home-geolocation";
import { locationErrorMessage } from "@/lib/mobile/geolocation";
import { registerMobileSearchSheet } from "@/lib/mobile/mobile-search-sheet";
import { pushHref } from "@/lib/listings/navigate-listing";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { Input } from "@/components/ui/input";
import { useClientAccess } from "@/hooks/use-client-access";
import { cn } from "@/lib/utils";

/** Listings always above Google addresses / around-area. */
const GROUP_ORDER: AutocompleteSuggestionGroup[] = [
  "actions",
  "recent",
  "popular",
  "mls",
  "listings",
  "addresses",
  "around",
  "cities",
  "communities",
];

const GROUP_LABELS: Record<AutocompleteSuggestionGroup, string> = {
  actions: "Quick actions",
  recent: "Recent",
  popular: "Popular cities",
  mls: "MLS®",
  listings: "Listings",
  cities: "Cities",
  communities: "Communities",
  addresses: "Addresses",
  around: "Around this address",
};

function groupSuggestions(
  items: AutocompleteSuggestion[],
  order: AutocompleteSuggestionGroup[],
) {
  const map = new Map<AutocompleteSuggestionGroup, AutocompleteSuggestion[]>();
  for (const item of items) {
    const key = item.group ?? (item.type === "place" ? "addresses" : "listings");
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return order
    .filter((g) => (map.get(g)?.length ?? 0) > 0)
    .map((group) => ({
      group,
      label: GROUP_LABELS[group],
      items: map.get(group)!,
    }));
}

function flatFromGroups(
  sections: ReturnType<typeof groupSuggestions>,
  extras: AutocompleteSuggestion[] = [],
) {
  return [...sections.flatMap((s) => s.items), ...extras];
}

function inventoryHitCount(items: AutocompleteSuggestion[]) {
  return items.filter(
    (s) =>
      s.group === "listings" ||
      s.group === "mls" ||
      s.type === "listing" ||
      s.type === "mls",
  ).length;
}

function listingsEmptySuggestion(): AutocompleteSuggestion {
  return {
    type: "action",
    group: "listings",
    action: "listings_empty",
    label: "No matching listings yet",
  };
}

function useIsMobileSearch() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function AddressAutocomplete({
  initialQuery = "",
  className,
  inputClassName,
  placeholder = "Search active or sold listings by MLS® #, address or neighbourhood",
  minChars = 1,
  transactionType,
  source = "listings",
  onPlaceSelect,
  onPlaceResolved,
  onQueryChange,
  fillOnly = false,
  onSearchSubmit,
  onClear,
  closeWhenHiddenBehindHeader = false,
  portalDesktopSuggestions = false,
  autoOpenMobileSheet = false,
  onMobileSheetOpenChange,
  mobileSheetZClassName = "z-[200]",
}: {
  initialQuery?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  minChars?: number;
  /** When set, only suggest ACTIVE listings of this transaction type. */
  transactionType?: "SALE" | "LEASE";
  /**
   * `listings` — inventory / MLS search (buy & rent), with Google address assist.
   * `google` — real-world addresses via Places (sell & valuation).
   */
  source?: "listings" | "google";
  onPlaceSelect?: (suggestion: AutocompleteSuggestion) => void;
  /**
   * Soft-select when Google resolves an address (lat/lng ready) without navigating.
   * Used so the parent Search button can run a near-map search.
   */
  onPlaceResolved?: (suggestion: AutocompleteSuggestion) => void;
  onQueryChange?: (query: string) => void;
  /** When true, selecting a hint fills the field without navigating. */
  fillOnly?: boolean;
  /** Called when user confirms a free-text search (Enter / Search for). */
  onSearchSubmit?: (query: string) => void;
  /** Called when the field is cleared (X). Parent should drop URL q/city/community. */
  onClear?: () => void;
  /**
   * Close the panel when this field scrolls under the site header
   * (home hero search).
   */
  closeWhenHiddenBehindHeader?: boolean;
  /**
   * Render desktop suggestions in a fixed portal (escape overflow-hidden /
   * scroll ancestors — e.g. Drive Time inside ListingSection).
   */
  portalDesktopSuggestions?: boolean;
  /** Open the mobile full-screen search sheet on mount (listing chrome Search). */
  autoOpenMobileSheet?: boolean;
  /** Fires when the mobile search sheet opens or closes. */
  onMobileSheetOpenChange?: (open: boolean) => void;
  /** Tailwind z-index classes for the mobile search portal (default z-[200]). */
  mobileSheetZClassName?: string;
}) {
  const router = useRouter();
  const isMobile = useIsMobileSearch();
  const access = useClientAccess();
  const sessionToken = useId().replace(/:/g, "");
  const listboxId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetEntered, setSheetEntered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  /** From autocomplete API — preferred over client hook for locked row copy. */
  const [apiNeedsEmailVerification, setApiNeedsEmailVerification] = useState<
    boolean | null
  >(null);
  const [recent, setRecent] = useState<LocalRecentSearch[]>([]);
  const [loading, setLoading] = useState(false);
  /** Inactive listing teasers — visitor vs verify-locked stay separate. */
  const restrictedListingLabel =
    (apiNeedsEmailVerification ?? access.needsEmailVerification)
      ? "Email verification required"
      : "Sign in required";
  const [geoError, setGeoError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [resolvedNearHref, setResolvedNearHref] = useState<string | null>(null);
  const [resolvedNearLabel, setResolvedNearLabel] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  /** While query matches a just-selected address, do not refetch or reopen. */
  const selectedQueryRef = useRef<string | null>(null);
  /** Last value we emitted via onQueryChange — parent often echoes it as initialQuery. */
  const lastEmittedQueryRef = useRef<string | null>(null);
  const mobileSheetOpenRef = useRef(mobileSheetOpen);
  mobileSheetOpenRef.current = mobileSheetOpen;
  const openRef = useRef(open);
  openRef.current = open;
  const onPlaceResolvedRef = useRef(onPlaceResolved);
  onPlaceResolvedRef.current = onPlaceResolved;
  /** Ignore stale autocomplete responses while the user keeps typing. */
  const listingsFetchGenRef = useRef(0);
  const placesFetchGenRef = useRef(0);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>();

  const mobileSheetWasOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!onMobileSheetOpenChange) return;
    if (mobileSheetOpen) mobileSheetWasOpenRef.current = true;
    // Avoid mount-time `false` closing a parent that just opened search.
    if (!mobileSheetWasOpenRef.current) return;
    onMobileSheetOpenChange(mobileSheetOpen);
  }, [mobileSheetOpen, onMobileSheetOpenChange]);

  useEffect(() => {
    if (!autoOpenMobileSheet || !mounted || !isMobile) return;
    setMobileSheetOpen(true);
  }, [autoOpenMobileSheet, mounted, isMobile]);

  /** Mount/unmount mobile sheet with a slide-in / slide-out transition. */
  useEffect(() => {
    if (!mounted || !isMobile) {
      setSheetMounted(false);
      setSheetEntered(false);
      return;
    }

    if (mobileSheetOpen) {
      setSheetMounted(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setSheetEntered(true));
      });
      return () => window.cancelAnimationFrame(id);
    }

    setSheetEntered(false);
    const timeout = window.setTimeout(() => setSheetMounted(false), 320);
    return () => window.clearTimeout(timeout);
  }, [mobileSheetOpen, isMobile, mounted]);

  /** Expand results wider than the input on desktop for listing rows. */
  useLayoutEffect(() => {
    if (isMobile) {
      setPanelStyle(undefined);
      return;
    }
    function syncPanel() {
      const box = boxRef.current;
      if (!box) return;
      const shell = box.closest("[data-search-bar]") as HTMLElement | null;
      const boxRect = box.getBoundingClientRect();
      const shellRect = (shell ?? box).getBoundingClientRect();
      const viewportPad = 16;
      const minWidth = Math.min(42 * 16, window.innerWidth - viewportPad * 2);
      const width = Math.min(
        Math.max(shellRect.width, minWidth),
        window.innerWidth - viewportPad * 2,
      );

      if (portalDesktopSuggestions) {
        let left = shellRect.left;
        if (left + width > window.innerWidth - viewportPad) {
          left = window.innerWidth - viewportPad - width;
        }
        left = Math.max(viewportPad, left);
        const gap = 8;
        const spaceBelow =
          window.innerHeight - boxRect.bottom - viewportPad - gap;
        const spaceAbove = boxRect.top - viewportPad - gap;
        const placeBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
        const maxHeight = Math.max(
          140,
          Math.min(28 * 16, placeBelow ? spaceBelow : spaceAbove),
        );
        const top = placeBelow
          ? boxRect.bottom + gap
          : Math.max(viewportPad, boxRect.top - gap - maxHeight);
        const sheet = document.querySelector<HTMLElement>(
          '[role="dialog"][aria-label="Listing details"]',
        );
        const inListingSheet = Boolean(sheet?.contains(box));
        setPanelStyle({
          position: "fixed",
          top,
          left,
          width,
          maxHeight,
          // Inside listing sheet: below green chrome (z-50). Full page / map overlay: above content.
          zIndex: inListingSheet ? 40 : 90,
        });
        return;
      }

      let left = shellRect.left - boxRect.left;
      const absoluteRight = shellRect.left + width;
      const overflowRight = absoluteRight - (window.innerWidth - viewportPad);
      if (overflowRight > 0) {
        left -= overflowRight;
      }
      setPanelStyle({ left, width });
    }
    syncPanel();
    window.addEventListener("resize", syncPanel);
    if (portalDesktopSuggestions) {
      window.addEventListener("scroll", syncPanel, true);
    }
    return () => {
      window.removeEventListener("resize", syncPanel);
      window.removeEventListener("scroll", syncPanel, true);
    };
  }, [open, query, suggestions.length, isMobile, portalDesktopSuggestions]);

  /** Hero: dismiss desktop suggestions once the bar scrolls under the header. */
  useEffect(() => {
    if (!closeWhenHiddenBehindHeader || !open || isMobile || mobileSheetOpen) {
      return;
    }
    const box = boxRef.current;
    if (!box) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          setOpen(false);
          setActiveIndex(-1);
        }
      },
      {
        root: null,
        threshold: 0,
        // Match sticky header reveal (~header + search strip).
        rootMargin: "-135px 0px 0px 0px",
      },
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, [closeWhenHiddenBehindHeader, open, isMobile, mobileSheetOpen]);

  useEffect(() => {
    setQuery(initialQuery);
    const trimmed = initialQuery.trim();
    if (!trimmed) {
      // Cleared from parent — allow suggestions again.
      if (selectedQueryRef.current) selectedQueryRef.current = null;
      return;
    }
    // Parent echoing our own keystrokes/selection via onQueryChange → initialQuery.
    // Must not treat that as an external prefill or Google/listing fetch never runs.
    if (initialQuery === lastEmittedQueryRef.current) return;

    // True external prefill (saved address, remount with value, etc.).
    selectedQueryRef.current = trimmed;
    setSuggestions([]);
    setOpen(false);
    setMobileSheetOpen(false);
  }, [initialQuery]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (mobileSheetOpen) return;
      const target = event.target as Node;
      if (boxRef.current?.contains(target)) return;
      if (
        portalDesktopSuggestions &&
        target instanceof Element &&
        target.closest(`[data-ac-portal="${listboxId}"]`)
      ) {
        return;
      }
      setOpen(false);
      setActiveIndex(-1);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [mobileSheetOpen, portalDesktopSuggestions, listboxId]);

  useEffect(() => {
    if (!sheetMounted || !isMobile) return;
    const release = acquireScrollLock();
    return release;
  }, [sheetMounted, isMobile]);

  useEffect(() => {
    if (!sheetMounted || !isMobile || !sheetEntered) return;
    const id = window.setTimeout(() => {
      sheetInputRef.current?.focus();
    }, 280);
    return () => window.clearTimeout(id);
  }, [sheetMounted, sheetEntered, isMobile]);

  useEffect(() => {
    if (source !== "listings") return;
    if (
      selectedQueryRef.current !== null &&
      query.trim() === selectedQueryRef.current.trim()
    ) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      setSuggestions([]);
      setResolvedNearHref(null);
      setResolvedNearLabel(null);
      return;
    }

    const ac = new AbortController();
    const fetchGen = ++listingsFetchGenRef.current;
    const isCurrent = () =>
      !ac.signal.aborted && fetchGen === listingsFetchGenRef.current;

    const handle = window.setTimeout(async () => {
      setLoading(true);
      // Open immediately so typing always shows the panel (even while loading).
      setOpen(true);
      try {
        const listingParams = new URLSearchParams({ q: trimmed });
        if (transactionType) {
          listingParams.set("transactionType", transactionType);
        }

        const fetchPlaces = trimmed.length >= 3;
        const listingPromise = fetch(
          `/api/listings/autocomplete?${listingParams}`,
          { signal: ac.signal },
        );
        const placesPromise = fetchPlaces
          ? fetch(
              `/api/places/autocomplete?${new URLSearchParams({
                q: trimmed,
                sessionToken,
              })}`,
              { signal: ac.signal },
            ).catch(() => null)
          : Promise.resolve(null);

        const listingRes = await listingPromise;
        if (!isCurrent()) return;

        const listingData = (await listingRes.json()) as {
          suggestions: AutocompleteSuggestion[];
          needsEmailVerification?: boolean;
        };
        const inventory = listingData.suggestions ?? [];
        const invCount = inventoryHitCount(inventory);
        const listingRows =
          invCount === 0
            ? [listingsEmptySuggestion(), ...inventory]
            : inventory;

        if (
          !isCurrent() ||
          (selectedQueryRef.current !== null &&
            query.trim() === selectedQueryRef.current.trim())
        ) {
          return;
        }

        if (typeof listingData.needsEmailVerification === "boolean") {
          setApiNeedsEmailVerification(listingData.needsEmailVerification);
        }
        // Paint MLS hits immediately — don't wait on Google Places.
        setSuggestions(listingRows);
        setActiveIndex(-1);

        if (!fetchPlaces) return;

        const placesRes = await placesPromise;
        if (!isCurrent() || !placesRes?.ok) return;

        const placesData = (await placesRes.json()) as {
          suggestions: AutocompleteSuggestion[];
        };
        let places = (placesData.suggestions ?? []).map((p) =>
          placeToAddressSuggestion(p),
        );

        const addressLike = looksLikeStreetAddress(trimmed);
        const promoteAddress = addressLike || invCount === 0;
        let around: AutocompleteSuggestion[] = [];
        let nearHref: string | null = null;
        let nearLabel: string | null = null;

        const topPlace = places[0];
        // Only resolve place details when inventory is empty or query is a
        // clear street address — skips an extra round-trip on most keystrokes.
        if (topPlace?.placeId && promoteAddress) {
          try {
            const detailRes = await fetch(
              `/api/places/details?${new URLSearchParams({
                placeId: topPlace.placeId,
                sessionToken,
              })}`,
              { signal: ac.signal },
            );
            if (detailRes.ok && isCurrent()) {
              const detailData = (await detailRes.json()) as {
                place?: AutocompleteSuggestion;
              };
              if (detailData.place) {
                const resolved = placeToAddressSuggestion({
                  ...detailData.place,
                  placeId: topPlace.placeId,
                });
                places = [
                  resolved,
                  ...places.filter((p) => p.placeId !== topPlace.placeId),
                ];
                around = suggestionsAroundPlace(resolved, transactionType);
                nearHref = nearAddressHref(resolved, transactionType);
                nearLabel = resolved.label || null;
                onPlaceResolvedRef.current?.(resolved);
              }
            }
          } catch {
            // Places details optional — still show address predictions.
          }
        }

        if (
          !isCurrent() ||
          (selectedQueryRef.current !== null &&
            query.trim() === selectedQueryRef.current.trim())
        ) {
          return;
        }

        setResolvedNearHref(nearHref);
        setResolvedNearLabel(nearLabel);
        setSuggestions([...listingRows, ...places, ...around]);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        if (ac.signal.aborted) return;
        // Keep prior suggestions rather than wiping on transient errors.
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(handle);
      ac.abort();
    };
  }, [query, minChars, transactionType, source, sessionToken]);

  useEffect(() => {
    if (source !== "google") return;

    if (
      selectedQueryRef.current !== null &&
      query.trim() === selectedQueryRef.current.trim()
    ) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const min = Math.max(minChars, 2);
    if (query.trim().length < min) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const ac = new AbortController();
    const fetchGen = ++placesFetchGenRef.current;
    const isCurrent = () =>
      !ac.signal.aborted && fetchGen === placesFetchGenRef.current;

    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          sessionToken,
        });
        const res = await fetch(`/api/places/autocomplete?${params}`, {
          signal: ac.signal,
        });
        if (!isCurrent()) return;
        const data = (await res.json()) as {
          suggestions: AutocompleteSuggestion[];
        };
        if (
          !isCurrent() ||
          (selectedQueryRef.current !== null &&
            query.trim() === selectedQueryRef.current.trim())
        ) {
          return;
        }
        setSuggestions(
          (data.suggestions ?? []).map((p) => placeToAddressSuggestion(p)),
        );
        setOpen((data.suggestions ?? []).length > 0);
        setActiveIndex(-1);
      } catch {
        if (ac.signal.aborted) return;
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(handle);
      ac.abort();
    };
  }, [query, minChars, source, sessionToken]);

  async function loadEmptyState() {
    if (source !== "listings") return;
    setRecent(readLocalRecentSearches());
    setLoading(true);
    setGeoError(null);
    setResolvedNearHref(null);
    setResolvedNearLabel(null);
    try {
      const params = new URLSearchParams({ empty: "1" });
      if (transactionType) params.set("transactionType", transactionType);
      const res = await fetch(`/api/listings/autocomplete?${params}`);
      const data = (await res.json()) as {
        suggestions: AutocompleteSuggestion[];
        needsEmailVerification?: boolean;
      };
      if (typeof data.needsEmailVerification === "boolean") {
        setApiNeedsEmailVerification(data.needsEmailVerification);
      }
      setSuggestions(data.suggestions ?? []);
      setOpen(true);
      setActiveIndex(-1);
    } finally {
      setLoading(false);
    }
  }

  function remember(label: string, href: string) {
    pushLocalRecentSearch({ label, href });
  }

  async function runNearMe() {
    setGeoError(null);
    setLoading(true);
    try {
      // Shared Home/Search coordinator — reuses cache within TTL.
      const { lat, lng } = await getHomeCoordinates({
        timeout: NORMAL_LOCATION_TIMEOUT,
        maximumAge: NORMAL_LOCATION_MAX_AGE,
        emitEvent: true,
        requestPermission: true,
      });
      void persistHomeLocationIfEmpty({ lat, lng });
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
      });
      if (transactionType) params.set("transactionType", transactionType);
      const href = `/search?${params.toString()}`;
      remember("Near me", href);
      setOpen(false);
      if (onPlaceSelect) {
        onPlaceSelect({
          type: "action",
          action: "near_me",
          label: "Near me",
          lat,
          lng,
          href,
        });
        return;
      }
      pushHref(router, href);
    } catch (error) {
      setGeoError(locationErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function closeMobileSheet() {
    setMobileSheetOpen(false);
    setOpen(false);
    setActiveIndex(-1);
  }

  const closeMobileSheetRef = useRef(closeMobileSheet);
  closeMobileSheetRef.current = closeMobileSheet;

  // Capacitor hardware Back: register open mobile sheet (Home / header / listing AC).
  useEffect(() => {
    if (!mounted || !isMobile || !mobileSheetOpen) return;
    return registerMobileSearchSheet(() => {
      closeMobileSheetRef.current();
    });
  }, [mounted, isMobile, mobileSheetOpen]);

  function runSearchFor(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setOpen(false);
    setMobileSheetOpen(false);

    // Prefer map search near the resolved Google address when available.
    if (resolvedNearHref && looksLikeStreetAddress(trimmed)) {
      remember(trimmed, resolvedNearHref);
      const nearLabel = resolvedNearLabel
        ? `Search near ${resolvedNearLabel}`
        : "Search near this address";
      if (onPlaceSelect) {
        onPlaceSelect({
          type: "action",
          action: "near_address",
          label: nearLabel,
          href: resolvedNearHref,
        });
        return;
      }
      if (!fillOnly) pushHref(router, resolvedNearHref);
      return;
    }

    if (onSearchSubmit) {
      onSearchSubmit(trimmed);
      return;
    }
    const parsed = parseSearchQuery(trimmed);
    const href = searchHrefFromParsed(parsed, { transactionType });
    remember(trimmed, href);
    if (fillOnly) return;
    pushHref(router, href);
  }

  async function choose(suggestion: AutocompleteSuggestion) {
    if (suggestion.action === "listings_empty") return;

    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);

    if (suggestion.action === "near_me") {
      setMobileSheetOpen(false);
      runNearMe();
      return;
    }
    if (suggestion.action === "search_for") {
      runSearchFor(query);
      return;
    }

    let resolved = suggestion;

    if (suggestion.placeId) {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          placeId: suggestion.placeId,
          sessionToken,
        });
        const res = await fetch(`/api/places/details?${params}`);
        const data = (await res.json()) as {
          place?: AutocompleteSuggestion;
        };
        if (data.place) {
          resolved = {
            ...data.place,
            placeId: suggestion.placeId,
            group: suggestion.group ?? "addresses",
            type: "place",
          };
        }
      } finally {
        setLoading(false);
      }

      // Selecting a Google address on Buy/Rent → show around-options in-panel
      // when caller didn't pass a custom handler that navigates immediately.
      if (source === "listings" && !fillOnly) {
        const addressRow = placeToAddressSuggestion(resolved);
        const around = suggestionsAroundPlace(resolved, transactionType);
        const filled =
          resolved.city && resolved.province
            ? `${resolved.label}, ${resolved.city}, ${resolved.province}`
            : (resolved.subtitle ?? resolved.label);
        selectedQueryRef.current = filled;
        lastEmittedQueryRef.current = filled;
        setQuery(filled);
        onQueryChange?.(filled);
        onPlaceResolvedRef.current?.(addressRow);
        setResolvedNearHref(nearAddressHref(resolved, transactionType));
        setResolvedNearLabel(resolved.label || null);
        setSuggestions([addressRow, ...around]);
        setOpen(true);
        setActiveIndex(around.length > 0 ? 1 : 0);
        // Keep mobile sheet open so around-options stay usable above the keyboard.
        return;
      }
    }

    const filled =
      resolved.city && resolved.province
        ? `${resolved.label}, ${resolved.city}, ${resolved.province}`
        : (resolved.subtitle ?? resolved.label);
    selectedQueryRef.current = filled;
    lastEmittedQueryRef.current = filled;
    setQuery(filled);
    setOpen(false);
    setMobileSheetOpen(false);
    setSuggestions([]);
    onQueryChange?.(filled);

    if (resolved.href && !fillOnly) {
      remember(resolved.label, resolved.href);
    }

    if (onPlaceSelect) {
      onPlaceSelect(resolved);
      return;
    }
    if (fillOnly) return;
    if (resolved.href) {
      pushHref(router, resolved.href);
    }
  }

  const recentAsSuggestions: AutocompleteSuggestion[] =
    source === "listings" && query.trim().length < minChars
      ? recent.map((row) => ({
          type: "action" as const,
          group: "recent" as const,
          label: row.label,
          subtitle: "Recent search",
          href: row.href,
        }))
      : [];

  const trimmedQuery = query.trim();
  const searchForRow: AutocompleteSuggestion | null =
    source === "listings" && trimmedQuery.length >= minChars
      ? resolvedNearHref && looksLikeStreetAddress(trimmedQuery)
        ? {
            type: "action",
            group: "actions",
            action: "search_for",
            label: resolvedNearLabel
              ? `Search near ${resolvedNearLabel}`
              : "Search near this address",
            subtitle: "Map homes around the matched place",
            href: resolvedNearHref,
          }
        : {
            type: "action",
            group: "actions",
            action: "search_for",
            label: `Search for “${trimmedQuery}”`,
            subtitle: "Apply filters from this phrase",
          }
      : null;

  const displaySuggestions =
    source === "listings" && query.trim().length < minChars
      ? [...recentAsSuggestions, ...suggestions]
      : suggestions;

  const sections = groupSuggestions(displaySuggestions, GROUP_ORDER);
  const flat = flatFromGroups(
    sections,
    searchForRow ? [searchForRow] : [],
  ).filter((s) => s.action !== "listings_empty");

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (query.trim().length < minChars && source === "listings") {
        void loadEmptyState();
      }
      return;
    }
    if (!open || flat.length === 0) {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearchFor(query);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (isMobile && mobileSheetOpen) {
        closeMobileSheet();
      } else {
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && flat[activeIndex]) {
        void choose(flat[activeIndex]!);
      } else {
        runSearchFor(query);
      }
    }
  }

  function onQueryInputChange(value: string) {
    selectedQueryRef.current = null;
    lastEmittedQueryRef.current = value;
    setResolvedNearHref(null);
    setResolvedNearLabel(null);
    setQuery(value);
    onQueryChange?.(value);
  }

  function clearQuery() {
    selectedQueryRef.current = null;
    lastEmittedQueryRef.current = "";
    setResolvedNearHref(null);
    setResolvedNearLabel(null);
    setQuery("");
    setSuggestions([]);
    setActiveIndex(-1);
    setOpen(false);
    onQueryChange?.("");
    onClear?.();
    if (isMobile && mobileSheetOpen) {
      sheetInputRef.current?.focus();
      void loadEmptyState();
    }
  }

  function openFromFocus() {
    if (isMobile) {
      setMobileSheetOpen(true);
    } else if (
      selectedQueryRef.current !== null &&
      query.trim() === selectedQueryRef.current.trim()
    ) {
      // Desktop: prefill / already-chosen address — don't reopen suggestions.
      return;
    }
    if (source === "listings" && query.trim().length < minChars) {
      void loadEmptyState();
      return;
    }
    if (suggestions.length > 0 || displaySuggestions.length > 0) {
      setOpen(true);
    } else if (isMobile) {
      setOpen(true);
    }
  }

  function onSuggestionActivate(suggestion: AutocompleteSuggestion) {
    if (suggestion.href && suggestion.group === "recent") {
      remember(suggestion.label, suggestion.href);
      setOpen(false);
      setMobileSheetOpen(false);
      if (onPlaceSelect) {
        onPlaceSelect(suggestion);
        return;
      }
      pushHref(router, suggestion.href);
      return;
    }
    void choose(suggestion);
  }

  function renderSuggestionList(options?: { large?: boolean }): ReactNode {
    const large = Boolean(options?.large);
    const showResults = sections.length > 0 || searchForRow;
    if (!showResults) {
      return (
        <p
          className={cn(
            "px-4 py-8 text-center text-ink/50",
            large ? "text-base" : "text-[15px]",
          )}
        >
          {loading ? "Searching…" : "Start typing an address, city, or MLS® #"}
        </p>
      );
    }

    return (
      <>
        {sections.map((section) => (
          <div key={section.group} className="pb-0.5">
            <div className="flex items-center justify-between gap-3 px-4 py-2">
              <p
                className={cn(
                  "font-semibold uppercase tracking-[0.06em] text-ink/50",
                  large ? "text-sm" : "text-xs",
                )}
              >
                {section.label}
              </p>
              {section.group === "recent" ? (
                <button
                  type="button"
                  className={cn(
                    "font-semibold text-canopy hover:underline",
                    large ? "text-sm" : "text-xs",
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    clearLocalRecentSearches();
                    setRecent([]);
                    setSuggestions((prev) =>
                      prev.filter((row) => row.group !== "recent"),
                    );
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <ul className="divide-y divide-line/70">
              {section.items.map((suggestion) => {
                if (suggestion.action === "listings_empty") {
                  return (
                    <li key="listings-empty">
                      <p
                        className={cn(
                          "px-4 py-3 text-center font-medium leading-snug text-ink/55",
                          large ? "text-base" : "text-[15px]",
                        )}
                      >
                        {suggestion.label}
                      </p>
                    </li>
                  );
                }
                const index = flat.indexOf(suggestion);
                const active = index === activeIndex;
                const isListingRich =
                  suggestion.type === "listing" || suggestion.type === "mls";
                return (
                  <li
                    // Index is unique in the flattened list; labels alone collide
                    // (e.g. two "Waterloo Court" address rows without mlsNumber).
                    key={`${listboxId}-row-${index}`}
                  >
                    <button
                      type="button"
                      id={`${listboxId}-opt-${index}`}
                      role="option"
                      aria-selected={active}
                      className={cn(
                        "w-full px-4 text-left transition hover:bg-mist/80",
                        isListingRich
                          ? "block"
                          : "flex items-stretch gap-3.5",
                        large ? "py-3.5" : "py-3",
                        active && "bg-mist/80",
                      )}
                      onMouseDown={(event) => {
                        // Keep input focus so the panel doesn't dismiss before click.
                        event.preventDefault();
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => onSuggestionActivate(suggestion)}
                    >
                      {isListingRich ? (
                        <SuggestionListingRow
                          suggestion={suggestion}
                          large={large}
                          restrictedLabel={restrictedListingLabel}
                        />
                      ) : (
                        <SuggestionSimpleRow
                          suggestion={suggestion}
                          large={large}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {searchForRow ? (
          <div className="border-t border-line/70 pt-0.5">
            <button
              type="button"
              id={`${listboxId}-opt-${flat.length - 1}`}
              role="option"
              aria-selected={activeIndex === flat.length - 1}
              className={cn(
                "flex w-full items-start gap-3 px-4 text-left transition hover:bg-mist/80",
                large ? "py-3.5" : "py-3",
                activeIndex === flat.length - 1 && "bg-mist/80",
              )}
              onMouseDown={(event) => {
                // Keep input focus so the panel doesn't dismiss before click.
                event.preventDefault();
              }}
              onMouseEnter={() => setActiveIndex(flat.length - 1)}
              onClick={() => {
                if (searchForRow.href) {
                  remember(searchForRow.label, searchForRow.href);
                  setOpen(false);
                  setMobileSheetOpen(false);
                  if (onPlaceSelect) {
                    onPlaceSelect(searchForRow);
                    return;
                  }
                  pushHref(router, searchForRow.href);
                  return;
                }
                runSearchFor(query);
              }}
            >
              <Search
                className={cn(
                  "mt-0.5 shrink-0 text-canopy",
                  large ? "size-6" : "size-5",
                )}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    "block font-semibold text-ink",
                    large ? "text-lg" : "text-[15px]",
                  )}
                >
                  {searchForRow.label}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-ink/55",
                    large ? "text-base" : "text-sm",
                  )}
                >
                  {searchForRow.subtitle}
                </span>
              </span>
            </button>
          </div>
        ) : null}
      </>
    );
  }

  const desktopPanelOpen =
    !isMobile && open && (sections.length > 0 || Boolean(searchForRow));

  const mobilePortal =
    mounted && isMobile && sheetMounted
      ? createPortal(
          <div
            className={cn(
              "fixed inset-0 flex flex-col will-change-transform",
              mobileSheetZClassName,
              "transition-[transform,opacity] duration-300 ease-out",
              sheetEntered
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0",
            )}
            style={{
              background:
                "radial-gradient(1600px 1100px at 8% -12%, rgb(var(--tenant-primary-rgb) / 0.12), rgb(var(--tenant-primary-rgb) / 0) 72%), radial-gradient(1400px 1000px at 92% -8%, rgb(var(--tenant-accent-rgb) / 0.1), rgb(var(--tenant-accent-rgb) / 0) 70%), var(--mist)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Search homes"
          >
            <div className="shrink-0 border-b border-white/15 bg-canopy px-3 pb-3.5 pt-[max(0.85rem,env(safe-area-inset-top))] text-white">
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={closeMobileSheet}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-white transition active:bg-white/15 hover:bg-white/10"
                  aria-label="Close search"
                >
                  <ArrowLeft className="size-5" strokeWidth={2.2} aria-hidden />
                </button>
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/40"
                    aria-hidden
                  />
                  <Input
                    ref={sheetInputRef}
                    value={query}
                    onChange={(event) => onQueryInputChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    aria-activedescendant={
                      activeIndex >= 0
                        ? `${listboxId}-opt-${activeIndex}`
                        : undefined
                    }
                    className={cn(
                      "h-11 rounded-xl border-0 bg-white pl-10 text-[15px] text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)] placeholder:text-ink/45 focus-visible:ring-2 focus-visible:ring-white/50",
                      query.trim() ? "pr-10" : undefined,
                    )}
                    autoComplete="street-address"
                    enterKeyHint="search"
                  />
                  {query.trim() ? (
                    <button
                      type="button"
                      onClick={clearQuery}
                      className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink/45 transition hover:bg-ink/5 hover:text-ink/70"
                      aria-label="Clear search"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  ) : loading ? (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">
                      …
                    </span>
                  ) : null}
                </div>
              </div>
              {geoError ? (
                <p className="mt-2 px-1 text-sm text-white/90">{geoError}</p>
              ) : null}
            </div>
            <div
              id={listboxId}
              role="listbox"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              {renderSuggestionList({ large: true })}
            </div>
          </div>,
          document.body,
        )
      : null;

  const desktopListbox = desktopPanelOpen ? (
    <div
      id={listboxId}
      role="listbox"
      data-ac-portal={listboxId}
      style={panelStyle}
      className={cn(
        "overflow-auto rounded-md border border-line bg-surface py-1.5 shadow-lg",
        !portalDesktopSuggestions &&
          "absolute z-50 mt-4 max-h-[min(28rem,70vh)] w-full",
      )}
    >
      {renderSuggestionList()}
    </div>
  ) : null;

  /** Prefer listing-sheet dialog root so suggestions stack above panel content
   * but under sheet chrome (z-50). Full-page listing portals to document.body. */
  function desktopSuggestionPortalRoot(): HTMLElement {
    const box = boxRef.current;
    const sheet = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Listing details"]',
    );
    if (box && sheet?.contains(box)) return sheet;
    return document.body;
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-ink/40"
        aria-hidden
      />
      <Input
        value={query}
        onChange={(event) => onQueryInputChange(event.target.value)}
        onFocus={openFromFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isMobile ? mobileSheetOpen : open}
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        className={cn(
          "rounded-md pl-10 text-[15px]",
          query.trim() ? "pr-10" : undefined,
          inputClassName,
        )}
        autoComplete="street-address"
        readOnly={isMobile}
        inputMode={isMobile ? "none" : undefined}
        onClick={() => {
          if (isMobile) openFromFocus();
        }}
      />
      {query.trim() && !mobileSheetOpen ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            clearQuery();
          }}
          className="absolute right-2 top-1/2 z-[1] inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink/45 transition hover:bg-ink/5 hover:text-ink/70"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : loading && !mobileSheetOpen ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">
          …
        </span>
      ) : null}
      {geoError && !mobileSheetOpen ? (
        <p className="absolute left-0 top-full z-50 mt-1 text-sm text-danger">
          {geoError}
        </p>
      ) : null}
      {desktopListbox ? (
        portalDesktopSuggestions && mounted ? (
          createPortal(desktopListbox, desktopSuggestionPortalRoot())
        ) : (
          desktopListbox
        )
      ) : null}
      {mobilePortal}
    </div>
  );
}

function suggestionKindLabel(suggestion: AutocompleteSuggestion): string | null {
  if (suggestion.type === "place" || suggestion.group === "addresses") {
    return "Address";
  }
  if (suggestion.group === "cities" || suggestion.type === "city") {
    return "City";
  }
  if (suggestion.group === "communities" || suggestion.type === "community") {
    return "Community";
  }
  if (suggestion.group === "around") {
    return "Area";
  }
  if (suggestion.group === "recent") {
    return "Recent";
  }
  if (suggestion.group === "popular") {
    return "Popular";
  }
  return null;
}

function SuggestionSimpleRow({
  suggestion,
  large = false,
}: {
  suggestion: AutocompleteSuggestion;
  large?: boolean;
}) {
  const kind = suggestionKindLabel(suggestion);
  const isRecent = suggestion.group === "recent";
  const Icon = isRecent ? History : MapPin;
  return (
    <>
      <Icon
        className={cn(
          "mt-0.5 shrink-0 text-canopy",
          large ? "size-5" : "size-4",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block font-medium leading-snug text-ink",
            large ? "text-base" : "text-sm",
          )}
        >
          {suggestion.label}
        </span>
        {suggestion.subtitle ? (
          <span
            className={cn(
              "mt-0.5 block leading-snug text-ink/55",
              large ? "text-sm" : "text-xs",
            )}
          >
            {suggestion.subtitle}
          </span>
        ) : null}
      </span>
      {kind ? (
        <span
          className={cn(
            "shrink-0 self-center font-medium text-ink/40",
            large ? "text-sm" : "text-xs",
          )}
        >
          {kind}
        </span>
      ) : null}
    </>
  );
}

function suggestionListingAge(suggestion: AutocompleteSuggestion): string | null {
  const addedAt = resolveListingAddedAt({
    listedAt: suggestion.listedAt,
    updatedAtMls: suggestion.updatedAtMls,
  });
  if (addedAt) {
    return formatRelativeAge(addedAt);
  }
  if (suggestion.daysOnMarket != null) {
    if (suggestion.daysOnMarket <= 0) return "just now";
    if (suggestion.daysOnMarket === 1) return "1 day ago";
    return `${suggestion.daysOnMarket} days ago`;
  }
  return null;
}

/** Street vs "City - Area" for mobile two-line address. */
function suggestionAddressParts(suggestion: AutocompleteSuggestion): {
  street: string;
  locality: string | null;
} {
  const city = suggestion.city?.trim() || null;
  const community = suggestion.community?.trim() || null;
  const locality =
    city && community ? `${city} - ${community}` : city || community;

  let street = suggestion.label.trim();
  if (locality) {
    const suffix = `, ${locality}`;
    if (street.toLowerCase().endsWith(suffix.toLowerCase())) {
      street = street.slice(0, -suffix.length).trim();
    }
  }

  return { street: street || suggestion.label, locality };
}

function SuggestionListingRow({
  suggestion,
  large = false,
  restrictedLabel = "Sign in required",
}: {
  suggestion: AutocompleteSuggestion;
  large?: boolean;
  /** Visitor: Sign in required. Verify-locked: Email verification required. */
  restrictedLabel?: string;
}) {
  const statusLabel = suggestion.status
    ? listingStatusLabel(
        suggestion.status,
        suggestion.transactionType ?? "SALE",
      )
    : null;
  const detailsLocked =
    suggestion.status &&
    !isOnMarketListingStatus(suggestion.status) &&
    suggestion.listPrice == null;
  const typeLabel = suggestion.propertyType
    ? propertyTypeLabel(suggestion.propertyType)
    : null;
  const ageLabel = suggestionListingAge(suggestion);
  const brokerage = suggestion.brokerageName?.trim() || null;
  const metaLine = [ageLabel, suggestion.mlsNumber, brokerage]
    .filter(Boolean)
    .join(", ");
  const { street, locality } = suggestionAddressParts(suggestion);

  return (
    <span className="flex w-full min-w-0 flex-col gap-1.5">
      <span className="flex w-full min-w-0 items-stretch gap-3.5">
        <span
          className={cn(
            "relative shrink-0 overflow-hidden rounded-md bg-mist",
            large ? "size-[5.5rem]" : "size-20",
          )}
        >
          {suggestion.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={suggestion.imageUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-xs text-ink/35">
              MLS
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-baseline justify-between gap-3">
            {detailsLocked ? (
              <span
                className={cn(
                  "font-semibold text-ink/55",
                  large ? "text-lg" : "text-base",
                )}
              >
                {restrictedLabel}
              </span>
            ) : suggestion.listPrice != null ? (
              <span
                className={cn(
                  "font-bold tracking-tight text-canopy",
                  large ? "text-xl" : "text-lg",
                )}
              >
                {formatListPrice(
                  suggestion.listPrice,
                  suggestion.transactionType ?? "SALE",
                )}
              </span>
            ) : (
              <span />
            )}
            {statusLabel ? (
              <span
                className={cn(
                  "shrink-0 text-base font-bold",
                  suggestion.status === "ACTIVE"
                    ? "text-canopy"
                    : suggestion.status === "SOLD_CONDITIONAL"
                      ? "text-amber"
                      : "text-danger",
                )}
              >
                {statusLabel}
              </span>
            ) : null}
          </span>

          {locality ? (
            <>
              <span
                className={cn(
                  "space-y-0.5",
                  large ? "block" : "block sm:hidden",
                )}
              >
                <span
                  className={cn(
                    "block truncate font-medium leading-snug text-ink",
                    large ? "text-[15px]" : "text-base",
                  )}
                >
                  {street}
                </span>
                <span className="block truncate text-sm font-medium text-ink/70">
                  {locality}
                </span>
              </span>
              <span
                className={cn(
                  "truncate font-medium leading-snug text-ink",
                  large ? "hidden" : "hidden sm:block text-base",
                  large && "text-[15px]",
                )}
              >
                {suggestion.label}
              </span>
            </>
          ) : (
            <span
              className={cn(
                "block truncate font-medium leading-snug text-ink",
                large ? "text-[15px]" : "text-base",
              )}
            >
              {suggestion.label}
            </span>
          )}

          <span className="flex items-center justify-between gap-3">
            {typeLabel ? (
              <span className="min-w-0 truncate text-sm font-bold text-ink">
                {typeLabel}
              </span>
            ) : (
              <span />
            )}
            <span className="inline-flex shrink-0 items-center gap-x-2.5 text-sm font-bold text-ink">
              {suggestion.beds != null ? (
                <span className="inline-flex items-center gap-1">
                  <Bed
                    className={cn(
                      "text-canopy",
                      large ? "size-3.5" : "size-4",
                    )}
                    aria-hidden
                  />
                  {formatListingBedsLabel({
                    beds: suggestion.beds,
                    bedsLabel: suggestion.bedsLabel,
                  })}
                </span>
              ) : null}
              {suggestion.baths != null ? (
                <span className="inline-flex items-center gap-1">
                  <Bath
                    className={cn(
                      "text-canopy",
                      large ? "size-3.5" : "size-4",
                    )}
                    aria-hidden
                  />
                  {suggestion.baths}
                  <span className="sr-only">bathrooms</span>
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Car
                  className={cn(
                    "text-canopy",
                    large ? "size-3.5" : "size-4",
                  )}
                  aria-hidden
                />
                {suggestion.parkingSpaces ?? 0}
                <span className="sr-only">parking spaces</span>
              </span>
            </span>
          </span>
        </span>
      </span>

      {metaLine ? (
        <span
          className={cn(
            "block w-full truncate font-medium text-ink/65",
            large ? "text-[13px]" : "text-sm",
          )}
        >
          {metaLine}
        </span>
      ) : null}
    </span>
  );
}
