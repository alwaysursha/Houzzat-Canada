"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClientAccess } from "@/hooks/use-client-access";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Columns2,
  LayoutGrid,
  ListFilter,
  Map as MapIcon,
} from "lucide-react";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { pushHref } from "@/lib/listings/navigate-listing";
import { listingPath } from "@/lib/listings/listing-path";
import { persistBrowseSearchUrl } from "@/lib/auth/browse-search-context";
import { publishListingBrowseSource } from "@/lib/mobile/listing-browse-source";
import { RouteStartIcon } from "@/components/icons/RouteStartIcon";
import { SaveSearchButton } from "@/components/account/SaveSearchButton";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import {
  countActiveSearchFilters,
  resetSearchFilters,
  type SearchFilters,
  type SearchViewMode,
} from "@/components/listings/SearchFilterChips";
import { SearchActiveFilterStrip } from "@/components/listings/SearchActiveFilterStrip";
import { SearchDesktopFilterPanel } from "@/components/listings/SearchDesktopFilterPanel";
import { SearchFiltersMenu } from "@/components/listings/SearchFiltersMenu";
import { SearchFiltersSheet } from "@/components/listings/SearchFiltersSheet";
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
  type SearchResultChip,
} from "@/lib/listings/search-results-copy";
import {
  appendPlaceAndBoundsParams,
  listingSearchBoundsBox,
  mapGestureSearchThisAreaState,
  searchPlaceKey,
  shouldResetMapAreaForPlaceChange,
} from "@/lib/listings/map-area-search";
import { searchFiltersToSavedQuery } from "@/lib/listings/saved-search-query";
import { citiesParamForFilterSync } from "@/lib/listings/search-url-cities";
import {
  structuredCitiesFromSearch,
  withStructuredCity,
} from "@/lib/listings/structured-cities";
import { pointInPolygon, polygonBBox } from "@/lib/maps/geo";
import {
  listingResultFrame,
  searchMapCentroidFrame,
  searchMapGeographyKey,
  searchMapNeedsResultFit,
  type MapFrame,
} from "@/lib/geo/search-map-fit";
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

const VIEW_MODES = [
  ["cards", LayoutGrid, "Cards"],
  ["map", MapIcon, "Map"],
  ["split", Columns2, "Split"],
] as const;

function SearchViewModeSwitch({
  view,
  onChange,
  hideSplit = false,
  size = "md",
}: {
  view: SearchViewMode;
  onChange: (mode: SearchViewMode) => void;
  hideSplit?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div
      className="flex shrink-0 rounded-full border border-line bg-mist p-0.5"
      role="group"
      aria-label="Search view"
    >
      {VIEW_MODES.filter(([mode]) => !(hideSplit && mode === "split")).map(
        ([mode, Icon, label]) => (
          <button
            key={mode}
            type="button"
            aria-label={label}
            aria-pressed={view === mode}
            title={label}
            onClick={() => onChange(mode)}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-full font-semibold transition",
              size === "sm"
                ? "h-8 px-2.5 text-xs"
                : "h-9 px-3 text-xs sm:text-sm",
              view === mode
                ? "bg-surface text-canopy shadow-sm"
                : "text-ink/45 hover:text-ink",
            )}
          >
            <Icon className="size-3.5 shrink-0 sm:size-4" aria-hidden />
            <span>{label}</span>
          </button>
        ),
      )}
    </div>
  );
}

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
  const [mapFrame, setMapFrame] = useState<(MapFrame & { token: string }) | null>(
    null,
  );
  const [appliedBounds, setAppliedBounds] = useState<Bounds | null>(null);
  /** User-panned viewport awaiting an explicit Search This Area click. */
  const [pendingMapBounds, setPendingMapBounds] = useState<Bounds | null>(null);
  const [searchThisAreaVisible, setSearchThisAreaVisible] = useState(false);
  const [polygon, setPolygon] = useState<LngLat[] | null>(null);
  const boundsApplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedBoundsRef = useRef<Bounds | null>(null);
  appliedBoundsRef.current = appliedBounds;
  const [isNarrow, setIsNarrow] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [placeQueryCleared, setPlaceQueryCleared] = useState(false);
  const [cityEntryToken, setCityEntryToken] = useState(0);
  const [resultsSheetOpen, setResultsSheetOpen] = useState(false);
  const splitStageRef = useRef<HTMLDivElement>(null);
  const sheetPointerHandledRef = useRef(false);
  const resumeCameraRef = useRef<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);
  const framedTokenRef = useRef("");
  const mapPinnedToRef = useRef<string | null>(null);
  const resultFitKeyRef = useRef<string | null>(null);
  const itemsGeoKeyRef = useRef<string | null>(null);
  const geoKeyRef = useRef("");
  const loadSeqRef = useRef(0);

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
  /**
   * Optimistic cities while router.replace catches up. Clearing filters.city
   * before `cities` lands in the URL must not briefly search all cities.
   */
  const [citiesOverride, setCitiesOverride] = useState<string[] | null>(null);

  useEffect(() => {
    if (citiesOverride == null) return;
    if (citiesParam === citiesOverride.join("|")) {
      setCitiesOverride(null);
    }
  }, [citiesParam, citiesOverride]);

  const structuredCities = useMemo(() => {
    if (citiesOverride != null) return citiesOverride;
    return structuredCitiesFromSearch(citiesParam, filters.city);
  }, [citiesOverride, citiesParam, filters.city]);
  const citiesQueryParam = structuredCities.join("|");

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

  // Survive client navigation to listing detail so signup captureContext
  // still knows city/price (document.referrer is unreliable in the App Router).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname.startsWith("/search")) return;
    persistBrowseSearchUrl(window.location.href);
  }, [pathname, searchParams]);

  const placeFilterActive = Boolean(
    filters.city.trim() ||
      filters.community.trim() ||
      citiesQueryParam.trim() ||
      communitiesParam.trim(),
  );
  const placeKey = searchPlaceKey({
    city: filters.city,
    community: filters.community,
    cities: citiesQueryParam,
    communities: communitiesParam,
  });
  const placeKeyRef = useRef(placeKey);
  const mapGeography = useMemo(
    () => ({
      city: filters.city,
      community: filters.community,
      cities: citiesQueryParam,
      communities: communitiesParam,
      q: qParam,
    }),
    [citiesQueryParam, communitiesParam, filters.city, filters.community, qParam],
  );
  const mapGeographyKey = searchMapGeographyKey(mapGeography);
  geoKeyRef.current = mapGeographyKey;

  // When place criteria change, drop stale Search This Area / draw bounds.
  useEffect(() => {
    const prev = placeKeyRef.current;
    placeKeyRef.current = placeKey;
    if (!shouldResetMapAreaForPlaceChange(prev, placeKey)) return;
    setAppliedBounds(null);
    setPendingMapBounds(null);
    setSearchThisAreaVisible(false);
    setPolygon(null);
  }, [placeKey]);

  useEffect(() => {
    return () => {
      if (boundsApplyTimer.current) clearTimeout(boundsApplyTimer.current);
    };
  }, []);

  const searchBarQuery = placeQueryCleared
    ? ""
    : filters.community.trim() ||
      filters.city.trim() ||
      (structuredCities.length === 1 ? structuredCities[0]! : "") ||
      (structuredCities.length > 1 ? structuredCities.join(", ") : "") ||
      qParam.trim() ||
      "";

  useEffect(() => {
    if (!placeQueryCleared) return;
    if (
      !qParam.trim() &&
      !filters.city.trim() &&
      !filters.community.trim() &&
      structuredCities.length === 0
    ) {
      setPlaceQueryCleared(false);
    }
  }, [
    placeQueryCleared,
    qParam,
    filters.city,
    filters.community,
    structuredCities.length,
  ]);

  // Move the map once when the place changes. Known cities use existing
  // centroids. Neighbourhoods and other free text wait for listing coordinates.
  useEffect(() => {
    mapPinnedToRef.current = null;
    resultFitKeyRef.current = null;
    itemsGeoKeyRef.current = null;
    const frame = searchMapCentroidFrame(mapGeography);
    if (!frame) return;
    setMapFrame({ ...frame, token: `place:${mapGeographyKey}` });
  }, [mapGeography, mapGeographyKey]);

  useEffect(() => {
    if (!mapGeographyKey) return;
    if (mapPinnedToRef.current === mapGeographyKey) return;
    if (resultFitKeyRef.current === mapGeographyKey) return;
    if (itemsGeoKeyRef.current !== mapGeographyKey) return;
    if (!searchMapNeedsResultFit(mapGeography)) {
      resultFitKeyRef.current = mapGeographyKey;
      return;
    }
    if (polygon) return;
    const frame = listingResultFrame(items);
    if (!frame) return;
    resultFitKeyRef.current = mapGeographyKey;
    setMapFrame({ ...frame, token: `results:${mapGeographyKey}` });
  }, [items, mapGeography, mapGeographyKey, polygon]);

  const syncUrl = useCallback(
    (
      next: SearchFilters,
      nextView: SearchViewMode = view,
      options?: {
        clearMultiPlace?: boolean;
        clearQuery?: boolean;
        cities?: string;
      },
    ) => {
      const cities = citiesParamForFilterSync({
        explicitCities: options?.cities,
        clearMultiPlace: options?.clearMultiPlace,
        urlCitiesParam: citiesParam,
      });
      router.replace(
        searchPageHref({
          pathname,
          filters: next,
          view: nextView,
          cities,
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
    (next: SearchFilters, nextCities?: string[]) =>
      searchPageHref({
        pathname,
        filters: next,
        view,
        cities:
          nextCities !== undefined ? nextCities.join("|") : citiesQueryParam,
        communities: communitiesParam,
        q: qParam,
      }),
    [citiesQueryParam, communitiesParam, pathname, qParam, view],
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

    const box = listingSearchBoundsBox({
      polygonBox: polygon ? polygonBBox(polygon) : null,
      appliedBounds,
    });
    appendPlaceAndBoundsParams(params, {
      citiesPipe: citiesQueryParam,
      city: filters.city,
      communitiesPipe: communitiesParam,
      community: filters.community,
      bounds: box,
    });
    // Map views need denser pins; card list stays lighter.
    const densePins = view === "map" || view === "split";
    params.set("limit", densePins ? "500" : "60");
    return params.toString();
  }, [
    filters,
    appliedBounds,
    citiesQueryParam,
    communitiesParam,
    polygon,
    qParam,
    view,
  ]);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const keyAtStart = geoKeyRef.current;
    const res = await fetch(`/api/listings/search?${queryString}`);
    const data = (await res.json()) as {
      items?: ListingCardData[];
      total?: number;
      provider?: string;
    };
    if (seq !== loadSeqRef.current || geoKeyRef.current !== keyAtStart) return;
    let nextItems = data.items ?? [];
    if (polygon && polygon.length >= 3) {
      nextItems = nextItems.filter((item) =>
        pointInPolygon(item.lng, item.lat, polygon),
      );
    }
    setItems(nextItems);
    setTotal(polygon ? nextItems.length : (data.total ?? nextItems.length));
    setProvider(data.provider ?? "mock");
    itemsGeoKeyRef.current = keyAtStart;
  }, [queryString, polygon]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    publishListingBrowseSource(
      items.length > 0 ? items.map((listing) => listingPath(listing)) : null,
    );
    return () => publishListingBrowseSource(null);
  }, [items]);

  useEffect(() => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    if (lat && lng) {
      setMapFrame({
        token: `latlng:${lat},${lng}`,
        kind: "center",
        lat: Number(lat),
        lng: Number(lng),
        zoom: 12,
      });
    }
  }, [searchParams]);

  function updateFilters(next: SearchFilters) {
    setFilters(next);
    syncUrl(next, view);
  }

  /** Desktop Filters flyout Apply — one URL write for filters + cities. */
  function commitFiltersWithCities(next: SearchFilters, nextCities: string[]) {
    const committed = { ...next, city: "" };
    setCitiesOverride(nextCities);
    setFilters(committed);
    syncUrl(committed, view, { cities: nextCities.join("|") });
  }

  function updateView(next: SearchViewMode) {
    viewRef.current = next;
    setView(next);
    syncUrl(filters, next);
  }

  /** Two-position results sheet. Drag lives on the handle only. Presentation state. */
  function onResultsSheetPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (view !== "split" || !isNarrow) return;
    const stageFound = splitStageRef.current;
    if (!stageFound) return;
    const stageEl: HTMLDivElement = stageFound;
    const height = stageEl.getBoundingClientRect().height;
    if (height <= 0) return;
    const handle = event.currentTarget;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* Capture can fail for a canceled pointer. Listeners still follow the drag. */
    }
    const startY = event.clientY;
    const startPct = resultsSheetOpen ? 0.89 : 0.61;
    let latest = startPct;
    let moved = false;

    function apply(pct: number) {
      stageEl.style.setProperty("--search-sheet", `${(pct * 100).toFixed(2)}%`);
    }

    function onMove(ev: PointerEvent) {
      if (Math.abs(ev.clientY - startY) > 6) moved = true;
      const next = Math.min(0.89, Math.max(0.61, startPct + (startY - ev.clientY) / height));
      latest = next;
      stageEl.classList.add("is-dragging");
      apply(next);
    }

    function finish(ev: PointerEvent) {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture?.(ev.pointerId)) {
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          /* already released */
        }
      }
      const open = moved ? latest >= 0.75 : !resultsSheetOpen;
      stageEl.classList.toggle("is-sheet-open", open);
      stageEl.classList.remove("is-dragging");
      stageEl.style.removeProperty("--search-sheet");
      sheetPointerHandledRef.current = true;
      setResultsSheetOpen(open);
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
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
      setMapFrame({
        token: `suggest:${suggestion.lat},${suggestion.lng}:${suggestion.label ?? ""}`,
        kind: "center",
        lat: suggestion.lat,
        lng: suggestion.lng,
        zoom: 12,
      });
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
    setCitiesOverride([]);
    setFilters(next);
    syncUrl(next, view, { clearMultiPlace: true, clearQuery: true });
  }

  function onBarSearchSubmit(raw: string) {
    const recognized = withStructuredCity(structuredCities, raw);
    if (recognized) {
      const next = { ...filters, city: "" };
      setCitiesOverride(recognized);
      setFilters(next);
      setCityEntryToken((token) => token + 1);
      if (!filters.community.trim()) setPlaceQueryCleared(true);
      syncUrl(next, view, {
        cities: recognized.join("|"),
        clearQuery: true,
      });
      return;
    }
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

  function onMapBoundsChange(
    next: Bounds,
    meta?: { userGesture: boolean },
  ) {
    if (meta?.userGesture && geoKeyRef.current) {
      mapPinnedToRef.current = geoKeyRef.current;
    }
    // Programmatic flyTo / fitBounds never change search criteria.
    if (!meta?.userGesture) return;
    // Draw-polygon mode owns the search area until cleared.
    if (polygon) return;

    if (boundsApplyTimer.current) clearTimeout(boundsApplyTimer.current);
    // Debounce continuous pan/zoom; camera only until Search This Area.
    boundsApplyTimer.current = setTimeout(() => {
      const nextState = mapGestureSearchThisAreaState({
        appliedBounds: appliedBoundsRef.current,
        nextBounds: next,
      });
      setPendingMapBounds(nextState.pendingMapBounds);
      setSearchThisAreaVisible(nextState.searchThisAreaVisible);
    }, 280);
  }

  function onSearchThisArea() {
    if (!pendingMapBounds) return;
    setAppliedBounds(pendingMapBounds);
    setPendingMapBounds(null);
    setSearchThisAreaVisible(false);
  }

  function onPolygonChange(ring: LngLat[] | null) {
    setPolygon(ring);
    setPendingMapBounds(null);
    setSearchThisAreaVisible(false);
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
  const activeFilterCount =
    countActiveSearchFilters(filters) + structuredCities.length;
  const activeListing = items.find((i) => i.mlsNumber === activeMls) ?? null;

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
        cities: citiesQueryParam,
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
    [citiesQueryParam, communitiesParam, filters, pending, qParam, total],
  );

  const countLabel = pending
    ? "Updating"
    : `${Math.max(0, total).toLocaleString("en-CA")} results`;
  const desktopCardsLayout = !isNarrow && view === "cards";
  const mobileCardsLayout = isNarrow && view === "cards";

  const savedSearchQuery = useMemo(
    () => searchFiltersToSavedQuery(filters, { cities: structuredCities }),
    [filters, structuredCities],
  );

  function replaceStructuredCities(nextCities: string[]) {
    const next = { ...filters, city: "" };
    setCitiesOverride(nextCities);
    setFilters(next);
    syncUrl(next, view, { cities: nextCities.join("|") });
  }

  function resetStructuredFilters() {
    const next = resetSearchFilters(filters);
    setCitiesOverride([]);
    setFilters(next);
    syncUrl(next, view, { cities: "", clearMultiPlace: true });
  }

  function clearResultChip(chip: SearchResultChip) {
    switch (chip.key) {
      case "transaction":
        updateFilters({
          ...filters,
          transactionType: "SALE",
          statuses: ["ACTIVE"],
          openHouseOnly: false,
        });
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
        updateFilters({
          ...filters,
          segment: "RESIDENTIAL",
          propertyTypes: [],
        });
        return;
      case "status":
        updateFilters({ ...filters, statuses: ["ACTIVE"] });
        return;
      case "place": {
        const next = { ...filters, city: "", community: "" };
        setCitiesOverride([]);
        setFilters(next);
        syncUrl(next, view, { clearMultiPlace: true });
        return;
      }
      case "city": {
        // Keep citiesOverride optimistic so a 2→1 (or 1→0) removal cannot
        // briefly keep the old cities= pipe in queryString while the URL lags.
        const nextCities = structuredCities.filter((city) => city !== chip.city);
        const next = { ...filters, city: "" };
        setCitiesOverride(nextCities);
        setFilters(next);
        syncUrl(next, view, {
          cities: nextCities.join("|"),
          clearMultiPlace: nextCities.length === 0,
        });
        return;
      }
      case "query":
        setPlaceQueryCleared(true);
        syncUrl(filters, view, { clearQuery: true });
        return;
      default: {
        const unexpected: never = chip.key;
        return unexpected;
      }
    }
  }

  const filterPreviewExtras = useMemo(
    () => ({
      cities: citiesQueryParam || undefined,
      communities: communitiesParam || undefined,
      q: qParam || undefined,
      ...(appliedBounds
        ? {
            west: appliedBounds.west,
            south: appliedBounds.south,
            east: appliedBounds.east,
            north: appliedBounds.north,
          }
        : {}),
    }),
    [citiesQueryParam, communitiesParam, qParam, appliedBounds],
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
                key={`${citiesQueryParam || filters.city || "none"}:${cityEntryToken}`}
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
            <SearchViewModeSwitch
              view={view}
              onChange={updateView}
              size="sm"
            />
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
            <div className="inline-flex shrink-0">
              <SaveSearchButton
                signedIn={signedIn}
                callbackPath={searchCallbackPath(filters, structuredCities)}
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
              authCallbackUrl={searchCallbackPath(filters, structuredCities)}
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
                key={`${citiesQueryParam || filters.city || "none"}:${cityEntryToken}`}
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

            <SearchViewModeSwitch
              view={view}
              onChange={updateView}
              hideSplit={isNarrow}
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SearchFiltersMenu
                filters={filters}
                onChange={updateFilters}
                cities={structuredCities}
                onCitiesChange={replaceStructuredCities}
                onCommitFilters={commitFiltersWithCities}
                onResetFilters={resetStructuredFilters}
                resultCount={total}
                resultNoun={noun}
                signedIn={signedIn}
                previewExtras={filterPreviewExtras}
                searchCallbackPath={searchCallbackPath}
                hidePlaceChip
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
              <div className="inline-flex">
                <SaveSearchButton
                  signedIn={signedIn}
                  callbackPath={searchCallbackPath(filters, structuredCities)}
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
                authCallbackUrl={searchCallbackPath(filters, structuredCities)}
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
        <SearchActiveFilterStrip
          className="mt-1.5"
          chips={resultsCopy.chips}
          onClearChip={clearResultChip}
          onClearAll={resetStructuredFilters}
        />
      </div>

      <div
        ref={splitStageRef}
        className={cn(
          "relative min-h-0 flex-1",
          view === "split" && "search-split-stage flex flex-col lg:flex-row",
          view === "split" && resultsSheetOpen && "is-sheet-open",
          desktopCardsLayout && "flex flex-row",
        )}
      >
        {desktopCardsLayout ? (
          <SearchDesktopFilterPanel
            filters={filters}
            onChange={updateFilters}
            cities={structuredCities}
            onCitiesChange={replaceStructuredCities}
            onResetFilters={resetStructuredFilters}
            resultCount={total}
            pending={pending}
            resultNoun={noun}
          />
        ) : null}
        {view === "split" ? (
          <style>{`
            @media (max-width: 1023px) {
              .search-split-stage { --search-sheet: 61%; }
              .search-split-stage.is-sheet-open { --search-sheet: 89%; }
              .search-split-stage .search-split-map {
                position: absolute;
                inset: 0;
                bottom: calc(var(--search-sheet) - 8px);
                width: 100%;
                height: auto;
                min-height: 0;
                max-height: none;
                flex: none;
                overflow: hidden;
                transition: bottom 300ms ease;
              }
              .search-split-stage .search-results-sheet {
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 20;
                display: flex;
                height: var(--search-sheet);
                min-height: 0;
                flex-direction: column;
                overflow: hidden;
                border-radius: 1rem 1rem 0 0;
                background: var(--mist, #f4f7f5);
                box-shadow: 0 -10px 28px rgba(20, 32, 28, 0.12);
                transition: height 300ms ease;
              }
              .search-split-stage.is-dragging .search-split-map,
              .search-split-stage.is-dragging .search-results-sheet {
                transition: none;
              }
            }
            @media (min-width: 1024px) {
              .search-split-map {
                position: relative;
                inset: auto;
                width: 48%;
                max-width: 48%;
                flex: 0 0 48%;
                height: 100%;
                overflow: visible;
                transition: none;
              }
              .search-results-sheet {
                position: relative;
                inset: auto;
                z-index: auto;
                display: flex;
                height: auto;
                flex: 1 1 0%;
                min-width: 0;
                flex-direction: column;
                border-radius: 0;
                box-shadow: none;
                background: transparent;
                transition: none;
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .search-split-stage .search-split-map,
              .search-split-stage .search-results-sheet {
                transition: none;
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
              mapFrame={mapFrame}
              initialCameraRef={resumeCameraRef}
              framedTokenRef={framedTokenRef}
              onCamera={(camera) => {
                resumeCameraRef.current = camera;
              }}
              onSelect={setActiveMls}
              onClearSelection={() => setActiveMls(null)}
              onBoundsChange={onMapBoundsChange}
              searchThisAreaVisible={searchThisAreaVisible}
              onSearchThisArea={onSearchThisArea}
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
              view === "split" && "search-results-sheet border-line/70 lg:border-l",
            )}
          >
            {isNarrow && view === "split" ? (
              <button
                type="button"
                aria-expanded={resultsSheetOpen}
                aria-label={resultsSheetOpen ? "Show more map" : "Show more results"}
                onPointerDown={onResultsSheetPointerDown}
                onClick={() => {
                  if (sheetPointerHandledRef.current) {
                    sheetPointerHandledRef.current = false;
                    return;
                  }
                  setResultsSheetOpen((open) => !open);
                }}
                className="flex w-full shrink-0 touch-none flex-col items-center gap-0.5 border-b border-line/50 bg-mist pt-2 pb-1"
              >
                <span className="h-1 w-9 rounded-full bg-ink/25" aria-hidden />
                <ChevronUp
                  className={cn(
                    "size-3.5 text-ink/45 motion-safe:transition-transform motion-safe:duration-300",
                    resultsSheetOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            ) : null}
            <div className={cn("min-h-0", view === "split" ? "flex-1" : "h-full")}>
            <SearchResultsPane
              items={items}
              activeMls={activeMls}
              onFocus={setActiveMls}
              signedIn={signedIn}
              hasClientAccess={hasClientAccess}
              pending={pending}
              horizontal={isNarrow && view === "split"}
              mobileFullWidth={mobileCardsLayout}
              wideGrid={!isNarrow && view === "cards"}
              title={resultsCopy.title}
              countLabel={countLabel}
              countHeadline={resultsCopy.countHeadline}
              emphasizeCount={mobileCardsLayout}
              emptyHint={
                polygon
                  ? "Clear the draw or expand it."
                  : searchThisAreaVisible
                    ? "Tap Search This Area to refresh results for the map view."
                    : placeFilterActive
                      ? "Try adjusting filters, or clear the city to search a wider area."
                      : "Adjust your filters, or pan the map and tap Search This Area."
              }
            />
            </div>
          </div>
        ) : null}
      </div>

      {isNarrow ? (
        <SearchFiltersSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          filters={filters}
          onChange={updateFilters}
          cities={structuredCities}
          onCitiesChange={replaceStructuredCities}
          onCommitFilters={commitFiltersWithCities}
          onResetFilters={resetStructuredFilters}
          resultCount={total}
          pending={pending}
          resultNoun={noun}
          signedIn={signedIn}
          searchCallbackPath={searchCallbackPath}
          previewExtras={filterPreviewExtras}
        />
      ) : null}
    </div>
  );
}
