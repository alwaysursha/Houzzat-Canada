"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

/** Buy-only search that slides into the header after the homepage hero scrolls away. */
export function HeaderBuySearch() {
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AutocompleteSuggestion | null>(null);

  useEffect(() => {
    if (pathname !== "/") {
      setVisible(false);
      return;
    }

    const hero = document.getElementById("home-hero");
    if (!hero) {
      setVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      {
        // Trigger once the sticky header has covered the hero top edge.
        root: null,
        threshold: 0,
        rootMargin: "-135px 0px 0px 0px",
      },
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, [pathname]);

  function goToSuggestion(suggestion: AutocompleteSuggestion) {
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
      const params = new URLSearchParams({
        transactionType: "SALE",
        lat: String(suggestion.lat),
        lng: String(suggestion.lng),
      });
      if (suggestion.city) params.set("city", suggestion.city);
      router.push(`/search?${params.toString()}`);
      return;
    }
    router.push(
      `/search?transactionType=SALE&q=${encodeURIComponent(suggestion.label)}`,
    );
  }

  function onSearch() {
    const q = query.trim();
    if (!q) {
      router.push("/search?transactionType=SALE");
      return;
    }
    if (selected?.mlsNumber) {
      router.push(`/listing/${selected.mlsNumber}`);
      return;
    }
    if (selected?.lat != null && selected?.lng != null) {
      const params = new URLSearchParams({
        transactionType: "SALE",
        lat: String(selected.lat),
        lng: String(selected.lng),
      });
      if (selected.city) params.set("city", selected.city);
      router.push(`/search?${params.toString()}`);
      return;
    }
    router.push(`/search?transactionType=SALE&q=${encodeURIComponent(q)}`);
  }

  return (
    <div
      className={cn(
        "min-w-0 transition-[max-width,opacity,transform,margin] duration-300 ease-out",
        visible
          ? "ml-3 w-full max-w-xl flex-none translate-y-0 overflow-visible opacity-100"
          : "pointer-events-none ml-0 max-w-0 flex-none -translate-y-1 overflow-hidden opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-line bg-surface/95 p-1 shadow-sm backdrop-blur transition-transform duration-300 ease-out",
          visible ? "scale-100" : "scale-95",
        )}
      >
        <div className="min-w-0 flex-1">
          <AddressAutocomplete
            minChars={1}
            transactionType="SALE"
            placeholder="Search homes for sale"
            inputClassName="h-9 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
            onQueryChange={(value) => {
              setQuery(value);
              setSelected(null);
            }}
            onPlaceSelect={goToSuggestion}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 px-4"
          tabIndex={visible ? 0 : -1}
          onClick={onSearch}
        >
          Search
        </Button>
      </div>
    </div>
  );
}
