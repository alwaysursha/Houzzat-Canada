"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import { pushLocalRecentSearch } from "@/lib/listings/recent-searches-local";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

type Mode = "buy" | "rent" | "sell";

/** `hero` = white type on green photo; `page` = ink type on soft mint wash (mobile). */
type SearchSurface = "hero" | "page";

export function HomeHeroSearch({
  surface = "hero",
}: {
  surface?: SearchSurface;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("buy");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AutocompleteSuggestion | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onPage = surface === "page";

  function txn() {
    return mode === "rent" ? "LEASE" : "SALE";
  }

  function searchParamsForMode(suggestion?: AutocompleteSuggestion | null) {
    const params = new URLSearchParams({
      transactionType: txn(),
    });
    if (suggestion?.city) params.set("city", suggestion.city);
    if (suggestion?.community) params.set("community", suggestion.community);
    if (suggestion?.lat != null && suggestion?.lng != null) {
      params.set("lat", String(suggestion.lat));
      params.set("lng", String(suggestion.lng));
    }
    return params;
  }

  function goHref(href: string, label: string) {
    pushLocalRecentSearch({ label, href });
    router.push(href);
  }

  function onSearchPlace(suggestion: AutocompleteSuggestion) {
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
      goHref(
        `/search?${searchParamsForMode(suggestion).toString()}`,
        suggestion.label,
      );
      return;
    }
    const params = searchParamsForMode();
    params.set("q", suggestion.label);
    goHref(`/search?${params.toString()}`, suggestion.label);
  }

  function onSellPlace(suggestion: AutocompleteSuggestion) {
    setSelected(suggestion);
    setQuery(
      suggestion.city && suggestion.province
        ? `${suggestion.label}, ${suggestion.city}, ${suggestion.province}`
        : suggestion.label,
    );
  }

  function onInventorySearch(rawQuery?: string) {
    const q = (rawQuery ?? query).trim();
    if (!q) {
      router.push(`/search?transactionType=${txn()}`);
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
      goHref(
        `/search?${searchParamsForMode(selected).toString()}`,
        selected.label,
      );
      return;
    }

    const parsed = parseSearchQuery(q);
    if (!parsed.transactionType) {
      parsed.transactionType = txn();
      parsed.hasFilters = true;
    }
    const href = searchHrefFromParsed(parsed, { transactionType: txn() });
    goHref(href, q);
  }

  async function onGetEstimate() {
    const address = query.trim();
    if (address.length < 3) {
      setError("Enter your home address to continue.");
      return;
    }

    setPending(true);
    setError(null);

    const city =
      selected?.city ??
      address
        .split(",")
        .map((part) => part.trim())
        .find((part) =>
          /toronto|mississauga|brampton|markham|vaughan|oakville|burlington|richmond hill/i.test(
            part,
          ),
        ) ??
      "Toronto";

    try {
      const res = await fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          city,
          intent: "sell",
          quick: true,
          ...loadPersistedUtm(),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        leadId?: string;
        estimate?: { low: number; high: number; disclaimer: string };
      };

      if (!res.ok || !data.estimate || !data.leadId) {
        setError(data.error ?? "Could not start your estimate.");
        setPending(false);
        return;
      }

      const params = new URLSearchParams({
        address,
        city,
        leadId: data.leadId,
        low: String(data.estimate.low),
        high: String(data.estimate.high),
        from: "hero",
      });
      router.push(`/home-valuation?${params.toString()}`);
    } catch {
      setError("Could not start your estimate.");
      setPending(false);
    }
  }

  const isInventory = mode === "buy" || mode === "rent";

  return (
    <div className="relative z-50 w-full max-w-3xl">
      <div className="overflow-visible">
        <div className="flex gap-1 px-1 pb-2">
          {(
            [
              ["buy", "Buy a Home"],
              ["rent", "Rent a Home"],
              ["sell", "Sell a Home"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setError(null);
                setSelected(null);
                setQuery("");
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                onPage
                  ? mode === value
                    ? "font-semibold text-ink"
                    : "font-medium text-ink/50 hover:text-ink/80"
                  : mode === value
                    ? "font-semibold text-white"
                    : "font-medium text-white/65 hover:text-white/90",
              )}
            >
              {label}
              {mode === value ? (
                <span
                  className={cn(
                    "mt-1 block h-0.5 rounded-full",
                    onPage ? "bg-canopy" : "bg-white",
                  )}
                />
              ) : (
                <span className="mt-1 block h-0.5 rounded-full bg-transparent" />
              )}
            </button>
          ))}
        </div>

        <div
          data-search-bar
          className={cn(
            "flex flex-col gap-1.5 rounded-md p-1.5 sm:flex-row sm:items-stretch sm:gap-2 sm:p-2.5",
            onPage
              ? "border border-line bg-surface shadow-sm"
              : "bg-white/90 shadow-lg backdrop-blur-md",
          )}
        >
          <div className="min-w-0 flex-1">
            <AddressAutocomplete
              key={mode}
              initialQuery={query}
              fillOnly={mode === "sell"}
              minChars={mode === "sell" ? 2 : 1}
              source={mode === "sell" ? "google" : "listings"}
              closeWhenHiddenBehindHeader
              transactionType={
                mode === "buy" ? "SALE" : mode === "rent" ? "LEASE" : undefined
              }
              placeholder={
                mode === "sell"
                  ? "Enter your home address with unit# (if applicable)"
                  : mode === "rent"
                    ? "Search rentals by address, neighbourhood, or MLS®"
                    : "Search active or sold listings by MLS® #, address or neighbourhood"
              }
              inputClassName="h-9 rounded-md border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 sm:h-11 sm:text-[15px]"
              onQueryChange={(value) => {
                setQuery(value);
                setSelected(null);
              }}
              onPlaceSelect={isInventory ? onSearchPlace : onSellPlace}
              onPlaceResolved={
                isInventory
                  ? (place) => {
                      setSelected(place);
                    }
                  : undefined
              }
              onSearchSubmit={
                isInventory ? (q) => onInventorySearch(q) : undefined
              }
            />
          </div>
          <Button
            type="button"
            className={
              isInventory
                ? "hidden h-9 w-full shrink-0 rounded-md sm:inline-flex sm:h-11 sm:w-[8.75rem]"
                : "h-9 w-full shrink-0 rounded-md sm:h-11 sm:w-[8.75rem]"
            }
            disabled={pending}
            onClick={() => {
              if (isInventory) onInventorySearch();
              else void onGetEstimate();
            }}
          >
            {isInventory
              ? "Search"
              : pending
                ? "Estimating…"
                : "Get Estimate"}
          </Button>
        </div>
      </div>

      {mode === "sell" ? (
        <div className="mt-2 min-h-[2.5rem]">
          <p
            className={cn(
              "text-xs leading-relaxed",
              onPage ? "text-ink/55" : "text-white/70",
            )}
          >
            Estimated value is pulled using technology. For a precise valuation,
            book an appointment with us.
          </p>
          {error ? (
            <p
              className={cn(
                "mt-1 text-xs font-medium",
                onPage ? "text-amber-800" : "text-amber-200",
              )}
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : error ? (
        <p
          className={cn(
            "mt-2 text-xs font-medium",
            onPage ? "text-amber-800" : "text-amber-200",
          )}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
