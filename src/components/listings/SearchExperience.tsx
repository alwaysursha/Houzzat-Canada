"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { PropertyType } from "@prisma/client";
import {
  Columns2,
  LayoutGrid,
  Map as MapIcon,
  Loader2,
} from "lucide-react";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { SaveSearchButton } from "@/components/account/SaveSearchButton";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import {
  SearchFilterChips,
  type SearchFilters,
  type SearchStatusOption,
  type SearchViewMode,
} from "@/components/listings/SearchFilterChips";
import { SearchMap } from "@/components/listings/SearchMap";
import { SearchMapListingOverlay } from "@/components/listings/SearchMapListingOverlay";
import { SearchResultsPane } from "@/components/listings/SearchResultsPane";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import { pointInPolygon, polygonBBox } from "@/lib/maps/geo";
import { cn } from "@/lib/utils";

type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type LngLat = [number, number];

const PROPERTY_TYPES = new Set<string>([
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
  "VACANT_LAND",
  "OFFICE",
  "RETAIL",
  "INDUSTRIAL",
  "MIXED_USE",
  "OTHER",
]);

function parseInitialStatuses(
  statusParam: string | null,
  isLease: boolean,
): SearchStatusOption[] {
  if (!statusParam || statusParam === "ACTIVE") return ["ACTIVE"];
  if (statusParam === "ALL") {
    return isLease
      ? ["ACTIVE", "LEASED", "UNLISTED"]
      : ["ACTIVE", "SOLD", "UNLISTED"];
  }
  const allowed = new Set<SearchStatusOption>(
    isLease
      ? ["ACTIVE", "LEASED", "UNLISTED"]
      : ["ACTIVE", "SOLD", "UNLISTED"],
  );
  const parsed = statusParam
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SearchStatusOption =>
      allowed.has(s as SearchStatusOption),
    );
  return parsed.length ? parsed : ["ACTIVE"];
}

function statusesQueryValue(statuses: SearchStatusOption[]): string | null {
  if (statuses.length === 1 && statuses[0] === "ACTIVE") return null;
  return statuses.join(",");
}

function parseSort(raw: string | null): SearchFilters["sort"] {
  if (raw === "price_asc" || raw === "price") return "price_asc";
  if (raw === "price_desc") return "price_desc";
  return "newest";
}

function parseView(
  raw: string | null,
  isMobileDefault: boolean,
): SearchViewMode {
  if (raw === "map" || raw === "cards" || raw === "split") return raw;
  return isMobileDefault ? "cards" : "split";
}

function parsePropertyTypes(raw: string | null): PropertyType[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is PropertyType => PROPERTY_TYPES.has(t));
}

export function SearchExperience() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<ListingCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [activeMls, setActiveMls] = useState<string | null>(null);
  const [detailMls, setDetailMls] = useState<string | null>(null);
  const [provider, setProvider] = useState("mock");
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
  } | null>(null);
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);
  const [appliedBounds, setAppliedBounds] = useState<Bounds | null>(null);
  const [areaDirty, setAreaDirty] = useState(false);
  const [polygon, setPolygon] = useState<LngLat[] | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

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
    propertyTypes: parsePropertyTypes(searchParams.get("propertyTypes")),
    openHouseOnly: searchParams.get("openHouseOnly") === "1",
    statuses: parseInitialStatuses(
      searchParams.get("status"),
      initialTxn === "LEASE",
    ),
    sort: parseSort(searchParams.get("sort")),
  });

  const [view, setView] = useState<SearchViewMode>(() =>
    parseView(searchParams.get("view"), false),
  );

  useEffect(() => {
    if (!searchParams.get("view")) {
      setView(isNarrow ? "cards" : "split");
    }
  }, [isNarrow, searchParams]);

  const communitiesParam = searchParams.get("communities") ?? "";
  const qParam = searchParams.get("q") ?? "";

  const syncUrl = useCallback(
    (next: SearchFilters, nextView: SearchViewMode = view) => {
      const params = new URLSearchParams();
      if (next.segment && next.segment !== "RESIDENTIAL") {
        params.set("segment", next.segment);
      }
      params.set("transactionType", next.transactionType);
      if (next.dataSource) params.set("dataSource", next.dataSource);
      if (next.city) params.set("city", next.city);
      if (communitiesParam) {
        params.set("communities", communitiesParam);
      } else if (next.community) {
        params.set("community", next.community);
      }
      if (next.propertyTypes.length) {
        params.set("propertyTypes", next.propertyTypes.join(","));
      }
      if (next.minPrice) params.set("minPrice", next.minPrice);
      if (next.maxPrice) params.set("maxPrice", next.maxPrice);
      if (next.minBeds) params.set("minBeds", next.minBeds);
      if (next.minBaths) params.set("minBaths", next.minBaths);
      if (next.openHouseOnly) params.set("openHouseOnly", "1");
      const statusQ = statusesQueryValue(next.statuses);
      if (statusQ) params.set("status", statusQ);
      if (next.sort !== "newest") params.set("sort", next.sort);
      if (qParam) params.set("q", qParam);
      if (nextView !== "split") params.set("view", nextView);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [communitiesParam, pathname, qParam, router, view],
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
    if (filters.city) params.set("city", filters.city);
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
    if (box) {
      params.set("west", String(box.west));
      params.set("south", String(box.south));
      params.set("east", String(box.east));
      params.set("north", String(box.north));
    }
    params.set("limit", "60");
    return params.toString();
  }, [filters, appliedBounds, communitiesParam, polygon, qParam]);

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
    setView(next);
    syncUrl(filters, next);
  }

  // Hybrid/split is desktop-only.
  useEffect(() => {
    if (!isNarrow || view !== "split") return;
    setView("cards");
    syncUrl(filters, "cards");
  }, [isNarrow, view, filters, syncUrl]);

  function onPlaceSelect(suggestion: AutocompleteSuggestion) {
    if (suggestion.action === "near_me" && suggestion.href) {
      router.push(suggestion.href);
      return;
    }
    if (suggestion.mlsNumber) {
      router.push(`/listing/${suggestion.mlsNumber}`);
      return;
    }
    if (suggestion.href?.startsWith("/search")) {
      router.push(suggestion.href);
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

  function onBarSearchSubmit(raw: string) {
    const parsed = parseSearchQuery(raw);
    const txn =
      parsed.transactionType ??
      (filters.transactionType === "LEASE" || filters.transactionType === "SALE"
        ? filters.transactionType
        : "SALE");
    const href = searchHrefFromParsed(
      { ...parsed, transactionType: txn, hasFilters: true },
      { transactionType: txn },
    );
    router.push(href);
  }

  function onMapBoundsChange(next: Bounds) {
    setMapBounds(next);
    if (!appliedBounds) {
      setAppliedBounds(next);
      setAreaDirty(false);
      return;
    }
    const moved =
      Math.abs(next.west - appliedBounds.west) > 0.0008 ||
      Math.abs(next.south - appliedBounds.south) > 0.0008 ||
      Math.abs(next.east - appliedBounds.east) > 0.0008 ||
      Math.abs(next.north - appliedBounds.north) > 0.0008;
    setAreaDirty(moved && !polygon);
  }

  function onSearchThisArea() {
    if (!mapBounds) return;
    setAppliedBounds(mapBounds);
    setAreaDirty(false);
    setPolygon(null);
  }

  function onPolygonChange(ring: LngLat[] | null) {
    setPolygon(ring);
    setAreaDirty(false);
    if (ring && ring.length >= 3) {
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
  const activeListing = items.find((i) => i.mlsNumber === activeMls) ?? null;
  const detailListing = items.find((i) => i.mlsNumber === detailMls) ?? null;

  function openListingDetail(mlsNumber: string) {
    setActiveMls(mlsNumber);
    setDetailMls(mlsNumber);
  }

  // Listing detail popup is desktop-only; mobile uses the full listing page.
  useEffect(() => {
    if (isNarrow) setDetailMls(null);
  }, [isNarrow]);

  const noun =
    filters.segment === "COMMERCIAL"
      ? "properties"
      : isLease
        ? "rentals"
        : "homes";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-line/80 bg-surface px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
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
            />
          </div>

          <div className="flex rounded-full border border-line bg-mist p-0.5">
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchFilterChips filters={filters} onChange={updateFilters} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink/50">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink/65">
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              {pending ? "Updating…" : `${total.toLocaleString("en-CA")} ${noun}`}
              {provider === "mock" ? " · demo" : ""}
            </span>
            <SaveSearchButton
              signedIn={signedIn}
              query={{
                segment:
                  filters.segment !== "RESIDENTIAL"
                    ? filters.segment
                    : undefined,
                transactionType:
                  filters.transactionType !== "ALL"
                    ? filters.transactionType
                    : undefined,
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
              }}
            />
            <WatchAreaButton
              signedIn={signedIn}
              city={filters.city}
              community={filters.community || undefined}
              transactionType={filters.transactionType}
              segment={filters.segment}
            />
            {filters.dataSource === "fsbo" ? (
              <button
                type="button"
                onClick={() => updateFilters({ ...filters, dataSource: "" })}
                className="rounded-full bg-signal/15 px-2.5 py-1 font-semibold text-signal"
              >
                By owner · clear
              </button>
            ) : (
              <Link
                href="/owner/new"
                className="hidden font-semibold text-ink/45 hover:text-canopy sm:inline"
              >
                List yours
              </Link>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "relative min-h-0 flex-1",
          view === "split" && "flex flex-col lg:flex-row",
        )}
      >
        {showMap ? (
          <div
            className={cn(
              "relative min-h-0 bg-mist",
              view === "map" && "h-full w-full",
              view === "split" && "h-[42vh] w-full lg:h-full lg:w-[55%]",
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
              areaDirty={areaDirty}
              onSearchThisArea={onSearchThisArea}
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
              expandCardOnClick={!isNarrow}
              onOpenListing={!isNarrow ? openListingDetail : undefined}
              className="h-full w-full"
            />
          </div>
        ) : null}

        {showList ? (
          <div
            className={cn(
              "min-h-0 bg-mist/40",
              view === "cards" && "h-full w-full",
              view === "split" && "min-h-0 flex-1 lg:w-[45%]",
            )}
          >
            <SearchResultsPane
              items={items}
              activeMls={activeMls}
              onFocus={setActiveMls}
              onOpenListing={!isNarrow ? openListingDetail : undefined}
              signedIn={signedIn}
              pending={pending}
              view={view}
              emptyHint={
                polygon
                  ? "No listings inside this drawn area. Clear the draw or expand it."
                  : "No listings match. Adjust filters or search this map area."
              }
            />
          </div>
        ) : null}
      </div>

      {detailListing ? (
        <SearchMapListingOverlay
          listing={detailListing}
          onClose={() => setDetailMls(null)}
        />
      ) : null}
    </div>
  );
}
