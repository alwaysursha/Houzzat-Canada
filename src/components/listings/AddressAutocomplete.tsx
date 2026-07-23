"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AddressAutocomplete({
  initialQuery = "",
  className,
  inputClassName,
  placeholder = "Search address, MLS® #, city, or community",
  minChars = 1,
  transactionType,
  source = "listings",
  onPlaceSelect,
  onQueryChange,
  fillOnly = false,
}: {
  initialQuery?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  minChars?: number;
  /** When set, only suggest ACTIVE listings of this transaction type. */
  transactionType?: "SALE" | "LEASE";
  /**
   * `listings` — inventory / MLS search (buy & rent).
   * `google` — real-world addresses via Places (sell & valuation).
   */
  source?: "listings" | "google";
  onPlaceSelect?: (suggestion: AutocompleteSuggestion) => void;
  onQueryChange?: (query: string) => void;
  /** When true, selecting a hint fills the field without navigating. */
  fillOnly?: boolean;
}) {
  const router = useRouter();
  const sessionToken = useId().replace(/:/g, "");
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  /** While query matches a just-selected address, do not refetch or reopen. */
  const selectedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (
      selectedQueryRef.current !== null &&
      query.trim() === selectedQueryRef.current.trim()
    ) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const min = source === "google" ? Math.max(minChars, 2) : minChars;
    if (query.trim().length < min) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        if (source === "google") {
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
        } else {
          const params = new URLSearchParams({ q: query.trim() });
          if (transactionType) {
            params.set("transactionType", transactionType);
          }
          const res = await fetch(`/api/listings/autocomplete?${params}`);
          const data = (await res.json()) as {
            suggestions: AutocompleteSuggestion[];
          };
          if (
            selectedQueryRef.current !== null &&
            query.trim() === selectedQueryRef.current.trim()
          ) {
            return;
          }
          setSuggestions(data.suggestions);
          setOpen(data.suggestions.length > 0);
        }
      } finally {
        setLoading(false);
      }
    }, source === "google" ? 220 : 120);

    return () => window.clearTimeout(handle);
  }, [query, minChars, transactionType, source, sessionToken]);

  async function choose(suggestion: AutocompleteSuggestion) {
    setOpen(false);
    setSuggestions([]);

    let resolved = suggestion;

    if (source === "google" && suggestion.placeId) {
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
        if (data.place) resolved = data.place;
      } finally {
        setLoading(false);
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
    if (onPlaceSelect) {
      onPlaceSelect(resolved);
      return;
    }
    if (fillOnly) return;
    if (resolved.href) {
      router.push(resolved.href);
    }
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <Input
        value={query}
        onChange={(event) => {
          selectedQueryRef.current = null;
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
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        className={inputClassName}
        autoComplete="street-address"
      />
      {loading ? (
        <span className="absolute right-3 top-3 text-xs text-ink/40">…</span>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface py-2 shadow-lg">
          {suggestions.map((suggestion) => (
            <li
              key={`${suggestion.type}-${suggestion.placeId ?? suggestion.mlsNumber ?? suggestion.label}-${suggestion.subtitle ?? ""}`}
            >
              <button
                type="button"
                className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-mist"
                onClick={() => void choose(suggestion)}
              >
                <span className="text-sm font-semibold text-ink">
                  {suggestion.label}
                </span>
                {suggestion.subtitle ? (
                  <span className="mt-0.5 text-xs text-ink/55">
                    {suggestion.subtitle}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
