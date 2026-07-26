"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { SaveSearchButton } from "@/components/account/SaveSearchButton";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { ListingCard } from "@/components/listings/ListingCard";
import { SearchMap } from "@/components/listings/SearchMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";

type Filters = {
  segment: "RESIDENTIAL" | "COMMERCIAL" | "ALL";
  transactionType: "SALE" | "LEASE" | "ALL";
  dataSource: "fsbo" | "";
  city: string;
  community: string;
  minPrice: string;
  maxPrice: string;
  minBeds: string;
  openHouseOnly: boolean;
  status: "ACTIVE" | "SOLD" | "LEASED" | "UNLISTED" | "ALL";
};

function parseInitialStatus(
  statusParam: string | null,
): Filters["status"] {
  if (
    statusParam === "ALL" ||
    statusParam === "SOLD" ||
    statusParam === "LEASED" ||
    statusParam === "ACTIVE" ||
    statusParam === "UNLISTED"
  ) {
    return statusParam;
  }
  return "ACTIVE";
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
  const [provider, setProvider] = useState("mock");
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
  } | null>(null);
  const [bounds, setBounds] = useState<{
    west: number;
    south: number;
    east: number;
    north: number;
  } | null>(null);

  const txnParam = searchParams.get("transactionType");
  const initialTxn: Filters["transactionType"] =
    txnParam === "LEASE" || txnParam === "ALL" || txnParam === "SALE"
      ? txnParam
      : searchParams.get("dataSource") === "fsbo"
        ? "ALL"
        : "SALE";
  const initialStatus = parseInitialStatus(searchParams.get("status"));
  const initialDataSource =
    searchParams.get("dataSource") === "fsbo" ? "fsbo" : "";

  const [filters, setFilters] = useState<Filters>({
    segment:
      (searchParams.get("segment") as Filters["segment"]) || "RESIDENTIAL",
    transactionType: initialTxn,
    dataSource: initialDataSource,
    city: searchParams.get("city") ?? "",
    community: searchParams.get("community") ?? "",
    minPrice: searchParams.get("minPrice") ?? "",
    maxPrice: searchParams.get("maxPrice") ?? "",
    minBeds: searchParams.get("minBeds") ?? "",
    openHouseOnly: searchParams.get("openHouseOnly") === "1",
    status: initialStatus,
  });

  // Multi-value personalization params (homepage See all / saved searches)
  const communitiesParam = searchParams.get("communities") ?? "";
  const propertyTypesParam = searchParams.get("propertyTypes") ?? "";

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
    if (propertyTypesParam) {
      params.set("propertyTypes", propertyTypesParam);
    }
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.minBeds) params.set("minBeds", filters.minBeds);
    if (filters.openHouseOnly) params.set("openHouseOnly", "1");
    if (filters.status !== "ACTIVE") params.set("status", filters.status);
    if (bounds) {
      params.set("west", String(bounds.west));
      params.set("south", String(bounds.south));
      params.set("east", String(bounds.east));
      params.set("north", String(bounds.north));
    }
    params.set("limit", "60");
    return params.toString();
  }, [filters, bounds, communitiesParam, propertyTypesParam]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/listings/search?${queryString}`);
    const data = (await res.json()) as {
      items?: ListingCardData[];
      total?: number;
      provider?: string;
      requiresAuth?: boolean;
    };
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setProvider(data.provider ?? "mock");
  }, [queryString]);

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

  function syncUrl(next: Filters) {
    const params = new URLSearchParams();
    if (next.segment && next.segment !== "RESIDENTIAL") {
      params.set("segment", next.segment);
    }
    params.set("transactionType", next.transactionType);
    if (next.dataSource) params.set("dataSource", next.dataSource);
    if (next.city) params.set("city", next.city);
    if (next.community) params.set("community", next.community);
    if (next.minPrice) params.set("minPrice", next.minPrice);
    if (next.maxPrice) params.set("maxPrice", next.maxPrice);
    if (next.minBeds) params.set("minBeds", next.minBeds);
    if (next.openHouseOnly) params.set("openHouseOnly", "1");
    if (next.status !== "ACTIVE") params.set("status", next.status);
    router.replace(`${pathname}?${params.toString()}`);
  }

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
      setFilters(next);
      syncUrl(next);
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

  const isLease = filters.transactionType === "LEASE";
  const statusOptions = (
    isLease
      ? (["ACTIVE", "LEASED", "UNLISTED", "ALL"] as const)
      : (["ACTIVE", "SOLD", "UNLISTED", "ALL"] as const)
  );
  const transactionButtons: Array<[Filters["transactionType"], string]> = [
    ["SALE", "For sale"],
    ["LEASE", "For lease"],
  ];
  if (filters.dataSource === "fsbo") {
    transactionButtons.push(["ALL", "Sale & lease"]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {transactionButtons.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              const next: Filters = {
                ...filters,
                transactionType: value,
                status: "ACTIVE",
                openHouseOnly: value === "LEASE" ? false : filters.openHouseOnly,
              };
              setFilters(next);
              syncUrl(next);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              filters.transactionType === value
                ? "bg-canopy text-white"
                : "border border-line bg-surface text-ink/70 hover:border-canopy/40"
            }`}
          >
            {label}
          </button>
        ))}
        {filters.dataSource === "fsbo" ? (
          <button
            type="button"
            onClick={() => {
              const next: Filters = { ...filters, dataSource: "" };
              setFilters(next);
              syncUrl(next);
            }}
            className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white"
          >
            By owner · clear
          </button>
        ) : (
          <Link
            href="/owner/new"
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink/70 hover:border-canopy/40"
          >
            List your property
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["RESIDENTIAL", "Residential"],
            ["COMMERCIAL", "Commercial"],
            ["ALL", "All types"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              const next = {
                ...filters,
                segment: value,
                minBeds: value === "COMMERCIAL" ? "" : filters.minBeds,
              };
              setFilters(next);
              syncUrl(next);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              filters.segment === value
                ? "bg-ink text-white"
                : "border border-line bg-surface text-ink/70 hover:border-canopy/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        data-search-bar
        className="flex flex-col gap-3 rounded-md border border-line bg-surface/90 p-4 md:flex-row md:items-end"
      >
        <div className="flex-1 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink/50">
            Address search
          </label>
          <AddressAutocomplete
            transactionType={
              filters.transactionType === "LEASE" ||
              filters.transactionType === "SALE"
                ? filters.transactionType
                : undefined
            }
            onPlaceSelect={onPlaceSelect}
            onSearchSubmit={onBarSearchSubmit}
          />
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-5">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
            City
            <Input
              value={filters.city}
              onChange={(e) =>
                setFilters((f) => ({ ...f, city: e.target.value }))
              }
              placeholder="Toronto"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Community
            <Input
              value={filters.community}
              onChange={(e) =>
                setFilters((f) => ({ ...f, community: e.target.value }))
              }
              placeholder="The Beaches"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
            {isLease ? "Min rent" : "Min price"}
            <Input
              value={filters.minPrice}
              onChange={(e) =>
                setFilters((f) => ({ ...f, minPrice: e.target.value }))
              }
              placeholder={isLease ? "2500" : "500000"}
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
            {isLease ? "Max rent" : "Max price"}
            <Input
              value={filters.maxPrice}
              onChange={(e) =>
                setFilters((f) => ({ ...f, maxPrice: e.target.value }))
              }
              placeholder={isLease ? "4500" : "2000000"}
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Beds
            <Input
              value={filters.minBeds}
              onChange={(e) =>
                setFilters((f) => ({ ...f, minBeds: e.target.value }))
              }
              placeholder="3"
              disabled={filters.segment === "COMMERCIAL"}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isLease ? (
            <Button
              type="button"
              variant={filters.openHouseOnly ? "default" : "secondary"}
              size="sm"
              onClick={() => {
                const next = {
                  ...filters,
                  openHouseOnly: !filters.openHouseOnly,
                };
                setFilters(next);
                syncUrl(next);
              }}
            >
              Open houses
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              syncUrl(filters);
              void load();
            }}
          >
            Apply
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-ink/60">
        <p>
          {pending
            ? "Updating…"
            : `${total} ${
                filters.segment === "COMMERCIAL"
                  ? "properties"
                  : isLease
                    ? "rentals"
                    : "homes"
              }`}
          {provider === "mock" ? " · demo data" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SaveSearchButton
            signedIn={signedIn}
            query={{
              segment:
                filters.segment !== "RESIDENTIAL" ? filters.segment : undefined,
              transactionType:
                filters.transactionType !== "ALL"
                  ? filters.transactionType
                  : undefined,
              dataSource: filters.dataSource || undefined,
              city: filters.city || undefined,
              community: filters.community || undefined,
              minPrice: filters.minPrice || undefined,
              maxPrice: filters.maxPrice || undefined,
              minBeds: filters.minBeds || undefined,
              openHouseOnly: filters.openHouseOnly ? "1" : undefined,
              status: filters.status !== "ACTIVE" ? filters.status : undefined,
            }}
          />
          <WatchAreaButton
            signedIn={signedIn}
            city={filters.city}
            community={filters.community || undefined}
            transactionType={filters.transactionType}
            segment={filters.segment}
          />
          <div className="flex gap-2">
            {statusOptions.map((statusOption) => (
              <button
                key={statusOption}
                type="button"
                className={
                  filters.status === statusOption
                    ? statusOption === "SOLD" || statusOption === "LEASED"
                      ? "font-semibold text-danger"
                      : "font-semibold text-canopy"
                    : "text-ink/50 hover:text-ink"
                }
                onClick={() => {
                  const next = { ...filters, status: statusOption };
                  setFilters(next);
                  syncUrl(next);
                }}
              >
                {statusOption === "ALL"
                  ? "All"
                  : statusOption === "SOLD"
                    ? "Sold"
                    : statusOption === "LEASED"
                      ? "Leased"
                      : statusOption === "UNLISTED"
                        ? "Unlisted"
                        : isLease
                          ? "For lease"
                          : "For sale"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <SearchMap
          listings={items}
          activeMls={activeMls}
          focus={focus}
          onSelect={setActiveMls}
          onBoundsChange={setBounds}
        />
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {items.map((listing) => (
            <ListingCard
              key={listing.mlsNumber}
              listing={listing}
              active={listing.mlsNumber === activeMls}
              onFocus={() => setActiveMls(listing.mlsNumber)}
              lockedPreview={
                !signedIn && listing.status !== "ACTIVE" ? "link" : false
              }
            />
          ))}
          {items.length === 0 && !pending ? (
            <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink/55">
              No listings match these filters. Pan the map or clear filters.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
