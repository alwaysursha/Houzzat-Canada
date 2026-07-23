"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

type Mode = "buy" | "rent" | "sell";

export function HomeHeroSearch() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("buy");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AutocompleteSuggestion | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function searchParamsForMode(suggestion?: AutocompleteSuggestion | null) {
    const params = new URLSearchParams({
      transactionType: mode === "rent" ? "LEASE" : "SALE",
    });
    if (suggestion?.city) params.set("city", suggestion.city);
    if (suggestion?.lat != null && suggestion?.lng != null) {
      params.set("lat", String(suggestion.lat));
      params.set("lng", String(suggestion.lng));
    }
    return params;
  }

  function onSearchPlace(suggestion: AutocompleteSuggestion) {
    setSelected(suggestion);
    setQuery(
      suggestion.city && suggestion.province
        ? `${suggestion.label}, ${suggestion.city}, ${suggestion.province}`
        : suggestion.label,
    );
    if (suggestion.mlsNumber) {
      router.push(`/listing/${suggestion.mlsNumber}`);
      return;
    }
    if (suggestion.lat != null && suggestion.lng != null) {
      router.push(`/search?${searchParamsForMode(suggestion).toString()}`);
      return;
    }
    const params = searchParamsForMode();
    params.set("q", suggestion.label);
    router.push(`/search?${params.toString()}`);
  }

  function onSellPlace(suggestion: AutocompleteSuggestion) {
    setSelected(suggestion);
    setQuery(
      suggestion.city && suggestion.province
        ? `${suggestion.label}, ${suggestion.city}, ${suggestion.province}`
        : suggestion.label,
    );
  }

  function onInventorySearch() {
    const q = query.trim();
    if (!q) {
      router.push(
        `/search?transactionType=${mode === "rent" ? "LEASE" : "SALE"}`,
      );
      return;
    }
    if (selected?.mlsNumber) {
      router.push(`/listing/${selected.mlsNumber}`);
      return;
    }
    if (selected?.lat != null && selected?.lng != null) {
      router.push(`/search?${searchParamsForMode(selected).toString()}`);
      return;
    }
    const params = searchParamsForMode();
    params.set("q", q);
    router.push(`/search?${params.toString()}`);
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
    <div className="relative z-50 w-full max-w-2xl">
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
                mode === value
                  ? "font-semibold text-white"
                  : "font-medium text-white/65 hover:text-white/90",
              )}
            >
              {label}
              {mode === value ? (
                <span className="mt-1 block h-0.5 rounded-full bg-white" />
              ) : (
                <span className="mt-1 block h-0.5 rounded-full bg-transparent" />
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl bg-white/90 p-3 shadow-lg backdrop-blur-md sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1">
            <AddressAutocomplete
              key={mode}
              initialQuery={query}
              fillOnly={mode === "sell"}
              minChars={mode === "sell" ? 2 : 1}
              source={mode === "sell" ? "google" : "listings"}
              transactionType={
                mode === "buy" ? "SALE" : mode === "rent" ? "LEASE" : undefined
              }
              placeholder={
                mode === "sell"
                  ? "Enter your home address with unit# (if applicable)"
                  : mode === "rent"
                    ? "Search rentals by address, neighbourhood, or MLS®"
                    : "Search address, neighbourhood, or MLS® number"
              }
              inputClassName="border-0 bg-transparent shadow-none focus-visible:ring-0"
              onQueryChange={(value) => {
                setQuery(value);
                setSelected(null);
              }}
              onPlaceSelect={isInventory ? onSearchPlace : onSellPlace}
            />
          </div>
          <Button
            type="button"
            className="h-11 w-full shrink-0 sm:w-[8.75rem]"
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
          <p className="text-xs leading-relaxed text-white/70">
            Estimated value is pulled using technology. For a precise valuation,
            book an appointment with us.
          </p>
          {error ? (
            <p className="mt-1 text-xs font-medium text-amber-200">{error}</p>
          ) : null}
        </div>
      ) : error ? (
        <p className="mt-2 text-xs font-medium text-amber-200">{error}</p>
      ) : null}
    </div>
  );
}
