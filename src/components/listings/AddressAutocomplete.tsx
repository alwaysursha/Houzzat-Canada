"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Bath, Bed, MapPin, Search } from "lucide-react";
import {
  formatListPrice,
  listingStatusLabel,
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
  pushLocalRecentSearch,
  readLocalRecentSearches,
  type LocalRecentSearch,
} from "@/lib/listings/recent-searches-local";
import type {
  AutocompleteSuggestion,
  AutocompleteSuggestionGroup,
} from "@/lib/listings/types";
import { Input } from "@/components/ui/input";
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
    label: "No history available",
  };
}

export function AddressAutocomplete({
  initialQuery = "",
  className,
  inputClassName,
  placeholder = "Search address, MLS® #, city, or community",
  minChars = 1,
  transactionType,
  source = "listings",
  onPlaceSelect,
  onPlaceResolved,
  onQueryChange,
  fillOnly = false,
  onSearchSubmit,
  closeWhenHiddenBehindHeader = false,
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
  /**
   * Close the panel when this field scrolls under the site header
   * (home hero search).
   */
  closeWhenHiddenBehindHeader?: boolean;
}) {
  const router = useRouter();
  const sessionToken = useId().replace(/:/g, "");
  const listboxId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [recent, setRecent] = useState<LocalRecentSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [resolvedNearHref, setResolvedNearHref] = useState<string | null>(null);
  const [resolvedNearLabel, setResolvedNearLabel] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  /** While query matches a just-selected address, do not refetch or reopen. */
  const selectedQueryRef = useRef<string | null>(null);
  const onPlaceResolvedRef = useRef(onPlaceResolved);
  onPlaceResolvedRef.current = onPlaceResolved;
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>();

  /** Expand results to the full search bar shell when present. */
  useLayoutEffect(() => {
    function syncPanelWidth() {
      const box = boxRef.current;
      if (!box) return;
      const shell = box.closest("[data-search-bar]") as HTMLElement | null;
      if (!shell) {
        setPanelStyle(undefined);
        return;
      }
      const boxRect = box.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      setPanelStyle({
        left: shellRect.left - boxRect.left,
        width: shellRect.width,
      });
    }
    syncPanelWidth();
    window.addEventListener("resize", syncPanelWidth);
    return () => window.removeEventListener("resize", syncPanelWidth);
  }, [open, query, suggestions.length]);

  /** Hero: dismiss suggestions once the bar scrolls under the sticky header. */
  useEffect(() => {
    if (!closeWhenHiddenBehindHeader || !open) return;
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
  }, [closeWhenHiddenBehindHeader, open]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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

    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const listingParams = new URLSearchParams({ q: trimmed });
        if (transactionType) {
          listingParams.set("transactionType", transactionType);
        }

        const fetchPlaces = trimmed.length >= 3;
        const [listingRes, placesRes] = await Promise.all([
          fetch(`/api/listings/autocomplete?${listingParams}`),
          fetchPlaces
            ? fetch(
                `/api/places/autocomplete?${new URLSearchParams({
                  q: trimmed,
                  sessionToken,
                })}`,
              ).catch(() => null)
            : Promise.resolve(null),
        ]);

        const listingData = (await listingRes.json()) as {
          suggestions: AutocompleteSuggestion[];
        };
        let places: AutocompleteSuggestion[] = [];
        if (placesRes?.ok) {
          const placesData = (await placesRes.json()) as {
            suggestions: AutocompleteSuggestion[];
          };
          places = (placesData.suggestions ?? []).map((p) =>
            placeToAddressSuggestion(p),
          );
        }

        if (
          selectedQueryRef.current !== null &&
          query.trim() === selectedQueryRef.current.trim()
        ) {
          return;
        }

        const inventory = listingData.suggestions ?? [];
        const invCount = inventoryHitCount(inventory);
        const addressLike = looksLikeStreetAddress(trimmed);
        const promoteAddress = addressLike || invCount === 0;

        let around: AutocompleteSuggestion[] = [];
        let nearHref: string | null = null;
        let nearLabel: string | null = null;

        const topPlace = places[0];
        if (topPlace?.placeId && (promoteAddress || addressLike)) {
          try {
            const detailRes = await fetch(
              `/api/places/details?${new URLSearchParams({
                placeId: topPlace.placeId,
                sessionToken,
              })}`,
            );
            if (detailRes.ok) {
              const detailData = (await detailRes.json()) as {
                place?: AutocompleteSuggestion;
              };
              if (detailData.place) {
                const resolved = placeToAddressSuggestion({
                  ...detailData.place,
                  placeId: topPlace.placeId,
                });
                // Prefer resolved address as first Addresses row.
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
          selectedQueryRef.current !== null &&
          query.trim() === selectedQueryRef.current.trim()
        ) {
          return;
        }

        setResolvedNearHref(nearHref);
        setResolvedNearLabel(nearLabel);
        const listingRows =
          invCount === 0
            ? [listingsEmptySuggestion(), ...inventory]
            : inventory;
        setSuggestions([...listingRows, ...places, ...around]);
        setOpen(true);
        setActiveIndex(-1);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => window.clearTimeout(handle);
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

    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          sessionToken,
        });
        const res = await fetch(`/api/places/autocomplete?${params}`);
        const data = (await res.json()) as {
          suggestions: AutocompleteSuggestion[];
        };
        if (
          selectedQueryRef.current !== null &&
          query.trim() === selectedQueryRef.current.trim()
        ) {
          return;
        }
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
        setActiveIndex(-1);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(handle);
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
      };
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

  function runNearMe() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Location isn’t available in this browser.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(false);
        const params = new URLSearchParams({
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude),
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
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            href,
          });
          return;
        }
        router.push(href);
      },
      () => {
        setLoading(false);
        setGeoError("Couldn’t get your location. Check browser permissions.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  function runSearchFor(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setOpen(false);

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
      if (!fillOnly) router.push(resolvedNearHref);
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
    router.push(href);
  }

  async function choose(suggestion: AutocompleteSuggestion) {
    if (suggestion.action === "listings_empty") return;

    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);

    if (suggestion.action === "near_me") {
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
        setQuery(filled);
        onQueryChange?.(filled);
        onPlaceResolvedRef.current?.(addressRow);
        setResolvedNearHref(nearAddressHref(resolved, transactionType));
        setResolvedNearLabel(resolved.label || null);
        setSuggestions([addressRow, ...around]);
        setOpen(true);
        setActiveIndex(around.length > 0 ? 1 : 0);
        return;
      }
    }

    const filled =
      resolved.city && resolved.province
        ? `${resolved.label}, ${resolved.city}, ${resolved.province}`
        : (resolved.subtitle ?? resolved.label);
    selectedQueryRef.current = filled;
    setQuery(filled);
    setOpen(false);
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
      router.push(resolved.href);
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
      setOpen(false);
      setActiveIndex(-1);
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

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-ink/40"
        aria-hidden
      />
      <Input
        value={query}
        onChange={(event) => {
          selectedQueryRef.current = null;
          setResolvedNearHref(null);
          setResolvedNearLabel(null);
          setQuery(event.target.value);
          onQueryChange?.(event.target.value);
        }}
        onFocus={() => {
          if (
            selectedQueryRef.current !== null &&
            query.trim() === selectedQueryRef.current.trim()
          ) {
            return;
          }
          if (source === "listings" && query.trim().length < minChars) {
            void loadEmptyState();
            return;
          }
          if (suggestions.length > 0 || displaySuggestions.length > 0) {
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        className={cn("rounded-md pl-10 text-[15px]", inputClassName)}
        autoComplete="street-address"
      />
      {loading ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">
          …
        </span>
      ) : null}
      {geoError ? (
        <p className="absolute left-0 top-full z-50 mt-1 text-sm text-danger">
          {geoError}
        </p>
      ) : null}
      {open && (sections.length > 0 || searchForRow) ? (
        <div
          id={listboxId}
          role="listbox"
          style={panelStyle}
          className="absolute z-50 mt-4 max-h-[min(28rem,70vh)] w-full overflow-auto rounded-md border border-line bg-surface py-1.5 shadow-lg"
        >
          {sections.map((section) => (
            <div key={section.group} className="pb-0.5">
              <p className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink/50">
                {section.label}
              </p>
              <ul>
                {section.items.map((suggestion) => {
                  if (suggestion.action === "listings_empty") {
                    return (
                      <li key="listings-empty">
                        <p className="px-4 py-3 text-center text-[15px] font-medium leading-snug text-ink/55">
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
                      key={`${suggestion.group}-${suggestion.label}-${suggestion.mlsNumber ?? suggestion.placeId ?? suggestion.href ?? suggestion.action}`}
                    >
                      <button
                        type="button"
                        id={`${listboxId}-opt-${index}`}
                        role="option"
                        aria-selected={active}
                        className={cn(
                          "flex w-full items-stretch gap-3 px-4 py-3 text-left transition hover:bg-mist/80",
                          active && "bg-mist/80",
                        )}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => {
                          if (
                            suggestion.href &&
                            suggestion.group === "recent"
                          ) {
                            remember(suggestion.label, suggestion.href);
                            setOpen(false);
                            if (onPlaceSelect) {
                              onPlaceSelect(suggestion);
                              return;
                            }
                            router.push(suggestion.href);
                            return;
                          }
                          void choose(suggestion);
                        }}
                      >
                        {isListingRich ? (
                          <SuggestionListingRow suggestion={suggestion} />
                        ) : (
                          <SuggestionSimpleRow suggestion={suggestion} />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {searchForRow ? (
            <div className="border-t border-line pt-0.5">
              <button
                type="button"
                id={`${listboxId}-opt-${flat.length - 1}`}
                role="option"
                aria-selected={activeIndex === flat.length - 1}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-mist/80",
                  activeIndex === flat.length - 1 && "bg-mist/80",
                )}
                onMouseEnter={() => setActiveIndex(flat.length - 1)}
                onClick={() => {
                  if (searchForRow.href) {
                    remember(searchForRow.label, searchForRow.href);
                    setOpen(false);
                    if (onPlaceSelect) {
                      onPlaceSelect(searchForRow);
                      return;
                    }
                    router.push(searchForRow.href);
                    return;
                  }
                  runSearchFor(query);
                }}
              >
                <Search className="mt-0.5 size-5 shrink-0 text-canopy" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-ink">
                    {searchForRow.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink/55">
                    {searchForRow.subtitle}
                  </span>
                </span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
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
}: {
  suggestion: AutocompleteSuggestion;
}) {
  const kind = suggestionKindLabel(suggestion);
  return (
    <>
      <MapPin className="mt-1 size-5 shrink-0 text-canopy" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-ink">
          {suggestion.label}
        </span>
        {suggestion.subtitle ? (
          <span className="mt-1 block text-sm leading-snug text-ink/60">
            {suggestion.subtitle}
          </span>
        ) : null}
      </span>
      {kind ? (
        <span className="shrink-0 self-center text-sm font-medium text-ink/45">
          {kind}
        </span>
      ) : null}
    </>
  );
}

function SuggestionListingRow({
  suggestion,
}: {
  suggestion: AutocompleteSuggestion;
}) {
  const statusLabel = suggestion.status
    ? listingStatusLabel(
        suggestion.status,
        suggestion.transactionType ?? "SALE",
      )
    : null;
  const lockedGuest =
    suggestion.status &&
    suggestion.status !== "ACTIVE" &&
    suggestion.listPrice == null;
  const locality = [suggestion.city, suggestion.province, suggestion.community]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <span className="relative size-14 shrink-0 overflow-hidden rounded bg-mist sm:size-16">
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
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            {lockedGuest ? (
              <span className="block text-[15px] font-semibold text-ink/55">
                Sign in for details
              </span>
            ) : suggestion.listPrice != null ? (
              <span className="block text-base font-bold tracking-tight text-canopy">
                {formatListPrice(
                  suggestion.listPrice,
                  suggestion.transactionType ?? "SALE",
                )}
              </span>
            ) : null}
            <span className="mt-0.5 block text-[15px] font-semibold leading-snug text-ink">
              {suggestion.label}
            </span>
          </span>
          {statusLabel ? (
            <span
              className={cn(
                "shrink-0 pt-0.5 text-sm font-semibold",
                suggestion.status === "ACTIVE"
                  ? "text-canopy"
                  : "text-danger",
              )}
            >
              {statusLabel}
            </span>
          ) : null}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/65">
          {suggestion.beds != null ? (
            <span className="inline-flex items-center gap-1 font-medium">
              <Bed className="size-3.5 text-canopy" aria-hidden />
              {suggestion.beds}
            </span>
          ) : null}
          {suggestion.baths != null ? (
            <span className="inline-flex items-center gap-1 font-medium">
              <Bath className="size-3.5 text-canopy" aria-hidden />
              {suggestion.baths}
            </span>
          ) : null}
          {suggestion.mlsNumber ? (
            <span className="font-medium text-ink/50">
              MLS® {suggestion.mlsNumber}
            </span>
          ) : null}
        </span>
        {locality ? (
          <span className="mt-1 block truncate text-sm text-ink/55">
            {locality}
          </span>
        ) : suggestion.subtitle ? (
          <span className="mt-1 block truncate text-sm text-ink/55">
            {suggestion.subtitle}
          </span>
        ) : null}
      </span>
    </>
  );
}
