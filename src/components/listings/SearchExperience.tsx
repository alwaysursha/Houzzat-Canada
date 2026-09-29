"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClientAccess } from "@/hooks/use-client-access";
import {
  ArrowUpDown,
  ChevronDown,
  Columns2,
  LayoutGrid,
  ListFilter,
  Map as MapIcon,
} from "lucide-react";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { pushHref } from "@/lib/listings/navigate-listing";
import { RouteStartIcon } from "@/components/icons/RouteStartIcon";
import { SaveSearchButton } from "@/components/account/SaveSearchButton";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import {
  countActiveSearchFilters,
  type SearchFilters,
  type SearchViewMode,
} from "@/components/listings/SearchFilterChips";
import { SearchFiltersMenu } from "@/components/listings/SearchFiltersMenu";
import { SearchFiltersSheet } from "@/components/listings/SearchFiltersSheet";
import { MapSearchCoachMarks } from "@/components/listings/MapSearchCoachMarks";
import { SearchToolbarChips } from "@/components/listings/SearchResultsContext";
import { SearchResultsPane } from "@/components/listings/SearchResultsPane";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import {
  parseInitialStatuses,
  parseSearchPropertyTypes,
  parseSearchSort,
  parseSearchView,
  searchPageHref,
  statusesQueryValue,
} from "@/lib/listings/search-page-href";
import {
  searchResultsCopy,
  type SearchResultChipKey,
} from "@/lib/listings/search-results-copy";
import { pointInPolygon, polygonBBox } from "@/lib/maps/geo";
import { cityMapCenter } from "@/lib/geo/regions";
import { cn } from "@/lib/utils";

/** MapLibre stays out of the List/cards bundle until Map (or Split) is shown. */
const SearchMap = dynamic(
  () =>
    import("@/components/listings/SearchMap").then((m) => m.SearchMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-mist text-sm text-ink/45">
        Loading map…
      </div>
    ),
  },
);

type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type LngLat = [number, number];

export function SearchExperience() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchBasePath =
    pathname === "/admin/search" || pathname === "/agent/search"
      ? pathname
      : "/search";
  const access = useClientAccess();
  /** Session present — for save/watch CTAs. */
  const signedIn = access.isSignedIn;
  /** VOW / sold unlock — never treat verify-locked as unlocked. */
  const hasClientAccess = access.hasClientAccess;
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<ListingCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [activeMls, setActiveMls] = useState<string | null>(null);
  const [provider, setProvider] = useState("mock");
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
  } | null>(null);
  const [appliedBounds, setAppliedBounds] = useState<Bounds | null>(null);
  const [polygon, setPolygon] = useState<LngLat[] | null>(null);
  const boundsApplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedBoundsRef = useRef<Bounds | null>(null);
  appliedBoundsRef.current = appliedBounds;
  const viewToggleRef = useRef<HTMLDivElement>(null);
  const saveSearchRef = useRef<HTMLDivElement>(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [placeQueryCleared, setPlaceQueryCleared] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    function sync() {
      setIsNarrow(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const txnParam = searchParams.get("transactionType");
  const initialTxn: SearchFilters["transactionType"] =
    txnParam === "LEASE" || txnParam === "ALL" || txnParam === "SALE"
      ? txnParam
      : searchParams.get("dataSource") === "fsbo"
        ? "ALL"
        : "SALE";

  const [filters, setFilters] = useState<SearchFilters>({
    segment:
      (searchParams.get("segment") as SearchFilters["segment"]) ||
      "RESIDENTIAL",
    transactionType: initialTxn,
    dataSource: searchParams.get("dataSource") === "fsbo" ? "fsbo" : "",
    city: searchParams.get("city") ?? "",
    community: searchParams.get("community") ?? "",
    minPrice: searchParams.get("minPrice") ?? "",
    maxPrice: searchParams.get("maxPrice") ?? "",
    minBeds: searchParams.get("minBeds") ?? "",
    minBaths: searchParams.get("minBaths") ?? "",
    propertyTypes: parseSearchPropertyTypes(searchParams.get("propertyTypes")),
    openHouseOnly: searchParams.get("openHouseOnly") === "1",
    statuses: parseInitialStatuses(
      searchParams.get("status"),
      initialTxn === "LEASE",
    ),
    sort: parseSearchSort(searchParams.get("sort")),
  });

  const [view, setView] = useState<SearchViewMode>(() =>
    parseSearchView(searchParams.get("view"), false),
  );
  const viewRef = useRef(view);
  viewRef.current = view;

  // Explicit ?view= stays in sync. No param means the discovery split, which
  // is the initial state — later search updates must not reset a chosen mode.
  useEffect(() => {
    const fromUrl = searchParams.get("view");
    if (fromUrl === "map" || fromUrl === "cards" || fromUrl === "split") {
      setView(fromUrl);
    }
  }, [searchParams]);

  const communitiesParam = searchParams.get("communities") ?? "";
  const citiesParam = searchParams.get("cities") ?? "";
  const qParam = searchParams.get("q") ?? "";

  // Keep filter state aligned when URL changes (autocomplete / typed city search).
  useEffect(() => {
    const txn = searchParams.get("transactionType");
    const nextTxn: SearchFilters["transactionType"] =
      txn === "LEASE" || txn === "ALL" || txn === "SALE"
        ? txn
        : searchParams.get("dataSource") === "fsbo"
          ? "ALL"
          : "SALE";
    setFilters((prev) => ({
      ...prev,
      segment:
        (searchParams.get("segment") as SearchFilters["segment"]) ||
        "RESIDENTIAL",
      transactionType: nextTxn,
      dataSource: searchParams.get("dataSource") === "fsbo" ? "fsbo" : "",
      city: searchParams.get("city") ?? "",
      community: searchParams.get("community") ?? "",
      minPrice: searchParams.get("minPrice") ?? "",
      maxPrice: searchParams.get("maxPrice") ?? "",
      minBeds: searchParams.get("minBeds") ?? "",
      minBaths: searchParams.get("minBaths") ?? "",
      propertyTypes: parseSearchPropertyTypes(searchParams.get("propertyTypes")),
      openHouseOnly: searchParams.get("openHouseOnly") === "1",
      statuses: parseInitialStatuses(
        searchParams.get("status"),
        nextTxn === "LEASE",
      ),
      sort: parseSearchSort(searchParams.get("sort")),
    }));
  }, [searchParams]);

  const placeFilterActive = Boolean(
    filters.city.trim() ||
      filters.community.trim() ||
      citiesParam.trim() ||
      communitiesParam.trim(),
  );

  // Place search owns the criteria — drop stale map-area bounds.
  useEffect(() => {
    if (!placeFilterActive) return;
    setAppliedBounds(null);
    setPolygon(null);
  }, [placeFilterActive, filters.city, filters.community, citiesParam, communitiesParam]);

  useEffect(() => {
    return () => {
      if (boundsApplyTimer.current) clearTimeout(boundsApplyTimer.current);
    };
  }, []);

  const searchBarQuery = placeQueryCleared
    ? ""
    : filters.community.trim() ||
      filters.city.trim() ||
      qParam.trim() ||
      "";

  useEffect(() => {
    if (!placeQueryCleared) return;
    if (
      !qParam.trim() &&
      !filters.city.trim() &&
      !filters.community.trim()
    ) {
      setPlaceQueryCleared(false);
    }
  }, [placeQueryCleared, qParam, filters.city, filters.community]);

  // Fly map to the selected city (don't rely on map viewport for results).
  useEffect(() => {
    const center = cityMapCenter(filters.city);
    if (!center) return;
    setFocus({ lat: center.lat, lng: center.lng, zoom: 11 });
  }, [filters.city]);

  const syncUrl = useCallback(
    (
      next: SearchFilters,
      nextView: SearchViewMode = view,
      options?: { clearMultiPlace?: boolean; clearQuery?: boolean },
    ) => {
      router.replace(
        searchPageHref({
          pathname,
          filters: next,
          view: nextView,
          cities: citiesParam,
          communities: communitiesParam,
          q: qParam,
          clearMultiPlace: options?.clearMultiPlace,
          clearQuery: options?.clearQuery,
        }),
        { scroll: false },
      );
    },
    [citiesParam, communitiesParam, pathname, qParam, router, view],
  );

  const searchCallbackPath = useCallback(
    (next: SearchFilters) =>
      searchPageHref({
        pathname,
        filters: next,
        view,
        cities: citiesParam,
        communities: communitiesParam,
        q: qParam,
      }),
    [citiesParam, communitiesParam, pathname, qParam, view],
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.segment && filters.segment !== "ALL") {
      params.set("segment", filters.segment);
    } else if (filters.segment === "ALL") {
      params.set("segment", "ALL");
    }
    params.set("transactionType", filters.transactionType);
    if (filters.dataSource) params.set("dataSource", filters.dataSource);
    if (citiesParam) {
      params.set("cities", citiesParam);
    } else if (filters.city) {
      params.set("city", filters.city);
    }
    if (communitiesParam) {
      params.set("communities", communitiesParam);
    } else if (filters.community) {
      params.set("community", filters.community);
    }
    if (filters.propertyTypes.length) {
      params.set("propertyTypes", filters.propertyTypes.join(","));
    }
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.minBeds) params.set("minBeds", filters.minBeds);
    if (filters.minBaths) params.set("minBaths", filters.minBaths);
    if (filters.openHouseOnly) params.set("openHouseOnly", "1");
    const statusQ = statusesQueryValue(filters.statuses);
    if (statusQ) params.set("status", statusQ);
    params.set("sort", filters.sort);
    if (qParam) params.set("q", qParam);

    const box = polygon
      ? polygonBBox(polygon)
      : appliedBounds;
    // City / multi-city / community search must not be AND'd with the map
    // viewport — the first map frame is often the wrong city and returns 0.
    // Bounds apply for map pan auto-search, draw-polygon, or no place filter.
    if (box && (polygon || !placeFilterActive)) {
      params.set("west", String(box.west));
      params.set("south", String(box.south));
      params.set("east", String(box.east));
      params.set("north", String(box.north));
    }
    // Map views need denser pins; card list stays lighter.
    const densePins = view === "map" || view === "split";
    params.set("limit", densePins ? "500" : "60");
    return params.toString();
  }, [
    filters,
    appliedBounds,
    citiesParam,
    communitiesParam,
    polygon,
    qParam,
    placeFilterActive,
    view,
  ]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/listings/search?${queryString}`);
    const data = (await res.json()) as {
      items?: ListingCardData[];
      total?: number;
      provider?: string;
    };
    let nextItems = data.items ?? [];
    if (polygon && polygon.length >= 3) {
      nextItems = nextItems.filter((item) =>
        pointInPolygon(item.lng, item.lat, polygon),
      );
    }
    setItems(nextItems);
    setTotal(polygon ? nextItems.length : (data.total ?? nextItems.length));
    setProvider(data.provider ?? "mock");
  }, [queryString, polygon]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    if (lat && lng) {
      setFocus({ lat: Number(lat), lng: Number(lng), zoom: 12 });
    }
  }, [searchParams]);

  function updateFilters(next: SearchFilters) {
    setFilters(next);
    syncUrl(next, view);
  }

  function updateView(next: SearchViewMode) {
    viewRef.current = next;
    setView(next);
    syncUrl(filters, next);
  }

  function onPlaceSelect(suggestion: AutocompleteSuggestion) {
    setPlaceQueryCleared(false);
    if (suggestion.action === "near_me" && suggestion.href) {
      pushHref(router, suggestion.href);
      return;
    }
    if (suggestion.mlsNumber) {
      pushHref(
        router,
        suggestion.href ?? `/listing/${suggestion.mlsNumber}`,
      );
      return;
    }
    if (suggestion.href?.startsWith("/search")) {
      const staffHref =
        searchBasePath === "/search"
          ? suggestion.href
          : suggestion.href.replace(/^\/search/, searchBasePath);
      pushHref(router, staffHref);
      return;
    }
    if (suggestion.lat != null && suggestion.lng != null) {
      setFocus({ lat: suggestion.lat, lng: suggestion.lng, zoom: 12 });
    }
    if (
      suggestion.type === "city" ||
      suggestion.type === "community" ||
      suggestion.type === "place"
    ) {
      const next = {
        ...filters,
        city: suggestion.city ?? suggestion.subtitle ?? filters.city,
        community:
          suggestion.type === "community"
            ? (suggestion.community ?? suggestion.label)
            : filters.community,
      };
      updateFilters(next);
    }
  }

  function onBarSearchClear() {
    setPlaceQueryCleared(true);
    const next = { ...filters, city: "", community: "" };
    setFilters(next);
    syncUrl(next, view, { clearMultiPlace: true, clearQuery: true });
  }

  function onBarSearchSubmit(raw: string) {
    setPlaceQueryCleared(false);
    const parsed = parseSearchQuery(raw);
    const txn =
      parsed.transactionType ??
      (filters.transactionType === "LEASE" || filters.transactionType === "SALE"
        ? filters.transactionType
        : "SALE");
    const href = searchHrefFromParsed(
      { ...parsed, transactionType: txn, hasFilters: true },
      { transactionType: txn, basePath: searchBasePath },
    );
    router.push(href);
  }

  function onMapBoundsChange(next: Bounds) {
    // Draw-polygon mode owns the search area until cleared.
    if (polygon) return;

    const prev = appliedBoundsRef.current;
    if (
      prev &&
      Math.abs(next.west - prev.west) < 0.0008 &&
      Math.abs(next.south - prev.south) < 0.0008 &&
      Math.abs(next.east - prev.east) < 0.0008 &&
      Math.abs(next.north - prev.north) < 0.0008
    ) {
      return;
    }

    if (boundsApplyTimer.current) clearTimeout(boundsApplyTimer.current);
    // Debounce so continuous pan/zoom doesn't hammer the API.
    boundsApplyTimer.current = setTimeout(() => {
      if (prev) setMapMoved(true);
      setAppliedBounds(next);
      // Viewport owns search after the user moves the map — drop place filters.
      setFilters((f) => {
        const hadPlace = Boolean(
          f.city.trim() ||
            f.community.trim() ||
            citiesParam.trim() ||
            communitiesParam.trim(),
        );
        if (!hadPlace) return f;
        const cleared = { ...f, city: "", community: "" };
        syncUrl(cleared, viewRef.current, { clearMultiPlace: true });
        return cleared;
      });
    }, prev ? 400 : 0);
  }

  function onPolygonChange(ring: LngLat[] | null) {
    setPolygon(ring);
    if (ring && ring.length >= 3) {
      if (boundsApplyTimer.current) clearTimeout(boundsApplyTimer.current);
      setAppliedBounds(polygonBBox(ring));
    }
  }

  const isLease = filters.transactionType === "LEASE";
  const transactionButtons: Array<[SearchFilters["transactionType"], string]> =
    [
      ["SALE", "Buy"],
      ["LEASE", "Rent"],
    ];
  if (filters.dataSource === "fsbo") {
    transactionButtons.push(["ALL", "Both"]);
  }

  const showMap = view === "split" || view === "map";
  const showList = view === "split" || view === "cards";
  const activeFilterCount = countActiveSearchFilters(filters);
  const activeListing = items.find((i) => i.mlsNumber === activeMls) ?? null;
  const coachFilterIntentKey = [
    filters.city,
    filters.community,
    filters.minPrice,
    filters.maxPrice,
    filters.minBeds,
    filters.minBaths,
    filters.propertyTypes.join(","),
    filters.statuses.join(","),
    filters.openHouseOnly ? "1" : "0",
    citiesParam,
    communitiesParam,
  ].join("|");

  const noun =
    filters.segment === "COMMERCIAL"
      ? "properties"
      : isLease
        ? "rentals"
        : "homes";

  const resultsCopy = useMemo(
    () =>
      searchResultsCopy({
        transactionType: filters.transactionType,
        segment: filters.segment,
        city: filters.city,
        community: filters.community,
        cities: citiesParam,
        communities: communitiesParam,
        q: qParam,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minBeds: filters.minBeds,
        minBaths: filters.minBaths,
        propertyTypes: filters.propertyTypes,
        openHouseOnly: filters.openHouseOnly,
        statuses: filters.statuses,
        total,
        pending,
      }),
    [citiesParam, communitiesParam, filters, pending, qParam, total],
  );

  const countLabel = pending
    ? "Updating"
    : `${Math.max(0, total).toLocaleString("en-CA")} results`;

  const savedSearchQuery = useMemo(
    () => ({
      segment: filters.segment !== "RESIDENTIAL" ? filters.segment : undefined,
      transactionType:
        filters.transactionType !== "ALL" ? filters.transactionType : undefined,
      dataSource: filters.dataSource || undefined,
      city: filters.city || undefined,
      community: filters.community || undefined,
      propertyTypes: filters.propertyTypes.length
        ? filters.propertyTypes.join(",")
        : undefined,
      minPrice: filters.minPrice || undefined,
      maxPrice: filters.maxPrice || undefined,
      minBeds: filters.minBeds || undefined,
      minBaths: filters.minBaths || undefined,
      openHouseOnly: filters.openHouseOnly ? "1" : undefined,
      status: statusesQueryValue(filters.statuses) ?? undefined,
      sort: filters.sort !== "newest" ? filters.sort : undefined,
    }),
    [filters],
  );

  function clearResultChip(key: SearchResultChipKey) {
    switch (key) {
      case "transaction":
        return;
      case "price":
        updateFilters({ ...filters, minPrice: "", maxPrice: "" });
        return;
      case "beds":
        updateFilters({ ...filters, minBeds: "" });
        return;
      case "baths":
        updateFilters({ ...filters, minBaths: "" });
        return;
      case "types":
        updateFilters({ ...filters, propertyTypes: [] });
        return;
      case "openHouse":
        updateFilters({ ...filters, openHouseOnly: false });
        return;
      case "segment":
        updateFilters({ ...filters, segment: "RESIDENTIAL" });
        return;
      case "status":
        updateFilters({ ...filters, statuses: ["ACTIVE"] });
        return;
      case "place": {
        const next = { ...filters, city: "", community: "" };
        setFilters(next);
        syncUrl(next, view, { clearMultiPlace: true });
        return;
      }
      case "query":
        setPlaceQueryCleared(true);
        syncUrl(filters, view, { clearQuery: true });
        return;
      default: {
        const unexpected: never = key;
        return unexpected;
      }
    }
  }

  const filterPreviewExtras = useMemo(
    () => ({
      cities: citiesParam || undefined,
      communities: communitiesParam || undefined,
      q: qParam || undefined,
      ...(appliedBounds && !placeFilterActive
        ? {
            west: appliedBounds.west,
            south: appliedBounds.south,
            east: appliedBounds.east,
            north: appliedBounds.north,
          }
        : {}),
    }),
    [
      citiesParam,
      communitiesParam,
      qParam,
      appliedBounds,
      placeFilterActive,
    ],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-line/80 bg-surface px-3 py-2 sm:px-4 sm:py-2.5">
        {isNarrow ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 rounded-full bg-mist p-0.5">
              {transactionButtons.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    updateFilters({
                      ...filters,
                      transactionType: value,
                      statuses: ["ACTIVE"],
                      openHouseOnly:
                        value === "LEASE" ? false : filters.openHouseOnly,
                    });
                  }}
                  className={cn(
                    "min-h-11 rounded-full px-3.5 text-sm font-semibold transition",
                    filters.transactionType === value
                      ? "bg-canopy text-white shadow-sm"
                      : "text-ink/55 hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              data-search-bar
              className="min-w-0 flex-1 rounded-full border border-line bg-mist/60 px-1"
            >
              <AddressAutocomplete
                initialQuery={searchBarQuery}
                transactionType={
                  filters.transactionType === "LEASE" ||
                  filters.transactionType === "SALE"
                    ? filters.transactionType
                    : undefined
                }
                placeholder="City, neighbourhood, address…"
                inputClassName="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
                onPlaceSelect={onPlaceSelect}
                onSearchSubmit={onBarSearchSubmit}
                onClear={onBarSearchClear}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div
              ref={viewToggleRef}
              className="flex shrink-0 rounded-full border border-line bg-mist p-0.5"
            >
              {(
                [
                  ["map", MapIcon, "Map"],
                  ["split", Columns2, "Split"],
                  ["cards", LayoutGrid, "List"],
                ] as const
              ).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-label={label}
                  title={label}
                  onClick={() => updateView(mode)}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-full transition",
                    view === mode
                      ? "bg-surface text-canopy shadow-sm"
                      : "text-ink/45 hover:text-ink",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-ink"
            >
                <ListFilter className="size-3.5" aria-hidden />
                Filters
                {activeFilterCount > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-canopy px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
            </button>
            <SearchToolbarChips
              chips={resultsCopy.chips}
              onClearChip={clearResultChip}
            />

            <label className="group relative inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-line bg-surface px-2.5">
              <ArrowUpDown className="size-3.5 shrink-0 text-canopy" aria-hidden />
              <span className="text-xs font-semibold text-ink">
                {filters.sort === "newest"
                  ? "Newest"
                  : filters.sort === "price_desc"
                    ? "Price ↓"
                    : "Price ↑"}
              </span>
              <select
                aria-label="Sort listings"
                value={filters.sort}
                onChange={(e) =>
                  updateFilters({
                    ...filters,
                    sort: e.target.value as SearchFilters["sort"],
                  })
                }
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="newest">Newest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>
            <div ref={saveSearchRef} className="inline-flex shrink-0">
              <SaveSearchButton
                signedIn={signedIn}
                callbackPath={searchCallbackPath(filters)}
                query={savedSearchQuery}
              />
            </div>
            <WatchAreaButton
              signedIn={signedIn}
              city={filters.city}
              community={filters.community || undefined}
              transactionType={filters.transactionType}
              segment={filters.segment}
              idleLabel="Watch"
              authCallbackUrl={searchCallbackPath(filters)}
              className="h-8 shrink-0 rounded-full px-2.5"
            />
            <Link
              href="/route-planner"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-canopy/20 bg-canopy/10 px-2.5 text-xs font-semibold text-canopy"
            >
              <RouteStartIcon />
              Plan
            </Link>
          </div>
        </div>
        ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-mist p-0.5">
              {transactionButtons.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    updateFilters({
                      ...filters,
                      transactionType: value,
                      statuses: ["ACTIVE"],
                      openHouseOnly:
                        value === "LEASE" ? false : filters.openHouseOnly,
                    });
                  }}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
                    filters.transactionType === value
                      ? "bg-canopy text-white shadow-sm"
                      : "text-ink/55 hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              data-search-bar
              className="min-w-0 flex-1 basis-[16rem] rounded-full border border-line bg-mist/60 px-1"
            >
              <AddressAutocomplete
                initialQuery={searchBarQuery}
                transactionType={
                  filters.transactionType === "LEASE" ||
                  filters.transactionType === "SALE"
                    ? filters.transactionType
                    : undefined
                }
                placeholder="City, neighbourhood, address, or MLS® #"
                inputClassName="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
                onPlaceSelect={onPlaceSelect}
                onSearchSubmit={onBarSearchSubmit}
                onClear={onBarSearchClear}
              />
            </div>

            <div className="flex items-center gap-2">
              <div
                ref={isNarrow ? undefined : viewToggleRef}
                className="flex rounded-full border border-line bg-mist p-0.5"
              >
                {(
                  [
                    ["map", MapIcon, "Map"],
                    ["split", Columns2, "Split"],
                    ["cards", LayoutGrid, "Cards"],
                  ] as const
                )
                  .filter(([mode]) => !(isNarrow && mode === "split"))
                  .map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-label={label}
                      title={label}
                      onClick={() => updateView(mode)}
                      className={cn(
                        "inline-flex size-9 items-center justify-center rounded-full transition",
                        view === mode
                          ? "bg-surface text-canopy shadow-sm"
                          : "text-ink/45 hover:text-ink",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </button>
                  ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SearchFiltersMenu
                filters={filters}
                onChange={updateFilters}
                resultCount={total}
                resultNoun={noun}
                signedIn={signedIn}
                previewExtras={filterPreviewExtras}
                searchCallbackPath={searchCallbackPath}
                hidePlaceChip
              />
              <SearchToolbarChips
                chips={resultsCopy.chips}
                onClearChip={clearResultChip}
              />
            <label className="group relative inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-xs transition hover:border-canopy/40">
                <ArrowUpDown className="size-3.5 shrink-0 text-canopy" aria-hidden />
                <span className="text-xs font-semibold text-ink">
                  {filters.sort === "newest"
                    ? "Newest"
                    : filters.sort === "price_desc"
                      ? "Price ↓"
                      : "Price ↑"}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-ink/35" aria-hidden />
                <select
                  aria-label="Sort listings"
                  value={filters.sort}
                  onChange={(e) =>
                    updateFilters({
                      ...filters,
                      sort: e.target.value as SearchFilters["sort"],
                    })
                  }
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                </select>
              </label>
              <div ref={saveSearchRef} className="inline-flex">
                <SaveSearchButton
                  signedIn={signedIn}
                  callbackPath={searchCallbackPath(filters)}
                  query={savedSearchQuery}
                />
              </div>
              <WatchAreaButton
                signedIn={signedIn}
                city={filters.city}
                community={filters.community || undefined}
                transactionType={filters.transactionType}
                segment={filters.segment}
                idleLabel="Watch area"
                authCallbackUrl={searchCallbackPath(filters)}
                className="h-8 rounded-full px-2.5"
              />
              <Link
                href="/route-planner"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-canopy/20 bg-canopy/10 px-2.5 text-xs font-semibold text-canopy transition hover:bg-canopy/15"
              >
                <RouteStartIcon />
                Plan viewings
              </Link>
              {filters.dataSource === "fsbo" ? (
                <button
                  type="button"
                  onClick={() => updateFilters({ ...filters, dataSource: "" })}
                  className="rounded-full bg-signal/15 px-2.5 py-1 text-xs font-semibold text-signal"
                >
                  By owner · clear
                </button>
              ) : null}
          </div>
        </div>
        )}
      </div>

      <div
        className={cn(
          "relative min-h-0 flex-1",
          view === "split" && "flex flex-col lg:flex-row",
        )}
      >
        {view === "split" ? (
          <style>{`
            @media (max-width: 1023px) {
              .search-split-map {
                width: 100%;
                height: 38vh;
                min-height: 11rem;
                max-height: 45vh;
                flex: none;
              }
            }
            @media (min-width: 1024px) {
              .search-split-map {
                width: 48%;
                max-width: 48%;
                flex: 0 0 48%;
                height: 100%;
              }
            }
          `}</style>
        ) : null}
        {showMap ? (
          <div
            className={cn(
              "relative min-h-0 bg-mist",
              view === "map" && "h-full w-full",
              view === "split" && "search-split-map w-full",
            )}
          >
            <SearchMap
              listings={items}
              activeMls={activeMls}
              activeListing={activeListing}
              focus={focus}
              onSelect={setActiveMls}
              onClearSelection={() => setActiveMls(null)}
              onBoundsChange={onMapBoundsChange}
              polygon={polygon}
              onPolygonChange={onPolygonChange}
              status={filters.statuses}
              isLease={isLease}
              onStatusToggle={(value) => {
                const selected = filters.statuses.includes(value);
                const nextStatuses = selected
                  ? filters.statuses.length === 1
                    ? filters.statuses
                    : filters.statuses.filter((s) => s !== value)
                  : [...filters.statuses, value];
                updateFilters({ ...filters, statuses: nextStatuses });
                setActiveMls(null);
              }}
              onOpenFilters={
                isNarrow ? () => setFiltersOpen(true) : undefined
              }
              activeFilterCount={activeFilterCount}
              className="h-full w-full"
            />
          </div>
        ) : null}

        {showList ? (
          <div
            className={cn(
              "min-h-0 bg-mist/40",
              view === "cards" && "h-full w-full",
              view === "split" && "min-w-0 flex-1 border-line/70 lg:border-l",
            )}
          >
            <SearchResultsPane
              items={items}
              activeMls={activeMls}
              onFocus={setActiveMls}
              signedIn={signedIn}
              hasClientAccess={hasClientAccess}
              pending={pending}
              horizontal={isNarrow}
              wideGrid={!isNarrow && view === "cards"}
              title={resultsCopy.title}
              countLabel={countLabel}
              emptyHint={
                polygon
                  ? "Clear the draw or expand it."
                  : "Adjust your filters or search this map area."
              }
            />
          </div>
        ) : null}
      </div>

      {isNarrow ? (
        <SearchFiltersSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          filters={filters}
          onChange={updateFilters}
          resultCount={total}
          pending={pending}
          resultNoun={noun}
          signedIn={signedIn}
          callbackPath={searchCallbackPath(filters)}
        />
      ) : null}

      <MapSearchCoachMarks
        enabled={view === "map"}
        viewToggleRef={viewToggleRef}
        saveSearchRef={saveSearchRef}
        mapMoved={mapMoved}
        filterIntentKey={coachFilterIntentKey}
      />
    </div>
  );
}
