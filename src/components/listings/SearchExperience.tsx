"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { SearchesDropdown } from "@/components/listings/SearchesDropdown";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import { shouldResetMapAreaForPlaceChange } from "@/lib/listings/map-area-search";
import {
  applyCommitPatch,
  buildActiveChips,
  buildListingsQuery,
  buildSavedSearchQuery,
  clearPlaceWhenCitiesEmpty,
  commitPatchFromFilters,
  committedPlaceKey,
  committedToSearchFilters,
  placeCommitFromSuggestion,
  rebaseDraftPreservingEdits,
  reduceSearch,
  serializeSearchUrl,
  useCommittedSearch,
  withPlaceAwareMapArea,
  type CommittedSearch,
} from "@/lib/listings/search-state";
import { withStructuredCity } from "@/lib/listings/structured-cities";
import { pointInPolygon, polygonBBox } from "@/lib/maps/geo";
import {
  listingResultFrame,
  searchMapCentroidFrame,
  searchMapGeographyKey,
  searchMapNeedsResultFit,
  type MapFrame,
} from "@/lib/geo/search-map-fit";
import { cn } from "@/lib/utils";
import {
  searchResultsCopy,
  type SearchResultChip,
} from "@/lib/listings/search-results-copy";

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
  labels = "always",
}: {
  view: SearchViewMode;
  onChange: (mode: SearchViewMode) => void;
  hideSplit?: boolean;
  size?: "sm" | "md";
  /** Mobile compact: icons only (labels stay as aria-label / title). */
  labels?: "always" | "sr-only";
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 rounded-full border border-line/80 bg-mist/80 p-0.5",
        size === "md" && "shadow-[inset_0_0_0_1px_rgba(213,224,218,0.35)]",
      )}
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
              "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition",
              size === "sm"
                ? labels === "sr-only"
                  ? "size-9"
                  : "h-8 min-w-8 px-2.5 text-xs"
                : "h-9 min-w-9 px-3 text-xs sm:text-sm",
              view === mode
                ? "bg-canopy text-white shadow-sm"
                : "text-ink/45 hover:bg-surface/80 hover:text-ink",
            )}
          >
            <Icon
              className={cn(
                "shrink-0",
                size === "sm" ? "size-4" : "size-3.5 sm:size-4",
              )}
              aria-hidden
            />
            <span className={labels === "sr-only" ? "sr-only" : undefined}>
              {label}
            </span>
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
  const { state: searchState, dispatch } = useCommittedSearch(pathname);
  const committed = searchState.committed;
  const pendingMapBounds = searchState.pendingMapBounds;
  const searchThisAreaVisible = searchState.searchThisAreaVisible;
  const appliedBounds = committed.mapArea;
  const view = committed.view;
  const filters = useMemo(
    () => committedToSearchFilters(committed),
    [committed],
  );
  const structuredCities = committed.cities;
  const citiesQueryParam = structuredCities.join("|");
  const communitiesParam = committed.communities.join("|");
  const qParam = committed.q;
  const access = useClientAccess();
  /** Session present — for save/watch CTAs. */
  const signedIn = access.isSignedIn;
  /** VOW / sold unlock — never treat verify-locked as unlocked. */
  const hasClientAccess = access.hasClientAccess;
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<ListingCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [activeMls, setActiveMls] = useState<string | null>(null);
  const [mapFrame, setMapFrame] = useState<(MapFrame & { token: string }) | null>(
    null,
  );
  /** Draw polygon is local geometry; bbox is committed via mapArea. */
  const [polygon, setPolygon] = useState<LngLat[] | null>(null);
  const boundsApplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Latest committed criteria for handlers that may fire before React re-renders.
   * Updated optimistically in dispatchCommit / view / chip paths; reconciled from
   * React state in useLayoutEffect so the ref cannot permanently diverge.
   */
  const committedRef = useRef(committed);
  /** Committed snapshot when Filters draft began (three-way Apply merge). */
  const draftBaseRef = useRef<CommittedSearch | null>(null);
  useLayoutEffect(() => {
    committedRef.current = committed;
  }, [committed]);
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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    function sync() {
      setIsNarrow(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Survive client navigation to listing detail so signup captureContext
  // still knows city/price (document.referrer is unreliable in the App Router).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname.startsWith("/search")) return;
    persistBrowseSearchUrl(window.location.href);
  }, [pathname, committed]);

  const placeFilterActive = Boolean(
    filters.community.trim() ||
      citiesQueryParam.trim() ||
      communitiesParam.trim(),
  );
  const placeKey = committedPlaceKey(committed);
  const placeKeyRef = useRef(placeKey);
  const mapGeography = useMemo(
    () => ({
      city: filters.city,
      community: committed.community,
      cities: citiesQueryParam,
      communities: communitiesParam,
      q: qParam,
    }),
    [citiesQueryParam, communitiesParam, committed.community, filters.city, qParam],
  );
  const mapGeographyKey = searchMapGeographyKey(mapGeography);
  geoKeyRef.current = mapGeographyKey;

  // Place change clears session draw polygon; mapArea cleared in reducer.
  useEffect(() => {
    const prev = placeKeyRef.current;
    placeKeyRef.current = placeKey;
    if (!shouldResetMapAreaForPlaceChange(prev, placeKey)) return;
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

  const searchCallbackPath = useCallback(
    (next: SearchFilters, nextCities?: string[]) => {
      const patch = commitPatchFromFilters(committed, next, {
        cities: nextCities,
      });
      return serializeSearchUrl(
        {
          ...committed,
          ...patch,
          cities: patch.cities ?? committed.cities,
          communities: patch.communities ?? committed.communities,
          propertyTypes: patch.propertyTypes ?? committed.propertyTypes,
          statuses: patch.statuses ?? committed.statuses,
          view: committed.view,
        },
        { pathname },
      );
    },
    [committed, pathname],
  );

  const queryString = useMemo(
    () => buildListingsQuery(committed),
    [committed],
  );

  const load = useCallback(async () => {
    const requestId = queryString;
    const keyAtStart = geoKeyRef.current;
    const res = await fetch(`/api/listings/search?${requestId}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      items?: ListingCardData[];
      total?: number;
      provider?: string;
    };
    // Drop stale responses when a newer committed query superseded this one.
    if (buildListingsQuery(committedRef.current) !== requestId) return;
    let nextItems = data.items ?? [];
    if (polygon && polygon.length >= 3) {
      nextItems = nextItems.filter((item) =>
        pointInPolygon(item.lng, item.lat, polygon),
      );
    }
    setItems(nextItems);
    setTotal(polygon ? nextItems.length : (data.total ?? nextItems.length));
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

  /** Keep committedRef aligned before React re-renders (rapid click stacking). */
  function dispatchCommit(patch: Partial<CommittedSearch>) {
    const prev = committedRef.current;
    committedRef.current = applyCommitPatch(prev, patch);
    dispatch({ type: "COMMIT", patch });
  }

  /**
   * Commit filter changes against the latest committed snapshot so a stale
   * `{...filters, field}` closure cannot wipe a newer field from a prior commit.
   */
  function updateFilters(
    next: SearchFilters | ((current: SearchFilters) => SearchFilters),
  ) {
    const prev = committedRef.current;
    const current = committedToSearchFilters(prev);
    const resolved = typeof next === "function" ? next(current) : next;
    dispatchCommit(commitPatchFromFilters(prev, resolved));
  }

  /** OPEN_FILTERS — seed canonical draft from committed (no API search). */
  function beginFiltersDraft() {
    draftBaseRef.current = { ...committedRef.current };
    dispatch({ type: "BEGIN_DRAFT" });
  }

  /** CANCEL_FILTERS — discard canonical draft; URL/results unchanged. */
  function discardFiltersDraft() {
    draftBaseRef.current = null;
    dispatch({ type: "DISCARD_DRAFT" });
  }

  /**
   * APPLY_FILTERS — three-way merge then atomic APPLY_DRAFT.
   * Local UI draft fields that differ from draft-open base win; untouched
   * fields keep the latest committed (live desktop / chip edits).
   * Save Search / CaptureIntent stay in Menu/Sheet after this commit.
   */
  function commitFiltersWithCities(next: SearchFilters, nextCities: string[]) {
    const remote = committedRef.current;
    const base = draftBaseRef.current ?? remote;
    const local = applyCommitPatch(
      base,
      commitPatchFromFilters(base, { ...next, city: "" }, {
        cities: nextCities,
      }),
    );
    const merged = rebaseDraftPreservingEdits(base, local, remote);
    const applied = withPlaceAwareMapArea(remote, {
      ...merged,
      view: remote.view,
    });
    committedRef.current = applied;
    draftBaseRef.current = null;
    // Seed draft to merged payload then apply (uses Stage 1 draft actions).
    dispatch({ type: "BEGIN_DRAFT" });
    dispatch({
      type: "PATCH_DRAFT",
      patch: {
        segment: applied.segment,
        transactionType: applied.transactionType,
        dataSource: applied.dataSource,
        cities: applied.cities,
        community: applied.community,
        communities: applied.communities,
        q: applied.q,
        minPrice: applied.minPrice,
        maxPrice: applied.maxPrice,
        minBeds: applied.minBeds,
        minBaths: applied.minBaths,
        propertyTypes: applied.propertyTypes,
        openHouseOnly: applied.openHouseOnly,
        statuses: applied.statuses,
        sort: applied.sort,
        mapArea: applied.mapArea,
      },
    });
    dispatch({ type: "APPLY_DRAFT" });
  }

  function updateView(next: SearchViewMode) {
    committedRef.current = { ...committedRef.current, view: next };
    dispatch({ type: "SET_VIEW", view: next });
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

    // City / community / around-area: commit through the controller so
    // beds/price/type survive. Do not router.push minimal suggestion hrefs.
    const placeCommit = placeCommitFromSuggestion(suggestion);
    if (placeCommit) {
      if (placeCommit.mapCenter) {
        setMapFrame({
          token: `suggest:${placeCommit.mapCenter.lat},${placeCommit.mapCenter.lng}:${placeCommit.mapCenter.label}`,
          kind: "center",
          lat: placeCommit.mapCenter.lat,
          lng: placeCommit.mapCenter.lng,
          zoom: 12,
        });
      }
      if (placeCommit.replacesPlace) {
        setCityEntryToken((token) => token + 1);
        if (!placeCommit.patch.community) setPlaceQueryCleared(true);
      }
      dispatchCommit(placeCommit.patch);
      return;
    }

    // Recent searches and other full /search hrefs (not bare city rows).
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
  }

  function onBarSearchClear() {
    setPlaceQueryCleared(true);
    const prev = committedRef.current;
    dispatchCommit(
      commitPatchFromFilters(
        prev,
        { ...committedToSearchFilters(prev), city: "", community: "" },
        { clearPlace: true, clearQuery: true },
      ),
    );
  }

  function onBarSearchSubmit(raw: string) {
    const prev = committedRef.current;
    const recognized = withStructuredCity(prev.cities, raw);
    if (recognized) {
      setCityEntryToken((token) => token + 1);
      if (!prev.community.trim()) setPlaceQueryCleared(true);
      dispatchCommit(
        commitPatchFromFilters(
          prev,
          { ...committedToSearchFilters(prev), city: "" },
          { cities: recognized, clearQuery: true },
        ),
      );
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
      dispatch({ type: "MAP_GESTURE", bounds: next });
    }, 280);
  }

  function onSearchThisArea() {
    if (!pendingMapBounds) return;
    committedRef.current = {
      ...committedRef.current,
      mapArea: pendingMapBounds,
    };
    dispatch({ type: "SEARCH_THIS_AREA" });
  }

  function onPolygonChange(ring: LngLat[] | null) {
    setPolygon(ring);
    if (boundsApplyTimer.current) clearTimeout(boundsApplyTimer.current);
    if (ring && ring.length >= 3) {
      dispatchCommit({ mapArea: polygonBBox(ring) });
    } else {
      committedRef.current = { ...committedRef.current, mapArea: null };
      dispatch({ type: "CLEAR_MAP_AREA" });
    }
  }

  const isLease = filters.transactionType === "LEASE";
  /** Desktop toolbar owns Buy/Rent/Both; mobile keeps Buy/Rent (+ Both for FSBO). */
  const transactionButtons: Array<[SearchFilters["transactionType"], string]> =
    [
      ["SALE", "Buy"],
      ["LEASE", "Rent"],
    ];
  if (!isNarrow || filters.dataSource === "fsbo") {
    transactionButtons.push(["ALL", "Both"]);
  }

  const showMap = view === "split" || view === "map";
  const showList = view === "split" || view === "cards";
  // City lives in cities[]; do not double-count filters.city.
  const activeFilterCount =
    countActiveSearchFilters({ ...filters, city: "" }) +
    structuredCities.length;
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

  /** Active tags — canonical helper over committed only (same taxonomy as resultsCopy). */
  const activeChips = useMemo(
    () => buildActiveChips(committed, { total, pending }),
    [committed, pending, total],
  );

  const countLabel = pending
    ? "Updating"
    : `${Math.max(0, total).toLocaleString("en-CA")} results`;
  const desktopCardsLayout = !isNarrow && view === "cards";
  const mobileCardsLayout = isNarrow && view === "cards";

  const savedSearchQuery = useMemo(
    () => buildSavedSearchQuery(committed),
    [committed],
  );

  function replaceStructuredCities(nextCities: string[]) {
    const prev = committedRef.current;
    const placePatch = clearPlaceWhenCitiesEmpty(prev, nextCities);
    if (nextCities.length === 0) {
      dispatchCommit(
        commitPatchFromFilters(
          prev,
          { ...committedToSearchFilters(prev), city: "", community: "" },
          { clearPlace: true },
        ),
      );
      return;
    }
    dispatchCommit(
      commitPatchFromFilters(
        prev,
        { ...committedToSearchFilters(prev), city: "" },
        { cities: placePatch.cities ?? nextCities },
      ),
    );
  }

  function resetStructuredFilters() {
    const prev = committedRef.current;
    dispatchCommit(
      commitPatchFromFilters(
        prev,
        resetSearchFilters(committedToSearchFilters(prev)),
        { clearPlace: true },
      ),
    );
  }

  function clearResultChip(chip: SearchResultChip) {
    if (chip.key === "query") setPlaceQueryCleared(true);
    const next = reduceSearch(
      {
        committed: committedRef.current,
        draft: searchState.draft,
        pendingMapBounds: null,
        searchThisAreaVisible: false,
        requestSeq: 0,
        lastIssuedRequestId: null,
      },
      { type: "REMOVE_CHIP", chip },
    );
    committedRef.current = next.committed;
    dispatch({ type: "REMOVE_CHIP", chip });
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
      <div
        className={cn(
          "shrink-0 border-b border-line/70 bg-surface px-3 py-2 sm:px-4 sm:py-2.5",
          !isNarrow &&
            "bg-surface/95 px-4 py-3 shadow-[0_1px_0_rgba(20,32,28,0.04)] backdrop-blur-[2px] lg:px-5",
        )}
      >
        {isNarrow ? (
        <div className="space-y-2">
          <div
            data-search-bar
            className="min-w-0 rounded-full border border-line/90 bg-surface px-1.5 shadow-[0_1px_2px_rgba(20,32,28,0.04)] ring-1 ring-transparent transition focus-within:border-canopy/40 focus-within:ring-canopy/15"
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

          <div className="flex min-w-0 items-center gap-1.5">
            <div
              className="flex shrink-0 rounded-full bg-mist p-0.5 ring-1 ring-line/60"
              role="group"
              aria-label="Buy or rent"
            >
              {transactionButtons.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    updateFilters((current) => ({
                      ...current,
                      transactionType: value,
                      statuses: ["ACTIVE"],
                      openHouseOnly:
                        value === "LEASE" ? false : current.openHouseOnly,
                    }));
                  }}
                  className={cn(
                    "min-h-10 rounded-full px-2.5 text-sm font-semibold transition",
                    filters.transactionType === value
                      ? "bg-canopy text-white shadow-sm"
                      : "text-ink/55 hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-sm font-semibold transition",
                activeFilterCount > 0
                  ? "border-canopy/45 bg-canopy/10 text-canopy"
                  : "border-line/90 bg-surface text-ink/75",
              )}
            >
              <ListFilter className="size-4 shrink-0" aria-hidden />
              Filters
              {activeFilterCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-canopy px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>

            <SearchViewModeSwitch
              view={view}
              onChange={updateView}
              size="sm"
              labels="sr-only"
            />
          </div>
          {/* Plan / Watch remain in the listing sticky bar & side menu on mobile. */}
        </div>
        ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 lg:gap-3">
            <div
              className="flex shrink-0 rounded-full bg-mist p-0.5 ring-1 ring-line/60"
              role="group"
              aria-label="Buy or rent"
            >
              {transactionButtons.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    updateFilters((current) => ({
                      ...current,
                      transactionType: value,
                      statuses: ["ACTIVE"],
                      openHouseOnly:
                        value === "LEASE" ? false : current.openHouseOnly,
                    }));
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
              className="min-w-0 flex-1 basis-[18rem] rounded-full border border-line/90 bg-surface px-1.5 shadow-[0_1px_2px_rgba(20,32,28,0.04)] ring-1 ring-transparent transition focus-within:border-canopy/40 focus-within:ring-canopy/15"
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
                inputClassName="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
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

          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SearchFiltersMenu
                filters={filters}
                onChange={updateFilters}
                cities={structuredCities}
                onCitiesChange={replaceStructuredCities}
                onCommitFilters={commitFiltersWithCities}
                onResetFilters={resetStructuredFilters}
                onDraftOpen={beginFiltersDraft}
                onDraftCancel={discardFiltersDraft}
                resultCount={total}
                resultNoun={noun}
                signedIn={signedIn}
                previewExtras={filterPreviewExtras}
                searchCallbackPath={searchCallbackPath}
                hidePlaceChip
              />
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
                className="h-9 rounded-full px-3"
              />
              <Link
                href="/route-planner"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-canopy/25 bg-canopy/10 px-3 text-xs font-semibold text-canopy transition hover:bg-canopy/15"
              >
                <RouteStartIcon />
                Plan viewings
              </Link>
              {filters.dataSource === "fsbo" ? (
                <button
                  type="button"
                  onClick={() =>
                    updateFilters((current) => ({ ...current, dataSource: "" }))
                  }
                  className="rounded-full bg-signal/15 px-2.5 py-1.5 text-xs font-semibold text-signal"
                >
                  By owner · clear
                </button>
              ) : null}
          </div>
        </div>
        )}
        <SearchActiveFilterStrip
          className={cn("mt-2", !isNarrow && "mt-2.5")}
          chips={activeChips}
          onClearChip={clearResultChip}
          onClearAll={resetStructuredFilters}
          leading={
            isNarrow ? (
              <SearchesDropdown
                signedIn={signedIn}
                callbackPath={searchCallbackPath(filters, structuredCities)}
                savedSearchQuery={savedSearchQuery}
              />
            ) : undefined
          }
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
                updateFilters((current) => {
                  const selected = current.statuses.includes(value);
                  const nextStatuses = selected
                    ? current.statuses.length === 1
                      ? current.statuses
                      : current.statuses.filter((s) => s !== value)
                    : [...current.statuses, value];
                  return { ...current, statuses: nextStatuses };
                });
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
              "min-h-0 min-w-0 bg-mist/40",
              view === "cards" && "h-full w-full flex-1",
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
              mobileChatClearance={isNarrow}
              title={resultsCopy.title}
              countLabel={countLabel}
              countHeadline={resultsCopy.countHeadline}
              emphasizeCount={mobileCardsLayout}
              headingTrailing={
                <label
                  className={cn(
                    "group relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line/90 bg-surface text-xs shadow-[0_1px_2px_rgba(20,32,28,0.03)] transition hover:border-canopy/35",
                    isNarrow ? "h-9 px-2.5" : "h-9 px-3",
                  )}
                >
                  <ArrowUpDown className="size-3.5 shrink-0 text-canopy" aria-hidden />
                  <span className="text-xs font-semibold text-ink">
                    {filters.sort === "newest"
                      ? "Newest"
                      : filters.sort === "price_desc"
                        ? "Price ↓"
                        : "Price ↑"}
                  </span>
                  {!isNarrow ? (
                    <ChevronDown className="size-3.5 shrink-0 text-ink/35" aria-hidden />
                  ) : null}
                  <select
                    aria-label="Sort listings"
                    value={filters.sort}
                    onChange={(e) =>
                      updateFilters((current) => ({
                        ...current,
                        sort: e.target.value as SearchFilters["sort"],
                      }))
                    }
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    <option value="newest">Newest</option>
                    <option value="price_asc">Price: low to high</option>
                    <option value="price_desc">Price: high to low</option>
                  </select>
                </label>
              }
              emptyHint={
                polygon
                  ? "Clear the draw or expand it."
                  : searchThisAreaVisible
                    ? "Tap Search This Area to refresh results for the map view."
                    : placeFilterActive
                      ? "Try adjusting filters, or clear the city to search a wider area."
                      : "Adjust your filters, or pan the map and tap Search This Area."
              }
              emptyActions={[
                ...(polygon
                  ? [
                      {
                        label: "Clear drawn area",
                        onClick: () => onPolygonChange(null),
                        tone: "primary" as const,
                      },
                    ]
                  : []),
                ...(placeFilterActive
                  ? [
                      {
                        label: "Clear location",
                        onClick: () => replaceStructuredCities([]),
                        tone: polygon ? ("default" as const) : ("primary" as const),
                      },
                    ]
                  : []),
                {
                  label: "Reset filters",
                  onClick: resetStructuredFilters,
                },
                ...(isNarrow
                  ? [
                      {
                        label: "Open filters",
                        onClick: () => setFiltersOpen(true),
                      },
                    ]
                  : []),
              ]}
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
          onDraftOpen={beginFiltersDraft}
          onDraftCancel={discardFiltersDraft}
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
